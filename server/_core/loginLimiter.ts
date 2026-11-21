/**
 * Limite simples de tentativas de login, em memória.
 * Vale para uma única instância da aplicação, que é o caso da VPS.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 30;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function hit(key: string, limit: number, now: number): boolean {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

/** Registra uma tentativa e retorna falso quando o limite foi excedido. */
export function allowLoginAttempt(email: string, ip: string, now = Date.now()): boolean {
  const byEmail = hit(`email:${email}`, MAX_ATTEMPTS_PER_EMAIL, now);
  const byIp = hit(`ip:${ip}`, MAX_ATTEMPTS_PER_IP, now);
  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }
  return byEmail && byIp;
}

/** Limpa o contador de um e-mail após login bem-sucedido. */
export function resetLoginAttempts(email: string): void {
  buckets.delete(`email:${email}`);
}
