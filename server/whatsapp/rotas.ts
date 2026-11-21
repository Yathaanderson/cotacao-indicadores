import { timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import { z } from "zod";
import * as db from "../db";
import {
  ESTADO_INICIAL,
  processarMensagem,
  type DadosPedido,
  type EstadoConversa,
  type Etapa,
} from "./fluxo";
import { criarPedidoWhatsapp } from "./pedido";

/**
 * Ponte entre o n8n e o aplicativo. O n8n recebe a mensagem do WhatsApp e chama
 * este endpoint com o número e o texto; a resposta volta para ser enviada ao
 * indicador. Quem chama precisa do token em WHATSAPP_BRIDGE_TOKEN.
 */

const entradaSchema = z.object({
  telefone: z.string().min(8).max(32),
  texto: z.string().max(1000),
});

export function tokenValido(recebido: string | undefined, esperado: string | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function lerDados(raw: string | null | undefined): Partial<DadosPedido> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<DadosPedido>;
  } catch {
    return {};
  }
}

/** Processa uma mensagem do indicador e devolve o texto da resposta. */
export async function tratarMensagemWhatsapp(
  telefone: string,
  texto: string
): Promise<{ resposta: string }> {
  const indicador = await db.getIndicatorByPhone(telefone);
  if (!indicador) {
    return { resposta: "Não encontrei um cadastro de indicador para este número. Fale com o responsável." };
  }
  if (!indicador.active) {
    return { resposta: "Seu acesso está desativado. Fale com o responsável." };
  }

  const salva = await db.getConversaWhatsapp(telefone);
  const estado: EstadoConversa = salva
    ? { etapa: (salva.etapa as Etapa) ?? "inicio", dados: lerDados(salva.dados) }
    : ESTADO_INICIAL;
  const pedidoAtual = salva?.pedidoId ?? null;

  const resultado = processarMensagem(estado, texto, {
    nomeIndicador: indicador.name.split(" ")[0] ?? indicador.name,
    pedidoId: pedidoAtual,
  });

  if (resultado.criar) {
    const pedidoId = await criarPedidoWhatsapp(indicador, resultado.criar);
    await db.salvarConversaWhatsapp({ telefone, etapa: "aguardando", dados: {}, pedidoId });
    return { resposta: `Pedido #${pedidoId} entrou na fila. Aviso aqui assim que a cotação sair.` };
  }

  await db.salvarConversaWhatsapp({
    telefone,
    etapa: resultado.estado.etapa,
    dados: resultado.estado.dados,
    pedidoId: pedidoAtual,
  });
  return { resposta: resultado.resposta };
}

export function registrarRotasWhatsapp(app: Express) {
  app.post("/api/whatsapp/mensagem", express.json({ limit: "16kb" }), async (req, res) => {
    const esperado = process.env.WHATSAPP_BRIDGE_TOKEN;
    if (!esperado) {
      res.status(503).json({ erro: "Integração WhatsApp não configurada." });
      return;
    }
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!tokenValido(bearer, esperado)) {
      res.status(401).json({ erro: "Não autorizado." });
      return;
    }
    const entrada = entradaSchema.safeParse(req.body);
    if (!entrada.success) {
      res.status(400).json({ erro: "Envie telefone e texto." });
      return;
    }
    try {
      const { resposta } = await tratarMensagemWhatsapp(entrada.data.telefone, entrada.data.texto);
      res.json({ resposta });
    } catch (error) {
      console.error("[WhatsApp] Falha ao tratar mensagem:", error);
      res.status(500).json({ erro: "Falha ao processar a mensagem." });
    }
  });
}
