import * as db from "../db";

/**
 * Conexão com o PowerCRM.
 *
 * O PowerCRM não oferece API própria, então a automação usa a interface web.
 * Para isso é preciso uma sessão autenticada. Este módulo faz o login uma vez
 * com as credenciais do responsável e guarda apenas o estado da sessão
 * (cookies e armazenamento local) — a senha nunca é gravada.
 *
 * Quando a sessão expira, o executor falha com a mensagem "sessão expirada" e
 * o painel pede uma nova conexão.
 */

export const POWERCRM_SESSION_KEY = "powercrm.session";
export const POWERCRM_SESSION_INFO_KEY = "powercrm.session.info";
export const POWERCRM_URL_KEY = "powercrm.url";

/** Endereço padrão observado na operação. Pode ser trocado pelo painel. */
export const DEFAULT_POWERCRM_URL = "https://app.powercrm.com.br";

export type PowerCrmSessionInfo = {
  /** Nome ou e-mail da conta conectada, apenas para exibição. */
  account: string;
  connectedAt: string;
  lastCheckAt: string | null;
  /** "conectada" | "expirada" | "desconhecida" */
  status: "conectada" | "expirada" | "desconhecida";
};

export class PowerCrmSessionExpiredError extends Error {
  constructor(message = "A sessão do PowerCRM expirou. Reconecte pelo painel.") {
    super(message);
    this.name = "PowerCrmSessionExpiredError";
  }
}

export async function getPowerCrmUrl(): Promise<string> {
  const stored = await db.getSetting(POWERCRM_URL_KEY);
  return stored || process.env.POWERCRM_URL || DEFAULT_POWERCRM_URL;
}

/** Lê o estado de sessão guardado. Devolve null quando não há conexão. */
export async function readSessionState(): Promise<string | null> {
  const stored = await db.getSetting(POWERCRM_SESSION_KEY);
  if (stored) return stored;
  const fromEnv = process.env.POWERCRM_SESSION_STATE;
  if (fromEnv) {
    try {
      const { readFile } = await import("node:fs/promises");
      return await readFile(fromEnv, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

export async function readSessionInfo(): Promise<PowerCrmSessionInfo | null> {
  const raw = await db.getSetting(POWERCRM_SESSION_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PowerCrmSessionInfo;
  } catch {
    return null;
  }
}

/**
 * Faz o login e grava o estado da sessão. A senha é usada apenas nesta chamada
 * e descartada em seguida; nunca é persistida nem devolvida.
 */
export async function connectPowerCrm(input: {
  email: string;
  password: string;
  url?: string;
}): Promise<PowerCrmSessionInfo> {
  const baseUrl = input.url?.trim() || (await getPowerCrmUrl());
  const playwrightSpecifier = "playwright";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playwright: any = await import(/* @vite-ignore */ playwrightSpecifier);
  const { chromium } = playwright;

  const browser = await chromium.launch({ headless: true });
  let context: any = null;

  try {
    context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    // A tela real de login ("Acesse a sua conta") usa id="emailField" e
    // id="j_password", sem <label> associado. Por isso os seletores por id.
    const emailField = page.locator("#emailField").first();
    if (!(await emailField.count().catch(() => 0))) {
      throw new Error(
        "Não encontrei o campo de e-mail na tela de login. Confirme o endereço do PowerCRM."
      );
    }
    await emailField.click();
    await emailField.fill(input.email);

    const passwordField = page.locator("#j_password").first();
    if (!(await passwordField.count().catch(() => 0))) {
      throw new Error("Não encontrei o campo de senha na tela de login.");
    }
    await passwordField.click();
    await passwordField.fill(input.password);

    await page
      .locator('button:has-text("Acessar"), input[type="submit"]')
      .first()
      .click();
    await page.waitForTimeout(6000);

    const stillOnLogin = (await page.locator("#j_password").count().catch(() => 0)) > 0;
    if (stillOnLogin) {
      throw new Error(
        "O PowerCRM não aceitou o login. Confira o e-mail e a senha, ou se há verificação em duas etapas."
      );
    }

    const state = await context.storageState();
    const info: PowerCrmSessionInfo = {
      account: input.email,
      connectedAt: new Date().toISOString(),
      lastCheckAt: new Date().toISOString(),
      status: "conectada",
    };

    await db.setSetting(POWERCRM_URL_KEY, baseUrl);
    await db.setSetting(POWERCRM_SESSION_KEY, JSON.stringify(state));
    await db.setSetting(POWERCRM_SESSION_INFO_KEY, JSON.stringify(info));

    return info;
  } finally {
    if (context) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

/** Marca a sessão como expirada para o painel pedir uma nova conexão. */
export async function markSessionExpired(): Promise<void> {
  const info = await readSessionInfo();
  const next: PowerCrmSessionInfo = {
    account: info?.account ?? "",
    connectedAt: info?.connectedAt ?? new Date().toISOString(),
    lastCheckAt: new Date().toISOString(),
    status: "expirada",
  };
  await db.setSetting(POWERCRM_SESSION_INFO_KEY, JSON.stringify(next));
}

/** Remove a conexão guardada. */
export async function disconnectPowerCrm(): Promise<void> {
  await db.setSetting(POWERCRM_SESSION_KEY, "");
  await db.setSetting(POWERCRM_SESSION_INFO_KEY, "");
}
