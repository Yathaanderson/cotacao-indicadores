import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyOwner } from "./_core/notification";
import { allowLoginAttempt, resetLoginAttempts } from "./_core/loginLimiter";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("alerta ao responsável por e-mail", () => {
  it("retorna falso sem lançar erro quando o SMTP não está configurado", async () => {
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("ADMIN_EMAIL", "resp@example.com");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(notifyOwner({ title: "Teste", content: "Corpo" })).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("retorna falso para título ou conteúdo vazio", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    await expect(notifyOwner({ title: "  ", content: "x" })).resolves.toBe(false);
  });
});

describe("limite de tentativas de login", () => {
  it("bloqueia depois de 5 tentativas para o mesmo e-mail", () => {
    const email = `limite-${Math.random()}@example.com`;
    const now = Date.now();
    const results = Array.from({ length: 6 }, () => allowLoginAttempt(email, "10.0.0.1", now));
    expect(results.slice(0, 5).every(Boolean)).toBe(true);
    expect(results[5]).toBe(false);
    resetLoginAttempts(email);
    expect(allowLoginAttempt(email, "10.0.0.2", now)).toBe(true);
  });
});
