import {
  formatDateTime,
  formatMoney,
  readOptionals,
  vehicleLabel,
  type QuoteStatus,
} from "@/lib/quota";
import { Placa, SeloStatus } from "@/components/AppShell";

export type SheetQuote = {
  status: QuoteStatus;
  plate: string;
  vehicleType: string;
  brand?: string | null;
  model?: string | null;
  modelYear?: string | null;
  fipeValue?: string | null;
  clientName: string;
  clientPhone?: string | null;
  state: string;
  city: string;
  optionals?: string | null;
  planName?: string | null;
  monthlyPrice?: string | null;
  quoteNumber?: string | null;
  createdAt: Date | string;
  finishedAt?: Date | string | null;
  indicatorName?: string | null;
};

export function FolhaCotacao({ quote }: { quote: SheetQuote }) {
  const optionals = readOptionals(quote.optionals);
  const ready = quote.status === "concluida";

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] overflow-hidden rounded-xl border bg-card p-6 shadow-sm sm:p-10">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-lg font-semibold text-primary-foreground">
            C
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Cotação de seguro auto</p>
            <p className="text-xs text-muted-foreground">
              {quote.indicatorName ? `Indicado por ${quote.indicatorName}` : "Proposta ao cliente"}
            </p>
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Cotação</p>
          <p className="truncate font-mono text-sm font-semibold">
            {quote.quoteNumber || `Nº ${String(quote.createdAt).slice(0, 10)}`}
          </p>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            Emitida em {formatDateTime(quote.createdAt)}
          </p>
        </div>
      </header>

      <section className="grid gap-6 border-b py-5 sm:grid-cols-2">
        <div>
          <h2 className="field-label">Veículo</h2>
          <div className="mt-2 space-y-1.5">
            <Placa value={quote.plate} />
            <p className="text-sm font-medium">{vehicleLabel(quote.vehicleType)}</p>
            <p className="text-sm text-muted-foreground">
              {[quote.brand, quote.model, quote.modelYear].filter(Boolean).join(" · ") ||
                "Modelo a confirmar"}
            </p>
            {quote.fipeValue && (
              <p className="text-xs text-muted-foreground">
                Valor FIPE: <span className="font-mono">{formatMoney(quote.fipeValue)}</span>
              </p>
            )}
          </div>
        </div>

        <div>
          <h2 className="field-label">Segurado</h2>
          <div className="mt-2 space-y-1.5">
            <p className="text-sm font-medium">{quote.clientName}</p>
            {quote.clientPhone && (
              <p className="font-mono text-xs text-muted-foreground">{quote.clientPhone}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {quote.city} / {quote.state}
            </p>
          </div>
        </div>
      </section>

      {ready ? (
        <section className="grid gap-6 border-b py-5 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="field-label">Plano</h2>
            <p className="mt-2 text-base font-semibold">{quote.planName ?? "Plano definido pelo sistema"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Plano definido automaticamente pelo sistema conforme o tipo de veículo.
            </p>
            {optionals.length > 0 && (
              <>
                <p className="field-label mt-4">Opcionais incluídos</p>
                <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                  {optionals.map(item => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="rounded-lg bg-secondary p-4">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Mensalidade</p>
            <p className="font-mono text-2xl font-semibold text-foreground">
              {formatMoney(quote.monthlyPrice)}
            </p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">Valores sujeitos à análise da seguradora.</p>
          </div>
        </section>
      ) : (
        <section className="border-b py-5">
          <div className="flex items-center gap-3">
            <SeloStatus status={quote.status} />
            <p className="text-sm text-muted-foreground">
              {quote.status === "falha"
                ? "Esta cotação não foi concluída. Os valores ainda não estão disponíveis."
                : "Os valores aparecem aqui assim que o sistema concluir a cotação."}
            </p>
          </div>
        </section>
      )}

      <footer className="flex flex-col gap-1 pt-5 text-[0.7rem] leading-relaxed text-muted-foreground">
        <p>
          Proposta gerada para avaliação. A contratação depende de aprovação da seguradora e do pagamento
          do primeiro prêmio.
        </p>
        <p>
          {quote.status === "concluida" && quote.finishedAt
            ? `Concluída em ${formatDateTime(quote.finishedAt)}.`
            : "Documento em elaboração."}
        </p>
      </footer>
    </article>
  );
}
