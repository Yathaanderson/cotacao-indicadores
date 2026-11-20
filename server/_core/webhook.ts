/**
 * Envia eventos de cotação para um webhook externo (ex.: n8n), que decide
 * como avisar (WhatsApp, etc.). Só age se N8N_WEBHOOK_URL estiver definido.
 *
 * Nunca lança erro e tem tempo limite, para que um serviço fora do ar não
 * atrase a fila de cotações.
 */
export type WebhookEvent = Record<string, unknown> & { evento: string };

export async function notifyWebhook(payload: WebhookEvent): Promise<boolean> {
  const url = (process.env.N8N_WEBHOOK_URL ?? "").trim();
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`[Webhook] Recusado com status ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Webhook] Falha ao enviar evento:", error);
    return false;
  }
}
