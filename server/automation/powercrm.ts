import type { QuoteRequest } from "../../drizzle/schema";

/**
 * Resultado que a automação devolve para a solicitação. Nem todo campo vem
 * sempre: quando o PowerCRM não expõe o dado, o campo fica nulo.
 */
export type QuoteAutomationResult = {
  planName: string;
  monthlyPrice: string;
  quoteNumber: string;
  fipeValue?: string | null;
  shareUrl?: string | null;
  negotiationId?: string | null;
  note?: string | null;
  /** true quando o resultado veio do executor simulado, não do PowerCRM. */
  simulated: boolean;
};

export type QuoteAutomationContext = {
  quote: QuoteRequest;
  /** Registra uma observação intermediária na trilha do pedido. */
  log: (message: string) => Promise<void>;
};

export interface QuoteDriver {
  readonly name: string;
  run(context: QuoteAutomationContext): Promise<QuoteAutomationResult>;
}

const VEHICLE_BASE_PRICE: Record<string, number> = {
  "carro-utilitario-pequeno": 189.9,
  "carro-utilitario-grande": 249.9,
  "caminhonete-cabine-simples": 279.9,
  "caminhonete-cabine-dupla": 319.9,
  moto: 99.9,
  "caminhao-leve": 359.9,
};

const VEHICLE_PLAN_NAME: Record<string, string> = {
  "carro-utilitario-pequeno": "Ideal Top Passeio V2",
  "carro-utilitario-grande": "Ideal Top Passeio V2",
  "caminhonete-cabine-simples": "Ideal Top Utilitário",
  "caminhonete-cabine-dupla": "Ideal Top Utilitário",
  moto: "Ideal Moto Essencial",
  "caminhao-leve": "Ideal Carga Protegida",
};

/**
 * Executor simulado. Existe para que o fluxo completo (fila, estados, alertas,
 * impressão e link público) possa ser validado antes de existir acesso ao
 * PowerCRM. Ele nunca cria nada no PowerCRM e o resultado fica marcado como
 * demonstração na interface.
 */
export class SimulatedDriver implements QuoteDriver {
  readonly name = "simulado";

  async run({ quote, log }: QuoteAutomationContext): Promise<QuoteAutomationResult> {
    await log("Executor simulado: nenhuma interação com o PowerCRM foi feita.");
    await new Promise(resolve => setTimeout(resolve, 1200));

    const base = VEHICLE_BASE_PRICE[quote.vehicleType] ?? 199.9;
    const optionalCount = parseOptionalCount(quote.optionals);
    const monthly = base + optionalCount * 18.5;
    const year = new Date().getFullYear();

    return {
      planName: VEHICLE_PLAN_NAME[quote.vehicleType] ?? "Ideal Top Passeio V2",
      monthlyPrice: monthly.toFixed(2),
      quoteNumber: `SIM-${year}-${String(quote.id).padStart(5, "0")}`,
      fipeValue: null,
      shareUrl: null,
      negotiationId: null,
      note: "Resultado de demonstração. Substitua pelo executor do PowerCRM para valores reais.",
      simulated: true,
    };
  }
}

function parseOptionalCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Rótulos da tela do PowerCRM. Todos são textos visíveis (labels, abas e
 * botões) para sobreviver a mudanças de estrutura no HTML. Se o layout mudar,
 * basta atualizar este mapa — nenhuma lógica do executor precisa ser alterada.
 */
export type PowerCrmSelectors = {
  loginEmail: string;
  loginPassword: string;
  loginSubmit: string;
  newNegotiationButton: string;
  vehicleTypeField: string;
  plateField: string;
  plateNotFoundHint: string;
  brandField: string;
  modelYearField: string;
  modelField: string;
  fipeCodeField: string;
  fipeValueField: string;
  contactNameField: string;
  contactEmailField: string;
  contactPhoneField: string;
  stateField: string;
  cityField: string;
  leadSourceField: string;
  subOriginField: string;
  saveLeadButton: string;
  quotesTab: string;
  plansSection: string;
  planNameText: string;
  monthlyPriceText: string;
  participationFeeText: string;
  sendQuoteButton: string;
  readyQuoteOption: string;
  shareLinkOption: string;
  downloadPdfOption: string;
  quoteNumberText: string;
};

