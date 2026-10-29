/**
 * Gera uma cotação de demonstração concluída para inspeção visual do link
 * público, e permite removê-la depois.
 *
 * Uso:
 *   pnpm tsx scripts/demo-quote.ts            # cria e imprime o token
 *   pnpm tsx scripts/demo-quote.ts cleanup    # remove o que foi criado
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { indicators, quoteEvents, quoteRequests } from "../drizzle/schema";
import * as db from "../server/db";
import { getDb } from "../server/db";
import { readFile, writeFile } from "node:fs/promises";

const IDS_FILE = "/tmp/demo-quote-ids.json";

async function cleanup() {
  const raw = await readFile(IDS_FILE, "utf8").catch(() => "");
  if (!raw) {
    console.log("Nada para remover.");
    return;
  }
  const { quoteId } = JSON.parse(raw) as { quoteId: number };
  const database = await getDb();
  if (!database) return;
  await database.delete(quoteEvents).where(eq(quoteEvents.requestId, quoteId));
  await database.delete(quoteRequests).where(eq(quoteRequests.id, quoteId));
  await database.delete(indicators).where(inArray(indicators.name, ["Demonstração"]));
  console.log("Removido:", quoteId);
  await database.$client.end();
}

async function create() {
  const indicatorId = await db.createIndicator({
    name: "Demonstração",
    email: `demo-${Date.now()}@exemplo.invalid`,
    phone: null,
  });

  const publicToken = `demo${Date.now().toString(36)}`.padEnd(24, "0");
  const quoteId = await db.createQuoteRequest({
    publicToken,
    indicatorId,
    indicatorName: "Demonstração",
    vehicleType: "carro-utilitario-pequeno",
    plate: "TYR4B64",
    brand: "Hyundai",
    model: "HB20 Comfort 1.0 Flex 12V Mec.",
    modelYear: "2026",
    clientName: "Yatha Andrade",
    clientPhone: "81993146561",
    clientEmail: null,
    state: "PE",
    city: "Caruaru",
    leadSource: "Indicação",
    subOrigin: "Afiliado",
    notes: null,
    optionals: JSON.stringify(["Carro reserva", "Assistência 24 horas"]),
  });

  await db.updateQuote(quoteId, {
    status: "concluida",
    planName: "Ideal Top Passeio V2",
    monthlyPrice: "260.00",
    quoteNumber: "45670143",
    fipeValue: "79787.00",
    finishedAt: new Date(),
  });
  await db.addQuoteEvent(quoteId, "concluida", "Cotação concluída (registro de demonstração).");

  await writeFile(IDS_FILE, JSON.stringify({ quoteId, indicatorId }));
  console.log(`TOKEN=${publicToken}`);
  await (await getDb())?.$client.end();
}

const mode = process.argv[2];
(mode === "cleanup" ? cleanup() : create()).catch(error => {
  console.error(error);
  process.exit(1);
});