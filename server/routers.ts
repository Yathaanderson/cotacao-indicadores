import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { notifyNewQuote } from "./automation/worker";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

const quoteInput = z.object({
  vehicleType: z.string().min(1).max(80),
  plate: z
    .string()
    .min(7, "Informe a placa completa.")
    .max(10)
    .transform(value => value.replace(/\s+/g, "").toUpperCase()),
  brand: z.string().max(80).optional().nullable(),
  model: z.string().max(160).optional().nullable(),
  modelYear: z.string().max(12).optional().nullable(),
  clientName: z.string().min(3, "Informe o nome do cliente.").max(160),
  clientPhone: z.string().min(8, "Informe o celular do cliente.").max(20),
  clientEmail: z
    .string()
    .email("E-mail inválido.")
    .max(320)
    .optional()
    .nullable()
    .or(z.literal("")),
  state: z.string().length(2, "Use a sigla do estado."),
  city: z.string().min(2, "Informe a cidade.").max(120),
  leadSource: z.string().max(80).optional().nullable(),
  subOrigin: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  optionalIds: z.array(z.number().int().positive()).max(20).optional(),
});

const indicatorInput = z.object({
  name: z.string().min(3, "Informe o nome do indicador.").max(120),
  email: z.string().email("E-mail inválido.").max(320),
  phone: z.string().max(32).optional().nullable(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  profile: router({
    /** Usuário logado, vínculo com indicador e papel efetivo. */
    me: protectedProcedure.query(async ({ ctx }) => {
      const { user, indicator } = await db.resolveProfile(ctx.user);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        indicator: indicator
          ? {
              id: indicator.id,
              name: indicator.name,
              email: indicator.email,
              active: indicator.active,
            }
          : null,
      };
    }),
  }),

  quotes: router({
    optionals: protectedProcedure.query(async () => {
      return db.listOptionals(true);
    }),

    create: protectedProcedure.input(quoteInput).mutation(async ({ ctx, input }) => {
      const { indicator } = await db.resolveProfile(ctx.user);
      if (!indicator) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Sua conta ainda não está vinculada a um indicador. Peça ao responsável para liberar seu acesso.",
        });
      }
      if (!indicator.active) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seu acesso está desativado. Fale com o responsável.",
        });
      }

      const chosen = input.optionalIds?.length
        ? await db.listOptionals(true)
        : [];
      const selected = chosen
        .filter(optional => input.optionalIds?.includes(optional.id))
        .map(optional => optional.name);

      const publicToken = nanoid(24);
      const id = await db.createQuoteRequest({
        publicToken,
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        vehicleType: input.vehicleType,
        plate: input.plate,
        brand: input.brand ?? null,
        model: input.model ?? null,
        modelYear: input.modelYear ?? null,
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        clientEmail: input.clientEmail || null,
        state: input.state.toUpperCase(),
        city: input.city,
        leadSource: input.leadSource ?? null,
        subOrigin: input.subOrigin ?? null,
        notes: input.notes ?? null,
        optionals: selected.length ? JSON.stringify(selected) : null,
      });

      await db.addQuoteEvent(
        id,
        "pendente",
        `Solicitação criada por ${indicator.name} e colocada na fila.`
      );

      const created = await db.getQuoteById(id);
      if (created) {
        // O alerta é acessório: falha de notificação não impede o pedido.
        void notifyNewQuote(created);
      }

      return { id, publicToken };
    }),

    mine: protectedProcedure.query(async ({ ctx }) => {
      const { indicator } = await db.resolveProfile(ctx.user);
      if (!indicator) return [];
      const rows = await db.listQuotesByIndicator(indicator.id);
      return rows.map(quote => ({
        id: quote.id,
        publicToken: quote.publicToken,
        status: quote.status,
        vehicleType: quote.vehicleType,
        plate: quote.plate,
        brand: quote.brand,
        model: quote.model,
        clientName: quote.clientName,
        city: quote.city,
        state: quote.state,
        planName: quote.planName,
        monthlyPrice: quote.monthlyPrice,
        errorMessage: quote.errorMessage,
        createdAt: quote.createdAt,
        finishedAt: quote.finishedAt,
      }));
    }),

    byId: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const { user, indicator } = await db.resolveProfile(ctx.user);
        const quote = await db.getQuoteById(input.id);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
        }
        const isOwner = indicator?.id === quote.indicatorId;
        if (!isOwner && user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para ver esta cotação." });
        }
        const events = await db.listQuoteEvents(quote.id);
        return { quote, events };
      }),

    /** Link público: somente leitura e sem dados internos do indicador. */
    public: publicProcedure
      .input(z.object({ token: z.string().min(10).max(48) }))
      .query(async ({ input }) => {
        const quote = await db.getQuoteByToken(input.token);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
        }
        return db.toPublicQuote(quote);
      }),

    cancel: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const { user, indicator } = await db.resolveProfile(ctx.user);
        const quote = await db.getQuoteById(input.id);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
        }
        const isOwner = indicator?.id === quote.indicatorId;
        if (!isOwner && user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para cancelar." });
        }
        const cancelled = await db.cancelQuote(quote.id);
        if (cancelled) {
          await db.addQuoteEvent(quote.id, "cancelada", `Pedido cancelado por ${user.name ?? "usuário"}.`);
        }
        return { cancelled };
      }),
  }),

  admin: router({
    overview: adminProcedure.query(async () => {
      const [quotes, totals, paused, indicators, unlinked] = await Promise.all([
        db.listAllQuotes(),
        db.countsByStatus(),
        db.isAutomationPaused(),
        db.listIndicators(),
        db.countUnlinkedIndicators(),
      ]);
      const driverSetting = await db.getSetting(DRIVER_SETTING_KEY);
      return {
        quotes,
        totals,
        paused,
        indicators,
        unlinkedIndicators: unlinked,
        driver: (driverSetting || process.env.AUTOMATION_DRIVER || "simulado").toLowerCase(),
      };
    }),

    setPaused: adminProcedure
      .input(z.object({ paused: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setSetting(db.AUTOMATION_PAUSED_KEY, input.paused ? "true" : "false");
        return { paused: input.paused };
      }),

    createIndicator: adminProcedure.input(indicatorInput).mutation(async ({ input }) => {
      const existing = await db.getIndicatorByEmail(input.email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe um indicador com este e-mail.",
        });
      }
      const id = await db.createIndicator(input);
      return { id };
    }),

    setIndicatorActive: adminProcedure
      .input(z.object({ id: z.number().int().positive(), active: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setIndicatorActive(input.id, input.active);
        return { active: input.active };
      }),

    setOptionalActive: adminProcedure
      .input(z.object({ id: z.number().int().positive(), active: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setOptionalActive(input.id, input.active);
        return { active: input.active };
      }),

    optionals: adminProcedure.query(async () => db.listOptionals(false)),

    retry: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const quote = await db.getQuoteById(input.id);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
        }
        if (quote.status !== "falha") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Só é possível reenviar cotações com falha.",
          });
        }
        await db.updateQuote(quote.id, {
          status: "pendente",
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
        });
        await db.addQuoteEvent(quote.id, "pendente", "Pedido devolvido à fila pelo responsável.");
        return { ok: true };
      }),
    /** Estado da conexão com o PowerCRM: conta, data e validade da sessão. */
    powercrm: adminProcedure.query(async () => {
      const [info, driverSetting] = await Promise.all([
        readSessionInfo(),
        db.getSetting(DRIVER_SETTING_KEY),
      ]);
      const driver = (driverSetting || process.env.AUTOMATION_DRIVER || "simulado").toLowerCase();
      return { info, driver };
    }),
    /**
     * Conecta o PowerCRM. Recebe e-mail e senha apenas para o login e guarda
     * somente a sessão resultante; a senha não é armazenada.
     */
    connectPowercrm: adminProcedure
      .input(
        z.object({
          email: z.string().email("Informe um e-mail válido."),
          password: z.string().min(4, "Informe a senha."),
          url: z.string().url().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const info = await connectPowerCrm(input);
          await db.setSetting(DRIVER_SETTING_KEY, "powercrm");
          return { ok: true as const, info };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),
    disconnectPowercrm: adminProcedure.mutation(async () => {
      await disconnectPowerCrm();
      await db.setSetting(DRIVER_SETTING_KEY, "simulado");
      return { ok: true as const };
    }),
    /** Alterna entre o executor simulado e o real. */
    setDriver: adminProcedure
      .input(z.object({ driver: z.enum(["simulado", "powercrm"]) }))
      .mutation(async ({ input }) => {
        await db.setSetting(DRIVER_SETTING_KEY, input.driver);
        return { driver: input.driver };
      }),
  }),
});

export type AppRouter = typeof appRouter;
import {
  connectPowerCrm,
  disconnectPowerCrm,
  readSessionInfo,
} from "./automation/powercrm-session";
import { DRIVER_SETTING_KEY } from "./automation/powercrm";