export const DEFAULT_POWERCRM_SELECTORS: PowerCrmSelectors = {
  loginEmail: "E-mail",
  loginPassword: "Senha",
  loginSubmit: "Acessar",
  newNegotiationButton: "Nova negociação",
  vehicleTypeField: "Tipo de veículo",
  plateField: "Placa",
  plateNotFoundHint: "Placa não encontrada",
  brandField: "Marca",
  modelYearField: "Ano modelo",
  modelField: "Modelo",
  fipeCodeField: "Código FIPE",
  fipeValueField: "Valor FIPE",
  contactNameField: "Nome para contato",
  contactEmailField: "E-mail",
  contactPhoneField: "Celular",
  stateField: "Estado",
  cityField: "Cidade",
  leadSourceField: "Origem do Lead",
  subOriginField: "SubOrigem do Lead",
  saveLeadButton: "Salvar",
  quotesTab: "Cotações",
  plansSection: "Planos",
  planNameText: "Plano",
  monthlyPriceText: "Primeira mensalidade",
  participationFeeText: "Cota de participação",
  sendQuoteButton: "Enviar cotação",
  readyQuoteOption: "Enviar cotação pronta",
  shareLinkOption: "Link",
  downloadPdfOption: "Download da cotação em PDF",
  quoteNumberText: "Número da cotação",
};

/**
 * Executor real do PowerCRM, pela interface web com Playwright.
 *
 * O PowerCRM não libera API de uso próprio, então a automação reproduz o fluxo
 * humano observado na gravação do responsável, em app.powercrm.com.br:
 *
 *  1. Abre "Nova negociação" e informa tipo de veículo e placa. O sistema
 *     costuma puxar marca, ano e modelo pela placa; quando não encontra, a
 *     automação preenche esses campos manualmente com os dados do pedido.
 *  2. Completa contato, estado, cidade, origem e suborigem do lead e salva.
 *  3. Abre a aba "Cotações" da negociação. O plano é escolhido pelo sistema
 *     conforme o tipo de veículo — a automação não interfere, apenas lê o
 *     plano, a primeira mensalidade e a cota de participação.
 *  4. Abre a tela "Enviar cotação", que oferece cotação pronta (link, WhatsApp
 *     e e-mail), comparação de planos, link de pagamento e download em PDF.
 *     A automação prioriza o link de compartilhamento e baixa o PDF como
 *     anexo de reserva.
 *
 * Nada é enviado ao cliente final pelo PowerCRM: o link e o PDF são devolvidos
 * ao aplicativo, que entrega ao indicador para ele repassar ao cliente.
 *
 * Configuração por ambiente:
 *  - POWERCRM_URL: endereço de login (padrão https://app.powercrm.com.br).
 *  - POWERCRM_SESSION_STATE: caminho do storageState autenticado.
 *  - POWERCRM_PDF_DIR: pasta onde os PDFs baixados são guardados.
 *  - POWERCRM_HEADLESS: "false" para abrir o navegador visível.
 *  - POWERCRM_SELECTORS: JSON parcial para sobrescrever rótulos sem mexer no código.
 */
export class PowerCrmDriver implements QuoteDriver {
  readonly name = "powercrm";

