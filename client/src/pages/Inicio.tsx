import { AppShell, Placa, SeloStatus } from "@/components/AppShell";
import { useProfile } from "@/hooks/useProfile";
import { trpc } from "@/lib/trpc";
import { STATUS_HINT, formatDateTime, vehicleLabel, type QuoteStatus } from "@/lib/quota";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { Link } from "wouter";

const ACTIVE: QuoteStatus[] = ["pendente", "processando"];

export default function Inicio() {
  const { profile, profileLoading } = useProfile();
  const indicator = profile?.indicator ?? null;

  const quotes = trpc.quotes.mine.useQuery(undefined, {
    enabled: Boolean(indicator),
    refetchInterval: query =>
      (query.state.data ?? []).some(item => ACTIVE.includes(item.status as QuoteStatus))
        ? 7000
        : false,
  });

  const firstName = (indicator?.name ?? profile?.name ?? "").split(" ")[0];
  const list = quotes.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Painel do indicador
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {profileLoading ? "Carregando…" : firstName ? `Olá, ${firstName}` : "Cotações"}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Peça a cotação com a placa e os dados do cliente. O plano é escolhido pelo sistema e você recebe
            o resultado pronto para enviar.
          </p>
        </section>

        {!profileLoading && !indicator && (
          <section className="rounded-xl border border-amber-200 bg-[#fdf3df] p-4 text-sm text-[#8a5a00]">
            <p className="font-semibold">Acesso ainda não liberado</p>
            <p className="mt-1 leading-relaxed">
              Sua conta entrou, mas ainda não está vinculada a um indicador. Peça ao responsável para
              cadastrar este e-mail ({profile?.email ?? "seu e-mail"}) na lista de indicadores.
            </p>
          </section>
        )}

        <Button asChild size="lg" className="h-12 w-full max-w-sm gap-2 shadow-sm">
          <Link href="/nova">
            <Plus className="h-4 w-4" /> Nova cotação
          </Link>
        </Button>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Suas cotações
            </h2>
            {list.length > 0 && (
              <span className="text-xs text-muted-foreground">{list.length} pedido(s)</span>
            )}
          </div>

          {quotes.isLoading && indicator && (
            <div className="space-y-2">
              {[0, 1, 2].map(index => (
                <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/40" />
              ))}
            </div>
          )}

          {!quotes.isLoading && list.length === 0 && indicator && (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">Nenhuma cotação ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Comece pela placa do veículo. Em poucos minutos a cotação aparece aqui.
              </p>
            </div>
          )}

          <ul className="space-y-2.5">
            {list.map(quote => {
              const status = quote.status as QuoteStatus;
              return (
                <li key={quote.id}>
                  <Link
                    href={`/cotacoes/${quote.id}`}
                    className="group flex items-stretch gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <span
                      className={`mt-0.5 w-1 shrink-0 rounded-full ${
                        status === "concluida"
                          ? "bg-[#1f6b45]"
                          : status === "falha"
                            ? "bg-[#b3261e]"
                            : status === "processando"
                              ? "bg-primary"
                              : "bg-[#d9a441]"
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Placa value={quote.plate} />
                        <SeloStatus status={status} />
                      </div>
                      <p className="mt-2 truncate text-sm font-medium">
                        {quote.brand || quote.model
                          ? [quote.brand, quote.model].filter(Boolean).join(" ")
                          : vehicleLabel(quote.vehicleType)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {quote.clientName} · {quote.city}/{quote.state}
                      </p>
                      <p className="mt-1 text-[0.7rem] text-muted-foreground">
                        {formatDateTime(quote.createdAt)}
                        {status === "concluida" && quote.monthlyPrice
                          ? ` · ${Number(quote.monthlyPrice).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}/mês`
                          : ` · ${STATUS_HINT[status]}`}
                      </p>
                    </div>
                    <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}