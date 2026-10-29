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

export type PowerCrmSelectors = {
  loginEmail: string;
  loginPassword: string;
  loginSubmit: string;
  newNegotiationButton: string;
  vehicleTypeSelect: string;
  plateField: string;
  plateNotFoundHint: string;
  brandField: string;
  modelYearField: string;
  modelField: string;
  contactNameField: string;
  contactPhoneField: string;
  stateField: string;
  cityField: string;
  leadSourceField: string;
  subOriginField: string;
  addNegotiationButton: string;
  quotesTab: string;
  sendQuoteButton: string;
  pdfDownloadButton: string;
  quoteNumberText: string;
  planNameText: string;
  planPriceText: string;
};

/**
 * Executor real do PowerCRM, pela interface web com Playwright.
 *
 * O PowerCRM não libera API de uso próprio, então a automação reproduz o fluxo
 * humano observado na gravação do responsável: entrar, abrir "Nova Negociação",
 * preencher o veículo (tentando a placa primeiro e caindo para seleção manual
 * quando o sistema não encontra), preencher contato, estado, cidade e origem,
 * adicionar a negociação, abrir "Cotações", aceitar o plano que o sistema já
 * define pelo tipo de veículo, baixar o PDF e ler o número da cotação.
 *
 * Nada é enviado ao cliente final. O download do PDF e o link de compartilhar
 * são devolvidos ao aplicativo, que decide o que mostrar ao indicador.
 *
 * PENDENTE: os seletores abaixo são marcadores. É preciso preencher com os
 * rótulos reais da tela do PowerCRM, mapeados com `playwright codegen`, e
 * guardar a sessão autenticada em POWERCRM_SESSION_STATE.
 */
export class PowerCrmDriver implements QuoteDriver {
  readonly name = "powercrm";

  async run({ quote, log }: QuoteAutomationContext): Promise<QuoteAutomationResult> {
    const baseUrl = process.env.POWERCRM_URL;
    const sessionState = process.env.POWERCRM_SESSION_STATE;

    if (!baseUrl) {
      throw new Error(
        "POWERCRM_URL não configurada. Defina o endereço de login do PowerCRM antes de usar o executor real."
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

    try {
      // Contexto isolado por cotação: nenhum cookie ou aba é compartilhado entre
      // pedidos, então duas execuções nunca se atrapalham.
      const context = await browser.newContext(
        sessionState ? { storageState: sessionState, acceptDownloads: true } : { acceptDownloads: true }
      );
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);

      await log("Abrindo o PowerCRM.");
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

      if (await page.getByRole("button", { name: /acessar|entrar/i }).count()) {
        throw new Error(
          "A sessão salva do PowerCRM expirou. Renove POWERCRM_SESSION_STATE antes de continuar."
        );
      }

      await log("Abrindo nova negociação.");
      await page.getByRole("button", { name: "Nova Negociação" }).click();

      await page.getByLabel("Tipo de veículo").click();
      await page.getByRole("option", { name: quote.vehicleType }).click();

      await log(`Consultando a placa ${quote.plate}.`);
      await page.getByLabel("Placa").fill(quote.plate);

      const notFound = page.getByText("Placa não encontrada", { exact: false });
      const plateFound = !(await notFound.isVisible().catch(() => false));

      if (!plateFound) {
        await log("Placa não encontrada no PowerCRM; selecionando o veículo manualmente.");
        if (!quote.brand || !quote.model || !quote.modelYear) {
          throw new Error(
            "O PowerCRM não encontrou a placa e o pedido não trouxe marca, ano e modelo para seleção manual."
          );
        }
        await page.getByLabel("Marca").click();
        await page.getByRole("option", { name: quote.brand }).click();
        await page.getByLabel("Ano modelo").click();
        await page.getByRole("option", { name: quote.modelYear }).click();
        await page.getByLabel("Modelo").fill(quote.model);
        await page.getByRole("option", { name: quote.model }).first().click();
      } else {
        await log("Placa reconhecida; o sistema preencheu o veículo.");
      }

      await page.getByLabel("Nome para contato").fill(quote.clientName);
      await page.getByLabel("Celular").fill(quote.clientPhone);
      if (quote.clientEmail) {
        const emailField = page.getByLabel("E-mail");
        if (await emailField.count()) await emailField.fill(quote.clientEmail);
      }

      await page.getByLabel("Estado").click();
      await page.getByRole("option", { name: quote.state }).click();
      await page.getByLabel("Cidade").click();
      await page.getByRole("option", { name: quote.city }).click();

      if (quote.leadSource) {
        await page.getByLabel("Origem do Lead").click();
        await page.getByRole("option", { name: quote.leadSource }).click();
      }
      if (quote.subOrigin) {
        await page.getByLabel("SubOrigem do Lead").click();
        await page.getByRole("option", { name: quote.subOrigin }).click();
      }

      await log("Adicionando a negociação.");
      await page.getByRole("button", { name: "Adicionar negociação" }).click();

      await log("Abrindo a aba de cotações.");
      await page.getByRole("tab", { name: "Cotações" }).click();

      // O plano é definido pelo sistema conforme o tipo de veículo. A automação
      // apenas confirma a sugestão e registra os opcionais escolhidos.
      const planName = await page
        .locator('[data-testid="plan-name"]')
        .first()
        .innerText()
        .catch(() => VEHICLE_PLAN_NAME[quote.vehicleType] ?? "Plano do sistema");
      const monthlyPrice = await page
        .locator('[data-testid="plan-price"]')
        .first()
        .innerText()
        .catch(() => "");

      await log(`Confirmando o plano sugerido pelo sistema: ${planName}.`);
      const selectPlan = page.getByRole("button", { name: "Selecionar" }).first();
      if (await selectPlan.count()) await selectPlan.click();

      await page.getByRole("button", { name: "Enviar cotação" }).click();

      await log("Baixando o PDF da cotação.");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        page.getByRole("button", { name: /download da cotação/i }).click(),
      ]);

      const pdfPath = process.env.POWERCRM_PDF_DIR
        ? `${process.env.POWERCRM_PDF_DIR}/cotacao-${quote.publicToken}.pdf`
        : `/tmp/cotacao-${quote.publicToken}.pdf`;
      await download.saveAs(pdfPath);

      const quoteNumber =
        (await page
          .locator('[data-testid="quote-number"]')
          .first()
          .innerText()
          .catch(() => "")) || "";

      await context.close();

      return {
        planName,
        monthlyPrice,
        quoteNumber: quoteNumber.trim(),
        shareUrl: null,
        negotiationId: null,
        note: `PDF salvo em ${pdfPath}.`,
        simulated: false,
      };
    } finally {
      await browser.close();
    }
  }
}

/** Escolhe o executor conforme a configuração do ambiente. */
export function createDriver(): QuoteDriver {
  const mode = (process.env.AUTOMATION_DRIVER ?? "simulado").toLowerCase();
  return mode === "powercrm" ? new PowerCrmDriver() : new SimulatedDriver();
}
