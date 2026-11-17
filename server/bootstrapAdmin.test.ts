import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAdminFromEnv } from "./_core/bootstrapAdmin";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("administrador a partir do ambiente", () => {
  it("não faz nada sem ADMIN_EMAIL ou ADMIN_PASSWORD", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ensureAdminFromEnv()).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("recusa senha com menos de 8 caracteres sem tocar no banco", async () => {
    vi.stubEnv("ADMIN_EMAIL", "resp@example.com");
    vi.stubEnv("ADMIN_PASSWORD", "curta");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ensureAdminFromEnv();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("pelo menos 8 caracteres"));
  });
});
