export type QuoteStatus =
  | "pendente"
  | "processando"
  | "concluida"
  | "falha"
  | "cancelada";

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  pendente: "Na fila",
  processando: "Processando",
  concluida: "Concluída",
  falha: "Falhou",
  cancelada: "Cancelada",
};

/** Texto curto e humano para o indicador, sem jargão técnico. */
export const STATUS_HINT: Record<QuoteStatus, string> = {
  pendente: "Recebemos seu pedido. Ele entra na fila em instantes.",
  processando: "Estamos montando a cotação no sistema agora.",
  concluida: "Cotação pronta. Você já pode compartilhar com o cliente.",
  falha: "Não conseguimos concluir. O responsável já foi avisado.",
  cancelada: "Este pedido foi cancelado.",
};

export const VEHICLE_TYPES = [
  { value: "carro-utilitario-pequeno", label: "Carro ou utilitário pequeno" },
  { value: "carro-utilitario-grande", label: "Carro ou utilitário grande" },
  { value: "caminhonete-cabine-simples", label: "Caminhonete cabine simples" },
  { value: "caminhonete-cabine-dupla", label: "Caminhonete cabine dupla" },
  { value: "moto", label: "Moto" },
  { value: "caminhao-leve", label: "Caminhão leve" },
] as const;

export const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

export const LEAD_SOURCES = [
  "Indicação",
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Cliente antigo",
  "Outro",
] as const;

export function vehicleLabel(value: string): string {
  return VEHICLE_TYPES.find(item => item.value === value)?.label ?? value;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMoney(value: string | null | undefined): string {
  if (!value) return "—";
  const numeric = Number(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
  if (Number.isNaN(numeric)) return value;
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function readOptionals(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Normaliza o celular para o formato que o wa.me espera. */
export function whatsappNumber(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

export function formatPlate(plate: string): string {
  return plate.replace(/\s+/g, "").toUpperCase();
}