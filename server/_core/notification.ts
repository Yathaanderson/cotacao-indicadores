import nodemailer, { type Transporter } from "nodemailer";

export type NotificationPayload = {
  title: string;
  content: string;
};

/**
 * Envia o alerta ao responsável por e-mail (SMTP próprio, sem serviço externo).
 *
 * Destinatário: NOTIFY_EMAIL, ou ADMIN_EMAIL se NOTIFY_EMAIL não estiver definido.
 * Retorna `true` quando o servidor SMTP aceita a mensagem e `false` em qualquer
 * outro caso (SMTP não configurado, falha de conexão, recusa). Nunca lança erro,
 * para que a falha de alerta não derrube o pedido.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
    });
  }
  return transporter;
}

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const title = payload.title.trim();
  const content = payload.content.trim();
  if (!title || !content) return false;

  const to = (process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || "").trim();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const mailer = getTransporter();

  if (!mailer || !to || !from) {
    console.warn("[Notification] SMTP ou destinatário não configurado; alerta não enviado.");
    return false;
  }

  try {
    await mailer.sendMail({ from, to, subject: title.slice(0, 200), text: content });
    return true;
  } catch (error) {
    console.warn(
      "[Notification] Falha ao enviar e-mail:",
      error instanceof Error ? error.message : "erro desconhecido"
    );
    return false;
  }
}
