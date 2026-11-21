import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** Hash scrypt da senha (formato `scrypt$sal$hash`). Nulo para contas sem senha. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Indicadores: parceiros que pedem cotações. São criados pelo responsável
 * (administrador) por e-mail. Quando a pessoa entra com o mesmo e-mail, a
 * conta é vinculada automaticamente pelo userId.
 */
export const indicators = mysqlTable("indicators", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  userId: int("userId"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Indicator = typeof indicators.$inferSelect;

/**
 * Catálogo de opcionais que o indicador pode marcar. O plano em si é definido
 * automaticamente pelo PowerCRM conforme o tipo de veículo, por isso não há
 * escolha de plano no aplicativo.
 */
export const planOptionals = mysqlTable("planOptionals", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PlanOptional = typeof planOptionals.$inferSelect;

export const quoteStatusValues = [
  "pendente",
  "processando",
  "concluida",
  "falha",
  "cancelada",
] as const;

export type QuoteStatus = (typeof quoteStatusValues)[number];

/**
 * Solicitações de cotação. Cada linha guarda o que o indicador enviou e o que
 * a automação devolveu, com um token público único para o link compartilhável.
 */
export const quoteRequests = mysqlTable("quoteRequests", {
  id: int("id").autoincrement().primaryKey(),
  publicToken: varchar("publicToken", { length: 48 }).notNull().unique(),
  indicatorId: int("indicatorId").notNull(),
  /** Nome do indicador no momento do pedido, preservado como histórico. */
  indicatorName: varchar("indicatorName", { length: 120 }).notNull(),
  status: mysqlEnum("status", quoteStatusValues).default("pendente").notNull(),

  vehicleType: varchar("vehicleType", { length: 80 }).notNull(),
  plate: varchar("plate", { length: 12 }).notNull(),
  brand: varchar("brand", { length: 80 }),
  model: varchar("model", { length: 160 }),
  modelYear: varchar("modelYear", { length: 12 }),
  fipeValue: varchar("fipeValue", { length: 32 }),

  clientName: varchar("clientName", { length: 160 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 32 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }),

  state: varchar("state", { length: 2 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  leadSource: varchar("leadSource", { length: 80 }),
  subOrigin: varchar("subOrigin", { length: 80 }),
  notes: text("notes"),

  /** Nomes dos opcionais escolhidos, em JSON. */
  optionals: text("optionals"),

  planName: varchar("planName", { length: 160 }),
  monthlyPrice: varchar("monthlyPrice", { length: 32 }),
  quoteNumber: varchar("quoteNumber", { length: 40 }),
  shareUrl: varchar("shareUrl", { length: 512 }),
  negotiationId: varchar("negotiationId", { length: 40 }),

  errorMessage: text("errorMessage"),
  attempts: int("attempts").default(0).notNull(),
  alertedAt: timestamp("alertedAt"),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type InsertQuoteRequest = typeof quoteRequests.$inferInsert;

/** Trilha de auditoria: uma linha por transição de estado ou observação. */
export const quoteEvents = mysqlTable("quoteEvents", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuoteEvent = typeof quoteEvents.$inferSelect;

/** Configurações simples em chave/valor, como a pausa da automação. */
export const appSettings = mysqlTable("appSettings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Estado da conversa guiada pelo WhatsApp, uma linha por número de indicador.
 * `etapa` diz em qual pergunta a conversa está; `dados` guarda as respostas
 * já validadas, em JSON; `pedidoId` liga a conversa à cotação em andamento.
 */
export const whatsappConversas = mysqlTable("whatsappConversas", {
  telefone: varchar("telefone", { length: 20 }).primaryKey(),
  etapa: varchar("etapa", { length: 32 }).default("inicio").notNull(),
  dados: text("dados"),
  pedidoId: int("pedidoId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsappConversa = typeof whatsappConversas.$inferSelect;
