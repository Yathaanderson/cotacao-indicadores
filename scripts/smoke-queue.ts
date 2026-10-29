/**
 * Verificação manual da fila com o executor simulado.
 *
 * Cria um indicador e uma cotação temporários, roda uma varredura da fila,
 * confere o resultado e apaga tudo no final — inclusive os eventos — para não
 * deixar resíduo no banco compartilhado.
 *
 * Uso: pnpm tsx scripts/smoke-queue.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { indicators, quoteEvents, quoteRequests } from "../drizzle/schema";
import { runOnce } from "../server/automation/worker";
import * as db from "../server/db";
import { getDb } from "../server/db";

async function main() {
  await db.seedOptionalsIfEmpty();

  const email = `smoke-${Date.now()}@exemplo.invalid`;
  const indicatorId = await db.createIndicator({
    name: "Teste interno",
    email,
    phone: null,
  });

  const publicToken = `smoke${Date.now()}`;
  const quoteId = await db.createQuoteRequest({
    publicToken,
    indicatorId,
    indicatorName: "Teste interno",
    vehicleType: "carro-utilitario-pequeno",
    plate: "SMK1T23",
    brand: "Hyundai",
    model: "HB20 Comfort",
    modelYear: "2024",
    clientName: "Cliente de teste",
    clientPhone: "81999999999",
    clientEmail: null,
    state: "PE",
    city: "Caruaru",
    leadSource: "Indicação",
    subOrigin: "Afiliado",
    notes: "Registro criado por um teste automatizado e removido em seguida.",
    optionals: JSON.stringify(["Carro reserva"]),
  });

  try {
    const processed = await runOnce();
    const quote = await db.getQuoteById(quoteId);

    console.log("Fila executou uma varredura:", processed);
    console.log("Status final:", quote?.status);
    console.log("Plano:", quote?.planName, "| Mensalidade:", quote?.monthlyPrice);

    const events = await db.listQuoteEvents(quoteId);
    console.log("Eventos registrados:", events.length);
    events.forEach(event => console.log(` - [${event.status}] ${event.message}`));

    if (quote?.status !== "concluida") {
      console.error("FALHA: a cotação não foi concluída pelo executor simulado.");
      process.exitCode = 1;
    }
  } finally {
    const database = await getDb();
    if (database) {
      await database.delete(quoteEvents).where(eq(quoteEvents.requestId, quoteId));
      await database.delete(quoteRequests).where(eq(quoteRequests.id, quoteId));
      await database.delete(indicators).where(eq(indicators.id, indicatorId));
      console.log("Dados de teste removidos.");
      // O pool do MySQL mantém o processo vivo; encerra explicitamente.
      await database.$client.end();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
