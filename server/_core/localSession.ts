import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

/** Sessão de login por e-mail e senha: 30 dias. */
export const LOCAL_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function getSecretKey() {
  const secret = ENV.sessionSecret;
  if (!secret) throw new Error("JWT_SECRET não configurado");
  return new TextEncoder().encode(secret);
}

/** Assina um token de sessão local com o openId do usuário como `sub`. */
export async function signLocalSession(openId: string): Promise<string> {
  return new SignJWT({ kind: "local" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(openId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(LOCAL_SESSION_TTL_MS / 1000) + "s")
    .sign(getSecretKey());
}

/** Retorna o openId se o token for válido e de sessão local; caso contrário, nulo. */
export async function verifyLocalSession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== "local" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
