import { AppShell, Placa, SeloStatus } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  STATUS_HINT,
  formatDateTime,
  formatMoney,
  readOptionals,
  vehicleLabel,
  whatsappNumber,
  type QuoteStatus,
} from "@/lib/quota";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";

const ACTIVE: QuoteStatus[] = ["pendente", "processando"];

export default function CotacaoDetalhe() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const utils = trpc.useUtils();
  const [copied, setCopied] = useState(false);

  const query = trpc.quotes.byId.useQuery(
    { id },
    {
      enabled: Number.isFinite(id) && id > 0,
      retry: false,
      refetchInterval: data =>
        data.state.data && ACTIVE.includes(data.state.data.quote.status as QuoteStatus) ? 6000 : false,
    }
  );

  const cancel = trpc.quotes.cancel.useMutation({
    onSuccess: async () => {
      toast.success("Pedido cancelado.");
      await utils.quotes.byId.invalidate({ id });
      await utils.quotes.mine.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (query.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted/60" />
          <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
        </div>
      </AppShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md space-y-4 py-16 text-center">
          <XCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Cotação não encontrada</h1>
          <p className="text-sm text-muted-foreground">
            {query.error?.message ?? "Este pedido não existe ou não está disponível para a sua conta."}
          </p>
          <Button asChild variant="outline">
            <Link href="/">Voltar para as cotações</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const { quote, events } = query.data;
  const status = quote.status as QuoteStatus;
  const optionals = readOptionals(quote.optionals);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/c/${quote.publicToken}` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Abra a versão de impressão e copie o endereço.");
    }
  };

  const whatsappText = [
    `Olá, ${quote.clientName.split(" ")[0]}! Sua cotação do ${vehicleLabel(quote.vehicleType)}`,
    `(placa ${quote.plate}) está pronta.`,
    quote.planName ? `Plano: ${quote.planName} — ${formatMoney(quote.monthlyPrice)}/mês.` : "",
    `Veja a proposta completa: ${shareUrl}`,
  ]
    .filter(Boolean)
    .join(" ");

  const phone = whatsappNumber(quote.clientPhone);
  const whatsappHref = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Cotações
        </Link>

        <section className="rounded-xl border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Placa value={quote.plate} />
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                {[quote.brand, quote.model].filter(Boolean).join(" ") || vehicleLabel(quote.vehicleType)}
              </h1>
              <p className="text-xs text-muted-foreground">
                Pedido #{quote.id} · {formatDateTime(quote.createdAt)} · {quote.city}/{quote.state}
              </p>
            </div>
            <SeloStatus status={status} />
          </div>

          {ACTIVE.includes(status) && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-accent/70 px-3 py-2.5 text-sm text-accent-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{STATUS_HINT[status]} A página atualiza sozinha.</span>
            </div>
          )}

          {status === "falha" && (
            <div className="mt-4 rounded-lg bg-[#fbeae8] px-3 py-2.5 text-sm text-[#8b2b22]">
              <p className="font-semibold">Não conseguimos concluir esta cotação.</p>
              <p className="mt-0.5 leading-relaxed">{STATUS_HINT.falha}</p>
            </div>
          )}

          {status === "concluida" && (
            <div className="mt-4 grid gap-3 rounded-lg bg-secondary p-3.5 sm:grid-cols-[1.5fr_1fr] sm:items-center">
              <div>
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Plano</p>
                <p className="text-sm font-semibold">{quote.planName ?? "Plano do sistema"}</p>
                {optionals.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{optionals.join(" · ")}</p>
                )}
                {quote.quoteNumber && (
                  <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground">
                    Cotação nº {quote.quoteNumber}
                  </p>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Mensalidade</p>
                <p className="font-mono text-xl font-semibold">{formatMoney(quote.monthlyPrice)}</p>
              </div>
            </div>
          )}

          {status === "cancelada" && (
            <p className="mt-4 rounded-lg bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
              {STATUS_HINT.cancelada}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="lg" className="h-11 flex-1 gap-2 sm:flex-none" disabled={status !== "concluida"}>
              <a href={status === "concluida" ? whatsappHref : undefined} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 gap-2"
              onClick={copyLink}
              disabled={status !== "concluida"}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar link
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 gap-2">
              <Link href={`/cotacoes/${quote.id}/imprimir`}>
                <FileText className="h-4 w-4" /> Ver PDF
              </Link>
            </Button>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="text-sm font-semibold">Dados enviados</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="field-label">Cliente</dt>
              <dd className="mt-0.5">{quote.clientName}</dd>
            </div>
            <div>
              <dt className="field-label">Celular</dt>
              <dd className="mt-0.5 font-mono text-xs">{quote.clientPhone}</dd>
            </div>
            <div>
              <dt className="field-label">Veículo</dt>
              <dd className="mt-0.5">{vehicleLabel(quote.vehicleType)}</dd>
            </div>
            <div>
              <dt className="field-label">Modelo / ano</dt>
              <dd className="mt-0.5">
                {[quote.brand, quote.model, quote.modelYear].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="field-label">Origem</dt>
              <dd className="mt-0.5">
                {[quote.leadSource, quote.subOrigin].filter(Boolean).join(" / ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="field-label">Indicador</dt>
              <dd className="mt-0.5">{quote.indicatorName}</dd>
            </div>
          </dl>
          {quote.notes && (
            <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
              <p className="field-label">Observações</p>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{quote.notes}</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="text-sm font-semibold">Acompanhamento</h2>
          <ol className="mt-3 space-y-3">
            {events.map(event => (
              <li key={event.id} className="flex gap-3">
                <span className="relative mt-1 flex w-2 shrink-0 justify-center">
                  <span className="h-2 w-2 rounded-full bg-primary/70" />
                  <span className="absolute top-2 h-full w-px bg-border" aria-hidden />
                </span>
                <div className="pb-0.5">
                  <p className="text-sm leading-snug">{event.message}</p>
                  <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {(status === "pendente" || status === "falha") && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (window.confirm("Cancelar este pedido de cotação?")) cancel.mutate({ id: quote.id });
              }}
              disabled={cancel.isPending}
            >
              Cancelar pedido
            </Button>
          )}
        </section>

        <p className="px-1 text-center text-[0.7rem] text-muted-foreground">
          O link e o PDF ficam disponíveis assim que a cotação é concluída.{" "}
          <a
            className="inline-flex items-center gap-1 underline underline-offset-2"
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
          >
            Abrir link público <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>
    </AppShell>
  );
}