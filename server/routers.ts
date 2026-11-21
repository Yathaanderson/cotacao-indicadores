import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { notifyNewQuote } from "./automation/worker";
import { getSessionCookieOptions } from "./_core/cookies";
import { hashPassword, verifyPassword } from "./_core/password";
import { LOCAL_SESSION_TTL_MS, signLocalSession } from "./_core/localSession";
import { allowLoginAttempt, resetLoginAttempts } from "./_core/loginLimiter";
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

const passwordSchema = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(200);
const indicatorWithPasswordInput = indicatorInput.extend({ password: passwordSchema });

/**
 * Garante a conta de login do indicador. Se já existe usuário com o e-mail,
 * usa essa conta e mantém a senha que ela já tem. Caso contrário, cria a conta
 * com a senha inicial informada pelo responsável.
 */
async function ensureIndicatorAccount(email: string, name: string, password: string): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const existingUser = await db.getUserByEmail(normalized);
  if (existingUser) {
    if (!existingUser.passwordHash) {
      await db.updateUserAuth(existingUser.id, { passwordHash: await hashPassword(password) });
    }
    return existingUser.id;
  }
  await db.createLocalUser({
    openId: `local_${nanoid(21)}`,
    email: normalized,
    name: name.trim(),
    loginMethod: "email",
    passwordHash: await hashPassword(password),
    role: "user",
    lastSignedIn: new Date(),
  });
  const created = await db.getUserByEmail(normalized);
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a conta." });
  return created.id;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      // Nunca devolver o hash da senha ao navegador.
      if (!ctx.user) return null;
      const { passwordHash: _omit, ...safeUser } = ctx.user;
      return safeUser;
    }),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().toLowerCase().email("E-mail inválido.").max(320),
          password: z.string().min(1, "Informe a senha.").max(200),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const ip = ctx.req.ip ?? ctx.req.socket.remoteAddress ?? "desconhecido";
        if (!allowLoginAttempt(input.email, ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
          });
        }

        const user = await db.getUserByEmail(input.email);
        const passwordOk = await verifyPassword(input.password, user?.passwordHash);
        // Mesma mensagem para e-mail inexistente e senha errada, para não revelar contas.
        if (!user || !passwordOk) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
        }

        resetLoginAttempts(input.email);
        await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
        const token = await signLocalSession(user.openId);
        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: LOCAL_SESSION_TTL_MS,
        });
        return { success: true } as const;
      }),
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

    createIndicator: adminProcedure.input(indicatorWithPasswordInput).mutation(async ({ input }) => {
      const existing = await db.getIndicatorByEmail(input.email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe um indicador com este e-mail.",
        });
      }
      const userId = await ensureIndicatorAccount(input.email, input.name, input.password);
      const id = await db.createIndicator({ ...input, userId });
      return { id };
    }),

    resetIndicatorPassword: adminProcedure
      .input(z.object({ id: z.number().int().positive(), password: passwordSchema }))
      .mutation(async ({ input }) => {
        const indicator = await db.getIndicatorById(input.id);
        if (!indicator) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Indicador não encontrado." });
        }
        const passwordHash = await hashPassword(input.password);
        if (indicator.userId) {
          await db.updateUserAuth(indicator.userId, { passwordHash });
        } else {
          const userId = await ensureIndicatorAccount(indicator.email, indicator.name, input.password);
          await db.linkIndicatorUser(indicator.id, userId);
        }
        return { success: true } as const;
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
