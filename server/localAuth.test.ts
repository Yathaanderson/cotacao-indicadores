import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "./_core/password";
import { signLocalSession, verifyLocalSession } from "./_core/localSession";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("senha com scrypt", () => {
  it("aceita a senha correta e recusa a errada", async () => {
    const hash = await hashPassword("senha-forte-123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("senha-forte-123", hash)).toBe(true);
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });

  it("gera saltos diferentes para a mesma senha", async () => {
    expect(await hashPassword("mesma")).not.toBe(await hashPassword("mesma"));
  });

  it("recusa hash ausente ou malformado", async () => {
    expect(await verifyPassword("qualquer", null)).toBe(false);
    expect(await verifyPassword("qualquer", "texto-sem-formato")).toBe(false);
  });
});

describe("sessão de login próprio", () => {
  it("valida o token assinado e devolve o openId", async () => {
    vi.stubEnv("JWT_SECRET", "chave-de-teste-local");
    const token = await signLocalSession("local_abc");
    expect(await verifyLocalSession(token)).toBe("local_abc");
  });

  it("recusa token assinado com outra chave", async () => {
    vi.stubEnv("JWT_SECRET", "chave-a");
    const token = await signLocalSession("local_abc");
    vi.stubEnv("JWT_SECRET", "chave-b");
    expect(await verifyLocalSession(token)).toBeNull();
  });

  it("recusa ausência de token", async () => {
    expect(await verifyLocalSession(undefined)).toBeNull();
  });
});
