import { nanoid } from "nanoid";
import * as db from "../db";
import { hashPassword } from "./password";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Garante que o responsável definido em ADMIN_EMAIL / ADMIN_PASSWORD exista
 * como administrador com senha.
 *
 * - Conta inexistente: é criada como administrador com a senha informada.
 * - Conta existente sem senha: recebe a senha e vira administrador.
 * - Conta existente com senha: a senha NÃO é trocada, para que uma alteração
 *   acidental no .env não derrube o acesso. Para trocar a senha, é preciso
 *   apagar o hash no banco ou usar um fluxo próprio de troca de senha.
 *
 * Sem ADMIN_EMAIL ou ADMIN_PASSWORD, não faz nada.
 */
export async function ensureAdminFromEnv(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Responsável";

  if (!email || !password) return;

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `[Bootstrap] ADMIN_PASSWORD precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres. Administrador não configurado.`
    );
    return;
  }

  const existing = await db.getUserByEmail(email);

  if (!existing) {
    await db.createLocalUser({
      openId: `local_${nanoid(21)}`,
      email,
      name,
      loginMethod: "email",
      passwordHash: await hashPassword(password),
      role: "admin",
      lastSignedIn: new Date(),
    });
    console.log(`[Bootstrap] Administrador criado a partir do ambiente (${email}).`);
    return;
  }

  const fields: { passwordHash?: string; role?: "admin" } = {};
  if (!existing.passwordHash) fields.passwordHash = await hashPassword(password);
  if (existing.role !== "admin") fields.role = "admin";

  if (Object.keys(fields).length > 0) {
    await db.updateUserAuth(existing.id, fields);
    console.log(`[Bootstrap] Conta do administrador ajustada (${email}).`);
  }
}
