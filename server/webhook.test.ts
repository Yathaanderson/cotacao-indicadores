import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyWebhook } from "./_core/webhook";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("webhook de cotações", () => {
  it("não faz nada quando N8N_WEBHOOK_URL não está definido", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(notifyWebhook({ evento: "teste" })).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia o evento em JSON e retorna true quando aceito", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example.com/webhook/cotacoes");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    await expect(notifyWebhook({ evento: "nova_cotacao", pedido: 7 })).resolves.toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://n8n.example.com/webhook/cotacoes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ evento: "nova_cotacao", pedido: 7 });
  });

  it("retorna false sem lançar erro quando o destino está fora do ar", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example.com/webhook/cotacoes");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));
    await expect(notifyWebhook({ evento: "falha" })).resolves.toBe(false);
  });
});
