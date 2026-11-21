import { nanoid } from "nanoid";
import * as db from "../db";
import { notifyNewQuote } from "../automation/worker";
import type { DadosPedido } from "./fluxo";

/** Cria o pedido de cotação a partir da conversa do WhatsApp, pela mesma fila do painel. */
export async function criarPedidoWhatsapp(
  indicador: { id: number; name: string },
  dados: DadosPedido
): Promise<number> {
  const id = await db.createQuoteRequest({
    publicToken: nanoid(24),
    indicatorId: indicador.id,
    indicatorName: indicador.name,
    vehicleType: dados.tipo,
    plate: dados.placa,
    clientName: dados.nomeCliente,
    clientPhone: dados.celularCliente,
    clientEmail: dados.emailCliente,
    state: dados.uf,
    city: dados.cidade,
    leadSource: "Indicação",
    subOrigin: null,
    notes: dados.observacoes,
    optionals: null,
  });
  await db.addQuoteEvent(
    id,
    "pendente",
    `Solicitação criada por ${indicador.name} pelo WhatsApp e colocada na fila.`
  );
  const created = await db.getQuoteById(id);
  if (created) {
    // O alerta é acessório: falha de notificação não impede o pedido.
    void notifyNewQuote(created);
  }
  return id;
}
