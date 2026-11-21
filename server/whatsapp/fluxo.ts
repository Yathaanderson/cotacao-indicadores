import { STATES, VEHICLE_TYPES } from "../../client/src/lib/quota";

/**
 * Conversa guiada pelo WhatsApp. Este módulo não acessa banco nem rede: recebe
 * o estado atual e a mensagem, e devolve o novo estado, a resposta e, quando o
 * indicador confirma, o pedido a ser criado. Assim as regras ficam testáveis.
 */

export type Etapa =
  | "inicio"
  | "tipo"
  | "placa"
  | "nomeCliente"
  | "celularCliente"
  | "emailCliente"
  | "uf"
  | "cidade"
  | "observacoes"
  | "confirmar"
  | "aguardando";

export type DadosPedido = {
  tipo: string;
  placa: string;
  nomeCliente: string;
  celularCliente: string;
  emailCliente: string | null;
  uf: string;
  cidade: string;
  observacoes: string | null;
};

export type EstadoConversa = {
  etapa: Etapa;
  dados: Partial<DadosPedido>;
};

export type ContextoConversa = {
  nomeIndicador: string;
  /** Pedido em andamento, quando a conversa está na etapa "aguardando". */
  pedidoId: number | null;
};

export type Resultado = {
  estado: EstadoConversa;
  resposta: string;
  /** Preenchido só quando o indicador confirma com SIM. */
  criar: DadosPedido | null;
};

export const ESTADO_INICIAL: EstadoConversa = { etapa: "inicio", dados: {} };

const CANCELAR_RESPOSTA = "Pedido cancelado. Digite *COTAR* quando quiser começar de novo.";

/** Minúsculas e sem acentos, para comparar respostas livres. */
export function normalizarTexto(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

export function normalizarPlaca(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Aceita placa no padrão antigo (ABC1234) e no Mercosul (ABC1D23). */
export function placaValida(value: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(value));
}

export function celularValido(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const semDdi = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  return semDdi.length === 10 || semDdi.length === 11;
}

function menuTipos(): string {
  return [
    "Qual é o tipo do veículo? Responda com o número:",
    ...VEHICLE_TYPES.map((item, index) => `${index + 1}. ${item.label}`),
  ].join("\n");
}

function resumo(dados: Partial<DadosPedido>): string {
  const tipo = VEHICLE_TYPES.find(item => item.value === dados.tipo)?.label ?? dados.tipo;
  return [
    "Confira os dados da cotação:",
    `Veículo: ${tipo}`,
    `Placa: ${dados.placa}`,
    `Cliente: ${dados.nomeCliente}`,
    `Celular: ${dados.celularCliente}`,
    `E-mail: ${dados.emailCliente ?? "não informado"}`,
    `Local: ${dados.cidade}/${dados.uf}`,
    `Observações: ${dados.observacoes ?? "nenhuma"}`,
    "",
    "Envio? Responda *SIM* para confirmar ou *NAO* para cancelar.",
  ].join("\n");
}

function proximaPergunta(etapa: Etapa, dados: Partial<DadosPedido>, nome: string): string {
  switch (etapa) {
    case "tipo":
      return menuTipos();
    case "placa":
      return "Qual é a placa do veículo? (ex.: ABC1D23)";
    case "nomeCliente":
      return "Qual é o nome completo do cliente?";
    case "celularCliente":
      return "Qual é o celular do cliente, com DDD? (ex.: 81 99999-9999)";
    case "emailCliente":
      return "E-mail do cliente? Responda *PULAR* se não tiver.";
    case "uf":
      return "Em qual estado o cliente mora? Use a sigla (ex.: PE).";
    case "cidade":
      return "Em qual cidade o cliente mora?";
    case "observacoes":
      return "Alguma observação para a cotação? Responda *PULAR* se não houver.";
    case "confirmar":
      return resumo(dados);
    default:
      return `Olá, ${nome}! Digite *COTAR* para pedir uma cotação.`;
  }
}

const ORDEM: Etapa[] = [
  "tipo",
  "placa",
  "nomeCliente",
  "celularCliente",
  "emailCliente",
  "uf",
  "cidade",
  "observacoes",
  "confirmar",
];

function proxima(etapa: Etapa): Etapa {
  const index = ORDEM.indexOf(etapa);
  return ORDEM[index + 1] ?? "confirmar";
}

/** Valida a resposta da etapa atual. Devolve o valor a guardar ou um erro. */
function validar(
  etapa: Etapa,
  texto: string
): { ok: true; campo: Partial<DadosPedido> } | { ok: false; erro: string } {
  const limpo = texto.trim();
  const norm = normalizarTexto(limpo);
  switch (etapa) {
    case "tipo": {
      const numero = Number(norm);
      const porNumero = Number.isInteger(numero) ? VEHICLE_TYPES[numero - 1] : undefined;
      const porNome = VEHICLE_TYPES.find(
        item => normalizarTexto(item.label) === norm || item.value === norm
      );
      const escolhido = porNumero ?? porNome;
      if (!escolhido) return { ok: false, erro: "Não entendi. Responda com o número do tipo de veículo." };
      return { ok: true, campo: { tipo: escolhido.value } };
    }
    case "placa":
      if (!placaValida(limpo)) return { ok: false, erro: "Essa placa não parece válida. Envie a placa completa (ex.: ABC1D23)." };
      return { ok: true, campo: { placa: normalizarPlaca(limpo) } };
    case "nomeCliente":
      if (limpo.length < 3 || limpo.length > 160) return { ok: false, erro: "Envie o nome completo do cliente." };
      return { ok: true, campo: { nomeCliente: limpo } };
    case "celularCliente":
      if (!celularValido(limpo)) return { ok: false, erro: "Esse celular não parece válido. Informe o DDD e o número." };
      return { ok: true, campo: { celularCliente: limpo } };
    case "emailCliente":
      if (["pular", "nao", "-"].includes(norm)) return { ok: true, campo: { emailCliente: null } };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo) || limpo.length > 320) {
        return { ok: false, erro: "E-mail inválido. Envie um e-mail ou responda PULAR." };
      }
      return { ok: true, campo: { emailCliente: limpo.toLowerCase() } };
    case "uf": {
      const sigla = limpo.toUpperCase();
      if (!(STATES as readonly string[]).includes(sigla)) return { ok: false, erro: "Use a sigla do estado, com duas letras (ex.: PE)." };
      return { ok: true, campo: { uf: sigla } };
    }
    case "cidade":
      if (limpo.length < 2 || limpo.length > 120) return { ok: false, erro: "Informe a cidade do cliente." };
      return { ok: true, campo: { cidade: limpo } };
    case "observacoes":
      if (["pular", "nao", "nenhuma", "sem", "-"].includes(norm)) return { ok: true, campo: { observacoes: null } };
      if (limpo.length > 2000) return { ok: false, erro: "A observação é longa demais. Resuma em até 2000 caracteres." };
      return { ok: true, campo: { observacoes: limpo } };
    default:
      return { ok: false, erro: "" };
  }
}

