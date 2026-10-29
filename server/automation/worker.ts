import type { QuoteRequest } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import * as db from "../db";
import { createDriver } from "./powercrm";

const POLL_INTERVAL_MS = Number(process.env.AUTOMATION_POLL_MS ?? 5000);
const STALE_CHECK_INTERVAL_MS = 60_000;

let started = false;
let busy = false;
let lastStaleCheck = 0;

const money = (value: string | null | undefined) => {
  if (!value) return null;
  const numeric = Number(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
  if (Number.isNaN(numeric)) return value;
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

async function safeNotify(title: string, content: string) {
  try {
    const accepted = await notifyOwner({ title, content });
    if (!accepted) {
      console.warn("[Alertas] Serviço de notificação não aceitou o alerta.");
    }
    return accepted;
  } catch (error) {
    // Alerta é acessório: nunca deve derrubar a cotação nem o worker.
    console.warn("[Alertas] Falha ao notificar o responsável:", error);
    return false;
  }
}

export async function notifyNewQuote(quote: QuoteRequest) {
  await safeNotify(
    "Nova cotação solicitada",
    [
      `Indicador: ${quote.indicatorName}`,
      `Veículo: ${quote.vehicleType} · placa ${quote.plate}`,
      `Cliente: ${quote.clientName} (${quote.clientPhone})`,
      `${quote.city}/${quote.state}`,
      `Pedido #${quote.id} entrou na fila.`,
    ].join("\n")
  );
}

async function notifyOutcome(quote: QuoteRequest, result: "concluida" | "falha") {
  if (result === "concluida") {
    await safeNotify(
      "Cotação concluída",
      [
        `Indicador: ${quote.indicatorName}`,
        `Veículo: ${quote.vehicleType} · placa ${quote.plate}`,
        `Plano: ${quote.planName ?? "não informado"}`,
        `Mensalidade: ${money(quote.monthlyPrice) ?? "não informada"}`,
        quote.quoteNumber ? `Cotação nº ${quote.quoteNumber}` : null,
        `Pedido #${quote.id}.`,
      ]
        .filter(Boolean)
        .join("\n")
    );
    return;
  }

  await safeNotify(
    "Cotação com falha",
    [
      `Indicador: ${quote.indicatorName}`,
      `Veículo: ${quote.vehicleType} · placa ${quote.plate}`,
      `Motivo: ${quote.errorMessage ?? "não informado"}`,
      `Pedido #${quote.id} precisa de atenção no painel.`,
    ].join("\n")
  );
}

async function processQuote(quote: QuoteRequest) {
  const driver = createDriver();
  const log = async (message: string) => {
    await db.addQuoteEvent(quote.id, "processando", message);
  };

  await db.addQuoteEvent(
    quote.id,
    "processando",
    `Processamento iniciado com o executor "${driver.name}".`
  );

  try {
    const result = await driver.run({ quote, log });

    await db.updateQuote(quote.id, {
      status: "concluida",
      planName: result.planName,
      monthlyPrice: result.monthlyPrice,
      quoteNumber: result.quoteNumber || null,
      fipeValue: result.fipeValue ?? quote.fipeValue ?? null,
      shareUrl: result.shareUrl ?? null,
      negotiationId: result.negotiationId ?? null,
      errorMessage: null,
      finishedAt: new Date(),
    });

    await db.addQuoteEvent(
      quote.id,
      "concluida",
      result.simulated
        ? "Cotação concluída pelo executor simulado. Nenhum dado real do PowerCRM foi gerado."
        : `Cotação concluída no PowerCRM${result.quoteNumber ? ` com o número ${result.quoteNumber}` : ""}.`
    );

    const finished = await db.getQuoteById(quote.id);
    if (finished) await notifyOutcome(finished, "concluida");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.updateQuote(quote.id, {
      status: "falha",
      errorMessage: message,
      finishedAt: new Date(),
    });
    await db.addQuoteEvent(quote.id, "falha", `Falha no processamento: ${message}`);

    const failed = await db.getQuoteById(quote.id);
    if (failed) await notifyOutcome(failed, "falha");
  }
}

/** Executa uma varredura da fila. Retorna true quando processou um pedido. */
export async function runOnce(): Promise<boolean> {
  if (busy) return false;
  busy = true;

  try {
    if (await db.isAutomationPaused()) return false;

    if (Date.now() - lastStaleCheck > STALE_CHECK_INTERVAL_MS) {
      lastStaleCheck = Date.now();
      const requeued = await db.requeueStaleProcessing(15);
      if (requeued > 0) {
        console.log(`[Fila] ${requeued} pedido(s) travado(s) devolvido(s) à fila.`);
      }
    }

    const quote = await db.claimNextPending();
    if (!quote) return false;

    await processQuote(quote);
    return true;
  } catch (error) {
    console.error("[Fila] Erro na varredura:", error);
    return false;
  } finally {
    busy = false;
  }
}

/**
 * Inicia o laço da fila. Uma execução por vez garante que duas cotações nunca
 * usem o mesmo contexto de navegador ao mesmo tempo. O laço só começa uma vez
 * por processo.
 */
export function startAutomationWorker() {
  if (started) return;
  started = true;

  const timer = setInterval(() => {
    void runOnce();
  }, POLL_INTERVAL_MS);

  // Não impede o processo de encerrar quando o servidor for desligado.
  timer.unref?.();

  console.log(
    `[Fila] Worker iniciado (intervalo ${POLL_INTERVAL_MS} ms, executor "${(process.env.AUTOMATION_DRIVER ?? "simulado").toLowerCase()}").`
  );
}
