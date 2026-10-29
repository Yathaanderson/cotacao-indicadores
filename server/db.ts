import { and, asc, count, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  appSettings,
  indicators,
  InsertUser,
  planOptionals,
  quoteEvents,
  quoteRequests,
  users,
  type User,
  type QuoteStatus,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível");
  }
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await requireDb();

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function countAdmins(): Promise<number> {
  const db = await requireDb();
  const rows = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  return Number(rows[0]?.total ?? 0);
}

export async function setUserRole(userId: number, role: "user" | "admin") {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setUserEmail(userId: number, email: string | null) {
  const db = await requireDb();
  await db.update(users).set({ email }).where(eq(users.id, userId));
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                        */
/* ------------------------------------------------------------------ */

export async function listIndicators() {
  const db = await requireDb();
  return db.select().from(indicators).orderBy(asc(indicators.name));
}

export async function getIndicatorByEmail(email: string) {
  const db = await requireDb();
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(indicators)
    .where(sql`lower(${indicators.email}) = ${normalized}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function getIndicatorByUserId(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(indicators)
    .where(eq(indicators.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getIndicatorById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(indicators)
    .where(eq(indicators.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createIndicator(input: {
  name: string;
  email: string;
  phone?: string | null;
}) {
  const db = await requireDb();
  const result = await db.insert(indicators).values({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
  });
  return Number(result[0].insertId);
}

export async function setIndicatorActive(id: number, active: boolean) {
  const db = await requireDb();
  await db.update(indicators).set({ active }).where(eq(indicators.id, id));
}

export async function linkIndicatorUser(id: number, userId: number | null) {
  const db = await requireDb();
  await db.update(indicators).set({ userId }).where(eq(indicators.id, id));
}

/* ------------------------------------------------------------------ */
/* Opcionais                                                          */
/* ------------------------------------------------------------------ */

export async function listOptionals(onlyActive = false) {
  const db = await requireDb();
  const query = db.select().from(planOptionals);
  const rows = onlyActive
    ? await query
        .where(eq(planOptionals.active, true))
        .orderBy(asc(planOptionals.sortOrder), asc(planOptionals.name))
    : await query.orderBy(asc(planOptionals.sortOrder), asc(planOptionals.name));
  return rows;
}

export async function setOptionalActive(id: number, active: boolean) {
  const db = await requireDb();
  await db.update(planOptionals).set({ active }).where(eq(planOptionals.id, id));
}

export async function seedOptionalsIfEmpty() {
  const db = await requireDb();
  const rows = await db.select({ total: count() }).from(planOptionals);
  if (Number(rows[0]?.total ?? 0) > 0) return false;

  await db.insert(planOptionals).values([
    {
      name: "Carro reserva",
      description: "Veículo substituto enquanto o carro estiver na oficina.",
      sortOrder: 10,
    },
    {
      name: "Assistência 24 horas",
      description: "Reboque, pane seca e chaveiro em todo o território nacional.",
      sortOrder: 20,
    },
    {
      name: "Vidros e faróis",
      description: "Cobertura para vidros, faróis e retrovisores.",
      sortOrder: 30,
    },
    {
      name: "Terceiros e passageiros",
      description: "Amplia a cobertura para danos a terceiros e ocupantes.",
      sortOrder: 40,
    },
  ]);
  return true;
}

/* ------------------------------------------------------------------ */
/* Configurações                                                      */
/* ------------------------------------------------------------------ */

export async function getSetting(key: string): Promise<string | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = await requireDb();
  await db
    .insert(appSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export const AUTOMATION_PAUSED_KEY = "automation.paused";

export async function isAutomationPaused(): Promise<boolean> {
  return (await getSetting(AUTOMATION_PAUSED_KEY)) === "true";
}

/* ------------------------------------------------------------------ */
/* Cotações                                                           */
/* ------------------------------------------------------------------ */

export type NewQuoteInput = {
  publicToken: string;
  indicatorId: number;
  indicatorName: string;
  vehicleType: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  modelYear?: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  state: string;
  city: string;
  leadSource?: string | null;
  subOrigin?: string | null;
  notes?: string | null;
  optionals?: string | null;
};

export async function createQuoteRequest(input: NewQuoteInput): Promise<number> {
  const db = await requireDb();
  const result = await db.insert(quoteRequests).values({
    ...input,
    status: "pendente",
  });
  return Number(result[0].insertId);
}

export async function listQuotesByIndicator(indicatorId: number, limit = 60) {
  const db = await requireDb();
  return db
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.indicatorId, indicatorId))
    .orderBy(desc(quoteRequests.createdAt))
    .limit(limit);
}

export async function listAllQuotes(status?: QuoteStatus, limit = 120) {
  const db = await requireDb();
  const base = db.select().from(quoteRequests);
  const query = status
    ? base.where(eq(quoteRequests.status, status))
    : base;
  return query.orderBy(desc(quoteRequests.createdAt)).limit(limit);
}

export async function getQuoteById(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getQuoteByToken(token: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.publicToken, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateQuote(
  id: number,
  fields: Partial<typeof quoteRequests.$inferInsert>
) {
  const db = await requireDb();
  await db.update(quoteRequests).set(fields).where(eq(quoteRequests.id, id));
}

export async function addQuoteEvent(
  requestId: number,
  status: string,
  message: string
) {
  const db = await requireDb();
  await db.insert(quoteEvents).values({ requestId, status, message });
}

export async function listQuoteEvents(requestId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(quoteEvents)
    .where(eq(quoteEvents.requestId, requestId))
    .orderBy(asc(quoteEvents.createdAt));
}

/**
 * Reserva atômica do próximo pedido pendente. O UPDATE condicional garante que
 * dois processos nunca processem a mesma cotação: quem perder a corrida recebe
 * affectedRows = 0 e tenta o próximo candidato.
 */
export async function claimNextPending() {
  const db = await requireDb();
  const candidates = await db
    .select({ id: quoteRequests.id })
    .from(quoteRequests)
    .where(eq(quoteRequests.status, "pendente"))
    .orderBy(asc(quoteRequests.createdAt))
    .limit(5);

  for (const candidate of candidates) {
    const result = await db
      .update(quoteRequests)
      .set({
        status: "processando",
        startedAt: new Date(),
        errorMessage: null,
        attempts: sql`${quoteRequests.attempts} + 1`,
      })
      .where(
        and(
          eq(quoteRequests.id, candidate.id),
          eq(quoteRequests.status, "pendente")
        )
      );

    if (Number(result[0].affectedRows) === 1) {
      return getQuoteById(candidate.id);
    }
  }

  return null;
}

/**
 * Devolve à fila pedidos que ficaram presos em "processando" porque o processo
 * caiu no meio da execução. Evita cotação órfã.
 */
export async function requeueStaleProcessing(minutes = 15) {
  const db = await requireDb();
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const result = await db
    .update(quoteRequests)
    .set({
      status: "pendente",
      errorMessage: "Reprocessado após interrupção inesperada.",
    })
    .where(
      and(
        eq(quoteRequests.status, "processando"),
        lt(quoteRequests.startedAt, cutoff)
      )
    );
  return Number(result[0].affectedRows);
}

export async function cancelQuote(id: number) {
  const db = await requireDb();
  const result = await db
    .update(quoteRequests)
    .set({ status: "cancelada", finishedAt: new Date() })
    .where(
      and(
        eq(quoteRequests.id, id),
        sql`${quoteRequests.status} in ('pendente','falha')`
      )
    );
  return Number(result[0].affectedRows) === 1;
}

export async function countsByStatus() {
  const db = await requireDb();
  const rows = await db
    .select({ status: quoteRequests.status, total: count() })
    .from(quoteRequests)
    .groupBy(quoteRequests.status);
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = Number(row.total);
    return acc;
  }, {});
}

/* ------------------------------------------------------------------ */
/* Perfil do usuário logado                                           */
/* ------------------------------------------------------------------ */

/**
 * Garante o vínculo entre usuário autenticado e indicador. Também aplica o
 * bootstrap do administrador: o primeiro usuário a entrar vira administrador
 * quando ainda não existe nenhum. O evento fica registrado na trilha da
 * primeira cotação? Não: o bootstrap é registrado no console e no campo role.
 */
export async function resolveProfile(loggedUser: User) {
  let user = loggedUser;
  if (user.role !== "admin" && (await countAdmins()) === 0) {
    await setUserRole(user.id, "admin");
    console.log(
      `[Bootstrap] Primeiro usuário promovido a administrador (userId ${user.id})`
    );
    user = { ...user, role: "admin" };
  }

  let indicator = await getIndicatorByUserId(user.id);

  if (!indicator && user.email) {
    const invited = await getIndicatorByEmail(user.email);
    if (invited && invited.active && invited.userId === null) {
      await linkIndicatorUser(invited.id, user.id);
      indicator = { ...invited, userId: user.id };
    }
  }

  return { user, indicator };
}

/** Cotação sem dados internos do indicador, para o link público. */
export function toPublicQuote(quote: typeof quoteRequests.$inferSelect) {
  return {
    id: quote.id,
    publicToken: quote.publicToken,
    status: quote.status,
    vehicleType: quote.vehicleType,
    plate: quote.plate,
    brand: quote.brand,
    model: quote.model,
    modelYear: quote.modelYear,
    fipeValue: quote.fipeValue,
    clientName: quote.clientName,
    state: quote.state,
    city: quote.city,
    optionals: quote.optionals,
    planName: quote.planName,
    monthlyPrice: quote.monthlyPrice,
    quoteNumber: quote.quoteNumber,
    shareUrl: quote.shareUrl,
    createdAt: quote.createdAt,
    finishedAt: quote.finishedAt,
  };
}

/** Pendências antigas sem vínculo de indicador, para diagnóstico do admin. */
export async function countUnlinkedIndicators() {
  const db = await requireDb();
  const rows = await db
    .select({ total: count() })
    .from(indicators)
    .where(isNull(indicators.userId));
  return Number(rows[0]?.total ?? 0);
}