export function completarDados(dados: Partial<DadosPedido>): DadosPedido | null {
  if (
    !dados.tipo || !dados.placa || !dados.nomeCliente || !dados.celularCliente ||
    !dados.uf || !dados.cidade
  ) {
    return null;
  }
  return {
    tipo: dados.tipo,
    placa: dados.placa,
    nomeCliente: dados.nomeCliente,
    celularCliente: dados.celularCliente,
    emailCliente: dados.emailCliente ?? null,
    uf: dados.uf,
    cidade: dados.cidade,
    observacoes: dados.observacoes ?? null,
  };
}

/** Processa uma mensagem recebida do indicador e devolve o próximo passo. */
export function processarMensagem(
  estado: EstadoConversa,
  texto: string,
  contexto: ContextoConversa
): Resultado {
  const norm = normalizarTexto(texto);

  if (estado.etapa === "aguardando") {
    const numero = contexto.pedidoId ? `#${contexto.pedidoId}` : "";
    const resposta =
      norm === "cancelar"
        ? `Sua cotação ${numero} já está em andamento e não pode ser cancelada por aqui. Aviso assim que sair.`
        : `Sua cotação ${numero} ainda está em andamento. Aviso aqui assim que sair.`;
    return { estado, resposta, criar: null };
  }

  if (norm === "cancelar") {
    return { estado: ESTADO_INICIAL, resposta: CANCELAR_RESPOSTA, criar: null };
  }

  if (estado.etapa === "inicio") {
    if (["cotar", "cotacao", "nova", "1"].includes(norm)) {
      return {
        estado: { etapa: "tipo", dados: {} },
        resposta: menuTipos(),
        criar: null,
      };
    }
    return {
      estado,
      resposta: proximaPergunta("inicio", {}, contexto.nomeIndicador),
      criar: null,
    };
  }

  if (estado.etapa === "confirmar") {
    if (norm === "sim") {
      const completo = completarDados(estado.dados);
      if (!completo) {
        return { estado: ESTADO_INICIAL, resposta: "Faltou algum dado. Digite COTAR para começar de novo.", criar: null };
      }
      return { estado, resposta: "", criar: completo };
    }
    if (norm === "nao") {
      return { estado: ESTADO_INICIAL, resposta: CANCELAR_RESPOSTA, criar: null };
    }
    return { estado, resposta: "Responda *SIM* para enviar ou *NAO* para cancelar.", criar: null };
  }

  const validacao = validar(estado.etapa, texto);
  if (!validacao.ok) {
    return {
      estado,
      resposta: `${validacao.erro}\n\n${proximaPergunta(estado.etapa, estado.dados, contexto.nomeIndicador)}`,
      criar: null,
    };
  }

  const dados = { ...estado.dados, ...validacao.campo };
  const etapa = proxima(estado.etapa);
  return {
    estado: { etapa, dados },
    resposta: proximaPergunta(etapa, dados, contexto.nomeIndicador),
    criar: null,
  };
}

/** Texto enviado ao indicador quando a cotação termina. */
export function mensagemResultado(quote: {
  id: number;
  status: string;
  plate: string;
  planName: string | null;
  monthlyPrice: string | null;
  quoteNumber: string | null;
  shareUrl: string | null;
  errorMessage: string | null;
}): string {
  if (quote.status === "concluida") {
    return [
      "✅ Cotação pronta!",
      `Placa: ${quote.plate}`,
      quote.planName ? `Plano: ${quote.planName}` : null,
      quote.monthlyPrice ? `Primeira mensalidade: ${quote.monthlyPrice}` : null,
      quote.quoteNumber ? `Cotação nº ${quote.quoteNumber}` : null,
      quote.shareUrl ? `Link para enviar ao cliente: ${quote.shareUrl}` : null,
      "",
      "Digite *COTAR* para uma nova cotação.",
    ]
      .filter(item => item !== null)
      .join("\n");
  }
  return [
    `❌ Não consegui concluir a cotação da placa ${quote.plate}.`,
    quote.errorMessage ? `Motivo: ${quote.errorMessage}` : null,
    "A equipe já foi avisada. Digite *COTAR* para tentar de novo.",
  ]
    .filter(item => item !== null)
    .join("\n");
}
