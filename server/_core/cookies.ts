import type { CookieOptions, Request } from "express";

/**
 * Cookie de sessão. Como o app é servido no mesmo domínio, usa SameSite=Lax.
 * Em produção o cookie só trafega por HTTPS (o Caddy da VPS faz o TLS).
 */
export function getSessionCookieOptions(_req: Request): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}