  async run({ quote, log }: QuoteAutomationContext): Promise<QuoteAutomationResult> {
    const baseUrl = await getPowerCrmUrl();
    const sessionState = await readSessionState();
    const selectors = loadSelectors();

    if (!sessionState) {
      throw new Error(
        "O PowerCRM ainda não está conectado. Abra o painel e use a opção Conectar PowerCRM."
      );
    }

    // Playwright é dependência opcional: existe apenas na máquina que roda o
    // worker. O import por variável impede que o type-check do app quebre em
    // ambientes onde o pacote não está instalado.
    const playwrightSpecifier = "playwright";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playwright: any = await import(/* @vite-ignore */ playwrightSpecifier);
    const { chromium } = playwright;
    const browser = await chromium.launch({
      headless: process.env.POWERCRM_HEADLESS !== "false",
    });

    let context: any = null;
    try {
      // Contexto isolado por cotação: nenhum cookie ou aba é compartilhado entre
      // pedidos, então duas execuções nunca se atrapalham.
      context = await browser.newContext(
        sessionState
          ? { storageState: sessionState, acceptDownloads: true }
          : { acceptDownloads: true }
      );
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(baseUrl).origin,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);

      await log("Abrindo o PowerCRM.");
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

      // A tela real de login tem id="emailField" e id="j_password" e usa um
      // input[type="submit"] com o texto "Acessar" (não é um <button>).
      const loginField = page.locator("#j_password, #emailField").first();
      if (await loginField.count().catch(() => 0)) {
        await markSessionExpired().catch(() => undefined);
        throw new Error(
          "A sessão salva do PowerCRM expirou. Faça o login novamente para renovar POWERCRM_SESSION_STATE."
        );
      }

      await log("Abrindo nova negociação.");
      await clickByText(page, selectors.newNegotiationButton, { role: "button" });

      await log(`Informando o tipo de veículo e a placa ${quote.plate}.`);
      await chooseOption(page, selectors.vehicleTypeField, quote.vehicleType);
      await page.getByLabel(selectors.plateField, { exact: false }).first().fill(quote.plate);
      await page.waitForTimeout(1500);

      const notFound = page.getByText(selectors.plateNotFoundHint, { exact: false });
      const plateFound = !(await notFound.isVisible().catch(() => false));

      if (!plateFound) {
        await log("Placa não encontrada no PowerCRM; selecionando o veículo manualmente.");
        if (!quote.brand || !quote.model || !quote.modelYear) {
          throw new Error(
            "O PowerCRM não encontrou a placa e o pedido não trouxe marca, ano e modelo para seleção manual."
          );
        }
        await chooseOption(page, selectors.brandField, quote.brand);
        await chooseOption(page, selectors.modelYearField, quote.modelYear);
        await chooseOption(page, selectors.modelField, quote.model);
      } else {
        await log("Placa reconhecida; o sistema preencheu o veículo.");
      }

      await page.getByLabel(selectors.contactNameField, { exact: false }).first().fill(quote.clientName);
      const phoneField = page.getByLabel(selectors.contactPhoneField, { exact: false }).first();
      if (await phoneField.count().catch(() => 0)) {
        await phoneField.fill(quote.clientPhone);
      }
      if (quote.clientEmail) {
        const emailField = page.getByLabel(selectors.contactEmailField, { exact: false }).first();
        if (await emailField.count().catch(() => 0)) await emailField.fill(quote.clientEmail);
      }

      await chooseOption(page, selectors.stateField, quote.state);
      await chooseOption(page, selectors.cityField, quote.city);
      if (quote.leadSource) await chooseOption(page, selectors.leadSourceField, quote.leadSource);
      if (quote.subOrigin) await chooseOption(page, selectors.subOriginField, quote.subOrigin);

      const fipeCode = await readFieldValue(page, selectors.fipeCodeField);
      const fipeValue = await readFieldValue(page, selectors.fipeValueField);

      await log("Salvando a negociação.");
      await clickByText(page, selectors.saveLeadButton, { role: "button" });

      await log("Abrindo a aba de cotações.");
      await page.getByRole("tab", { name: selectors.quotesTab }).first().click();
      await page.waitForTimeout(2000);

      // O plano é definido pelo sistema conforme o tipo de veículo. A automação
      // apenas lê o que o sistema já sugeriu.
      const planName = await readNearbyText(
        page,
        selectors.monthlyPriceText,
        selectors.planNameText
      ) || VEHICLE_PLAN_NAME[quote.vehicleType] || "Plano do sistema";
      const monthlyPrice = await readNearbyText(page, selectors.planNameText, selectors.monthlyPriceText);
      const participationFee = await readNearbyText(
        page,
        selectors.participationFeeText,
        selectors.participationFeeText
      );

      await log(`Plano sugerido pelo sistema: ${planName}${monthlyPrice ? ` (${monthlyPrice})` : ""}.`);

      await log("Abrindo a tela de envio da cotação.");
      await clickByText(page, selectors.sendQuoteButton, { role: "button" });
      await page.waitForTimeout(1200);

      // A tela de envio oferece cotação pronta com link, WhatsApp e e-mail,
      // comparações e PDF. Priorizamos o link, que funciona em qualquer celular.
      let shareUrl: string | null = null;
      const readyOption = page.getByText(selectors.readyQuoteOption, { exact: false }).first();
      if (await readyOption.count().catch(() => 0)) {
        await readyOption.click();
        await page.waitForTimeout(1200);

        shareUrl = await captureShareLink(page, selectors, log);

        if (!shareUrl) {
          await log("Não foi possível capturar o link; seguindo com o PDF.");
        }
        await closeOverlay(page);
      }

      const pdfPath = await downloadQuotePdf(page, selectors, quote, log);

      const quoteNumber =
        (await readFieldValue(page, selectors.quoteNumberText)) ||
        (await readNearbyText(page, selectors.quoteNumberText, selectors.quoteNumberText));

      const notes = [
        pdfPath ? `PDF salvo em ${pdfPath}.` : "PDF não disponível nesta execução.",
        shareUrl ? "Link de compartilhamento capturado." : "Link não capturado.",
        participationFee ? `Cota de participação: ${participationFee}.` : null,
        fipeCode ? `Código FIPE: ${fipeCode}.` : null,
      ]
        .filter(Boolean)
        .join(" ");

      await context.close();
      context = null;

      return {
        planName,
        monthlyPrice,
        quoteNumber: quoteNumber.trim(),
        fipeValue: fipeValue ?? quote.fipeValue ?? null,
        shareUrl,
        negotiationId: null,
        note: notes,
        simulated: false,
      };
    } finally {
      if (context) await context.close().catch(() => undefined);
      await browser.close();
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Utilitários de interação                                                   */
/* ------------------------------------------------------------------------- */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadSelectors(): PowerCrmSelectors {
  const raw = process.env.POWERCRM_SELECTORS;
  if (!raw) return DEFAULT_POWERCRM_SELECTORS;
  try {
    const parsed = JSON.parse(raw) as Partial<PowerCrmSelectors>;
    return { ...DEFAULT_POWERCRM_SELECTORS, ...parsed };
  } catch {
    return DEFAULT_POWERCRM_SELECTORS;
  }
}

/**
 * Clica no primeiro elemento cujo texto corresponde ao rótulo. Procura por
 * botão, link e item de menu, porque a mesma ação aparece em formatos
 * diferentes conforme a tela.
 */
async function clickByText(
  page: any,
  label: string,
  options: { role?: "button" | "link" | "tab" } = {}
): Promise<void> {
  const roles: Array<"button" | "link" | "tab"> = options.role ? [options.role] : ["button", "link", "tab"];
  for (const role of roles) {
    const locator = page.getByRole(role, { name: label, exact: false }).first();
    if (await locator.count().catch(() => 0)) {
      await locator.click();
      return;
    }
  }
  const textLocator = page.getByText(label, { exact: false }).first();
  if (await textLocator.count().catch(() => 0)) {
    await textLocator.click();
    return;
  }
  throw new Error(`Elemento "${label}" não encontrado na tela do PowerCRM.`);
}

/** Abre um campo de seleção e escolhe a opção pelo texto. */
async function chooseOption(page: any, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label, { exact: false }).first();
  if (!(await field.count().catch(() => 0))) {
    const fallback = page.getByText(label, { exact: false }).first();
    if (!(await fallback.count().catch(() => 0))) return;
    await fallback.click();
  } else {
    await field.click();
  }
  await page.waitForTimeout(400);

  const option = page
    .getByRole("option", { name: new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`, "i") })
    .first();
  if (await option.count().catch(() => 0)) {
    await option.click();
  } else {
    const loose = page.getByText(value, { exact: false }).first();
    if (await loose.count().catch(() => 0)) await loose.click();
  }
  await page.waitForTimeout(300);
}

/** Lê o valor de um campo de formulário; devolve null quando não existe. */
async function readFieldValue(page: any, label: string): Promise<string | null> {
  const field = page.getByLabel(label, { exact: false }).first();
  if (await field.count().catch(() => 0)) {
    const value = await field.inputValue().catch(() => "");
    if (value) return value.trim();
    const text = await field.innerText().catch(() => "");
    if (text) return text.trim();
  }
  const textLocator = page.getByText(label, { exact: false }).first();
  if (await textLocator.count().catch(() => 0)) {
    const parent = textLocator.locator("xpath=..");
    const text = await parent.innerText().catch(() => "");
    const cleaned = text.replace(label, "").trim();
    if (cleaned) return cleaned;
  }
  return null;
}

/** Procura um texto próximo de outro rótulo conhecido na mesma seção. */
async function readNearbyText(page: any, anchor: string, target: string): Promise<string> {
  const anchorLocator = page.getByText(anchor, { exact: false }).first();
  if (!(await anchorLocator.count().catch(() => 0))) return "";

  const container = anchorLocator.locator("xpath=ancestor::*[self::section or self::div][3]");
  const scoped = container.getByText(target, { exact: false }).first();
  const text = (await scoped.innerText().catch(() => "")) || (await container.innerText().catch(() => ""));
  const line = text
    .split("\n")
    .map((item: string) => item.trim())
    .find((item: string) => item && item !== anchor && !item.includes(anchor));
  return line ?? "";
}

/**
 * Captura o link de compartilhamento. Tenta, em ordem: campo de texto já
 * preenchido na tela, área de transferência após clicar em "Link", e popup
 * aberto pelo WhatsApp Web.
 */
async function captureShareLink(
  page: any,
  selectors: PowerCrmSelectors,
  log: (message: string) => Promise<void>
): Promise<string | null> {
  const direct = page
    .locator('input[readonly], textarea[readonly], [data-testid*="share"], [data-testid*="link"]')
    .first();
  if (await direct.count().catch(() => 0)) {
    const value = await direct.inputValue().catch(() => "");
    if (value && /^https?:\/\//.test(value)) return value.trim();
  }

  const linkOption = page.getByText(selectors.shareLinkOption, { exact: true }).first();
  if (await linkOption.count().catch(() => 0)) {
    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 6_000 }).catch(() => null),
      linkOption.click(),
    ]);

    const clipboard = await page
      .evaluate(() => navigator.clipboard.readText())
      .catch(() => "");
    if (typeof clipboard === "string" && /^https?:\/\//.test(clipboard.trim())) {
      return clipboard.trim();
    }

    if (popup) {
      const url = popup.url();
      await popup.close().catch(() => undefined);
      if (/^https?:\/\//.test(url)) return url;
    }

    const toast = page.getByText(/copiad|link/i).first();
    if (await toast.count().catch(() => 0)) {
      await log("O sistema confirmou a cópia do link, mas o conteúdo não foi legível.");
    }
  }

  // Último recurso: procura qualquer URL de cotação visível na tela.
  const visible = page.getByText(/https?:\/\/[^\s]+cotac[^\s]*/i).first();
  if (await visible.count().catch(() => 0)) {
    const text = await visible.innerText().catch(() => "");
    const match = text.match(/https?:\/\/[^\s]+/);
    if (match) return match[0];
  }

  return null;
}

/** Fecha o painel de envio para voltar à negociação. */
async function closeOverlay(page: any): Promise<void> {
  const close = page
    .getByRole("button", { name: /fechar|cancelar|voltar|close/i })
    .first();
  if (await close.count().catch(() => 0)) {
    await close.click().catch(() => undefined);
    await page.waitForTimeout(600);
  }
}

/** Baixa o PDF da cotação; devolve null quando o download não acontece. */
async function downloadQuotePdf(
  page: any,
  selectors: PowerCrmSelectors,
  quote: QuoteRequest,
  log: (message: string) => Promise<void>
): Promise<string | null> {
  try {
    const option = page.getByText(selectors.downloadPdfOption, { exact: false }).first();
    if (!(await option.count().catch(() => 0))) {
      await clickByText(page, selectors.sendQuoteButton, { role: "button" }).catch(() => undefined);
      await page.waitForTimeout(1000);
    }
    const target = page.getByText(selectors.downloadPdfOption, { exact: false }).first();
    if (!(await target.count().catch(() => 0))) return null;

    await log("Baixando o PDF da cotação.");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 40_000 }),
      target.click(),
    ]);
    const pdfPath = process.env.POWERCRM_PDF_DIR
      ? `${process.env.POWERCRM_PDF_DIR}/cotacao-${quote.publicToken}.pdf`
      : `/tmp/cotacao-${quote.publicToken}.pdf`;
    await download.saveAs(pdfPath);
    return pdfPath;
  } catch {
    return null;
  }
}

/** Escolhe o executor conforme a configuração do ambiente. */
export const DRIVER_SETTING_KEY = "automation.driver";

/**
 * Escolhe o executor. A preferência do painel vence a variável de ambiente,
 * então dá para ligar o executor real sem reiniciar o servidor.
 */
export async function createDriver(): Promise<QuoteDriver> {
  let mode = "";
  try {
    const db = await import("../db");
    mode = (await db.getSetting(DRIVER_SETTING_KEY)) ?? "";
  } catch {
    mode = "";
  }
  if (!mode) mode = process.env.AUTOMATION_DRIVER ?? "simulado";
  return mode.toLowerCase() === "powercrm" ? new PowerCrmDriver() : new SimulatedDriver();
}
import {
  getPowerCrmUrl,
  markSessionExpired,
  readSessionState,
} from "./powercrm-session";
