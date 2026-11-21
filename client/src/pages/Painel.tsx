import { AppShell, Placa, SeloStatus } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  STATUS_HINT,
  formatDateTime,
  formatMoney,
  vehicleLabel,
  type QuoteStatus,
} from "@/lib/quota";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

const FILTERS: { value: QuoteStatus | "todas"; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "pendente", label: "Na fila" },
  { value: "processando", label: "Processando" },
  { value: "concluida", label: "Concluídas" },
  { value: "falha", label: "Falhas" },
];

type Tab = "cotacoes" | "indicadores" | "opcionais" | "conexao";

export default function Painel() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("cotacoes");
  const [filter, setFilter] = useState<QuoteStatus | "todas">("todas");
  const [selected, setSelected] = useState<number | null>(null);
  const [newIndicator, setNewIndicator] = useState({ name: "", email: "", phone: "", password: "" });
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [crm, setCrm] = useState({ email: "", password: "" });

  const overview = trpc.admin.overview.useQuery(undefined, { refetchInterval: 12_000 });
  const optionals = trpc.admin.optionals.useQuery(undefined, { enabled: tab === "opcionais" });

  const detail = trpc.quotes.byId.useQuery(
    { id: selected ?? 0 },
    { enabled: Boolean(selected), retry: false }
  );

  const setPaused = trpc.admin.setPaused.useMutation({
    onSuccess: async () => {
      await utils.admin.overview.invalidate();
      toast.success("Preferência atualizada.");
    },
  });

  const createIndicator = trpc.admin.createIndicator.useMutation({
    onSuccess: async () => {
      setNewIndicator({ name: "", email: "", phone: "", password: "" });
      await utils.admin.overview.invalidate();
      toast.success("Indicador cadastrado. Informe a ele o e-mail e a senha inicial.");
    },
    onError: error => toast.error(error.message),
  });

  const resetIndicatorPassword = trpc.admin.resetIndicatorPassword.useMutation({
    onSuccess: async () => {
      setResetId(null);
      setResetPassword("");
      await utils.admin.overview.invalidate();
      toast.success("Senha redefinida. Informe a nova senha ao indicador.");
    },
    onError: error => toast.error(error.message),
  });

  const toggleIndicator = trpc.admin.setIndicatorActive.useMutation({
    onSuccess: async () => {
      await utils.admin.overview.invalidate();
    },
  });

  const toggleOptional = trpc.admin.setOptionalActive.useMutation({
    onSuccess: async () => {
      await utils.admin.optionals.invalidate();
    },
  });

  const retry = trpc.admin.retry.useMutation({
    onSuccess: async () => {
      await utils.admin.overview.invalidate();
      await utils.quotes.byId.invalidate({ id: selected ?? 0 });
      toast.success("Pedido devolvido à fila.");
    },
    onError: error => toast.error(error.message),
  });

  const powercrm = trpc.admin.powercrm.useQuery(undefined, { enabled: tab === "conexao" });

  const connectPowercrm = trpc.admin.connectPowercrm.useMutation({
    onSuccess: async () => {
      setCrm({ email: "", password: "" });
      await utils.admin.powercrm.invalidate();
      await utils.admin.overview.invalidate();
      toast.success("PowerCRM conectado. A automação real já está ativa.");
    },
    onError: error => toast.error(error.message),
  });

  const disconnectPowercrm = trpc.admin.disconnectPowercrm.useMutation({
    onSuccess: async () => {
      await utils.admin.powercrm.invalidate();
      await utils.admin.overview.invalidate();
      toast.success("PowerCRM desconectado. A automação voltou ao modo simulado.");
    },
    onError: error => toast.error(error.message),
  });

  const setDriver = trpc.admin.setDriver.useMutation({
    onSuccess: async () => {
      await utils.admin.powercrm.invalidate();
      await utils.admin.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const quotes = overview.data?.quotes ?? [];
  const filtered = useMemo(
    () => (filter === "todas" ? quotes : quotes.filter(quote => quote.status === filter)),
    [quotes, filter]
  );

  const totals = overview.data?.totals ?? {};
  const driver = overview.data?.driver ?? "simulado";
  const paused = overview.data?.paused ?? false;

  const stats = [
    { key: "pendente", label: "Na fila", value: totals.pendente ?? 0, icon: Clock, tone: "text-[#8a5a00]" },
    { key: "processando", label: "Processando", value: totals.processando ?? 0, icon: Loader2, tone: "text-primary" },
    { key: "concluida", label: "Concluídas", value: totals.concluida ?? 0, icon: CheckCircle2, tone: "text-[#1f6b45]" },
    { key: "falha", label: "Falhas", value: totals.falha ?? 0, icon: AlertTriangle, tone: "text-[#b3261e]" },
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Painel do responsável</h1>
            <p className="text-sm text-muted-foreground">
              Fiscalização das cotações. Nada é enviado ao cliente sem o indicador.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
                driver === "powercrm" ? "bg-[#e7f4ec] text-[#1f6b45]" : "bg-[#fdf3df] text-[#8a5a00]"
              )}
            >
              Executor: {driver === "powercrm" ? "PowerCRM" : "simulado"}
            </span>
            <Button
              variant={paused ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => setPaused.mutate({ paused: !paused })}
              disabled={setPaused.isPending}
            >
              {paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
              {paused ? "Retomar automação" : "Pausar automação"}
            </Button>
          </div>
        </header>

        {paused && (
          <div className="rounded-lg border border-amber-200 bg-[#fdf3df] px-3 py-2.5 text-sm text-[#8a5a00]">
            A automação está pausada. Novos pedidos continuam sendo aceitos, mas ficam na fila até você retomar.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {stats.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn("h-3.5 w-3.5", item.tone, item.key === "processando" && "animate-spin")} />
                  <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </p>
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold">
                  {overview.isLoading ? "—" : item.value}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              { value: "cotacoes", label: "Cotações" },
              { value: "indicadores", label: `Indicadores${overview.data ? ` (${overview.data.indicators.length})` : ""}` },
              { value: "opcionais", label: "Opcionais" },
              { value: "conexao", label: "Conexão" },
            ] as { value: Tab; label: string }[]
          ).map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 font-medium transition-colors",
                tab === item.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "cotacoes" && (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <section className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      filter === item.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {overview.isLoading && (
                <div className="space-y-2">
                  {[0, 1, 2].map(index => (
                    <div key={index} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                  ))}
                </div>
              )}

              {!overview.isLoading && filtered.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma cotação neste filtro.
                </p>
              )}

              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {filtered.map(quote => {
                  const status = quote.status as QuoteStatus;
                  return (
                    <li key={quote.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(quote.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50",
                          selected === quote.id && "bg-accent/60"
                        )}
                      >
                        <Placa value={quote.plate} className="shrink-0 text-[0.7rem]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{quote.indicatorName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {quote.clientName} · {formatDateTime(quote.createdAt)}
                          </p>
                        </div>
                        <SeloStatus status={status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="space-y-3">
              {!selected && (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Selecione uma cotação para ver a trilha e os valores.
                </div>
              )}

              {selected && detail.data && (
                <div className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Placa value={detail.data.quote.plate} />
                      <p className="mt-2 text-sm font-semibold">
                        {[detail.data.quote.brand, detail.data.quote.model].filter(Boolean).join(" ") ||
                          vehicleLabel(detail.data.quote.vehicleType)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {detail.data.quote.indicatorName} · {detail.data.quote.clientName}
                      </p>
                    </div>
                    <SeloStatus status={detail.data.quote.status as QuoteStatus} />
                  </div>

                  {detail.data.quote.status === "concluida" && (
                    <div className="rounded-lg bg-secondary p-3 text-sm">
                      <p className="font-medium">{detail.data.quote.planName ?? "Plano do sistema"}</p>
                      <p className="font-mono text-base font-semibold">
                        {formatMoney(detail.data.quote.monthlyPrice)}
                      </p>
                    </div>
                  )}

                  {detail.data.quote.status === "falha" && (
                    <div className="rounded-lg bg-[#fbeae8] p-3 text-sm text-[#8b2b22]">
                      <p className="font-medium">{STATUS_HINT.falha}</p>
                      <p className="mt-1 text-xs leading-relaxed">
                        {detail.data.quote.errorMessage ?? "Motivo não registrado."}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 gap-1.5"
                        onClick={() => retry.mutate({ id: detail.data!.quote.id })}
                        disabled={retry.isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                      </Button>
                    </div>
                  )}

                  <div>
                    <p className="field-label">Trilha</p>
                    <ol className="mt-2 space-y-2">
                      {detail.data.events.map(event => (
                        <li key={event.id} className="text-xs">
                          <p className="text-foreground">{event.message}</p>
                          <p className="text-[0.68rem] text-muted-foreground">
                            {formatDateTime(event.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {selected && detail.isLoading && (
                <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
              )}
            </section>
          </div>
        )}

        {tab === "indicadores" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-xl border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Novo indicador
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Defina uma senha inicial e informe ao indicador. Ele entra com o e-mail e essa senha.
              </p>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ind-name">Nome</Label>
                  <Input
                    id="ind-name"
                    value={newIndicator.name}
                    onChange={event => setNewIndicator(prev => ({ ...prev, name: event.target.value }))}
                    placeholder="Nome do indicador"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ind-email">E-mail</Label>
                  <Input
                    id="ind-email"
                    type="email"
                    value={newIndicator.email}
                    onChange={event => setNewIndicator(prev => ({ ...prev, email: event.target.value }))}
                    placeholder="nome@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ind-phone">Celular (opcional)</Label>
                  <Input
                    id="ind-phone"
                    value={newIndicator.phone}
                    onChange={event => setNewIndicator(prev => ({ ...prev, phone: event.target.value }))}
                    placeholder="(81) 99999-9999"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ind-password">Senha inicial</Label>
                  <Input
                    id="ind-password"
                    type="text"
                    autoComplete="off"
                    value={newIndicator.password}
                    onChange={event => setNewIndicator(prev => ({ ...prev, password: event.target.value }))}
                    placeholder="Mínimo de 8 caracteres"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={createIndicator.isPending || !newIndicator.name || !newIndicator.email || newIndicator.password.length < 8}
                  onClick={() => createIndicator.mutate(newIndicator)}
                >
                  {createIndicator.isPending ? "Cadastrando…" : "Cadastrar indicador"}
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              {(overview.data?.indicators ?? []).length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum indicador cadastrado ainda.
                </p>
              )}
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {(overview.data?.indicators ?? []).map(indicator => (
                  <li key={indicator.id} className="flex items-center gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{indicator.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{indicator.email}</p>
                      <p className="text-[0.68rem] text-muted-foreground">
                        {indicator.userId ? "conta criada" : "sem conta de acesso"}
                      </p>
                      {resetId === indicator.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            aria-label="Nova senha"
                            type="text"
                            autoComplete="off"
                            value={resetPassword}
                            onChange={event => setResetPassword(event.target.value)}
                            placeholder="Nova senha (mín. 8)"
                            className="h-8"
                          />
                          <Button
                            size="sm"
                            disabled={resetIndicatorPassword.isPending || resetPassword.length < 8}
                            onClick={() =>
                              resetIndicatorPassword.mutate({ id: indicator.id, password: resetPassword })
                            }
                          >
                            Salvar
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Button
                        size="sm"
                        variant={indicator.active ? "outline" : "secondary"}
                        onClick={() =>
                          toggleIndicator.mutate({ id: indicator.id, active: !indicator.active })
                        }
                      >
                        {indicator.active ? "Ativo" : "Desativado"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setResetPassword("");
                          setResetId(resetId === indicator.id ? null : indicator.id);
                        }}
                      >
                        Redefinir senha
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === "opcionais" && (
          <section className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Estes são os opcionais que o indicador pode marcar. Desative o que não estiver disponível no plano.
            </p>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {(optionals.data ?? []).map(optional => (
                <li key={optional.id} className="flex items-start gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{optional.name}</p>
                    {optional.description && (
                      <p className="text-xs text-muted-foreground">{optional.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={optional.active ? "outline" : "secondary"}
                    onClick={() => toggleOptional.mutate({ id: optional.id, active: !optional.active })}
                  >
                    {optional.active ? "Ativo" : "Desativado"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "conexao" && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <section className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Plug className="h-4 w-4" /> Conexão com o PowerCRM
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O PowerCRM não liberou API. A automação entra pela interface web com o seu login.
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
                    powercrm.data?.info?.status === "conectada"
                      ? "bg-[#e7f4ec] text-[#1f6b45]"
                      : "bg-[#fdf3df] text-[#8a5a00]"
                  )}
                >
                  {powercrm.data?.info?.status === "conectada" ? "Sessão ativa" : "Não conectado"}
                </span>
              </div>

              {powercrm.data?.info ? (
                <div className="mt-3 space-y-1 rounded-lg bg-secondary p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#1f6b45]" />
                    {powercrm.data.info.account}
                  </p>
                  <p className="text-muted-foreground">
                    Conectado em {formatDateTime(powercrm.data.info.connectedAt)}
                  </p>
                  {powercrm.data.info.status === "expirada" && (
                    <p className="text-[#8b2b22]">
                      A sessão expirou. Entre novamente para a automação real voltar a funcionar.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Nenhuma sessão salva. Enquanto não conectar, as cotações são atendidas pelo executor simulado.
                </p>
              )}

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="crm-email">E-mail do PowerCRM</Label>
                  <Input
                    id="crm-email"
                    type="email"
                    autoComplete="username"
                    value={crm.email}
                    onChange={event => setCrm(prev => ({ ...prev, email: event.target.value }))}
                    placeholder="seu@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-password">Senha</Label>
                  <Input
                    id="crm-password"
                    type="password"
                    autoComplete="current-password"
                    value={crm.password}
                    onChange={event => setCrm(prev => ({ ...prev, password: event.target.value }))}
                    placeholder="Sua senha do PowerCRM"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-2"
                    disabled={connectPowercrm.isPending || !crm.email || !crm.password}
                    onClick={() => connectPowercrm.mutate(crm)}
                  >
                    {connectPowercrm.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    {connectPowercrm.isPending ? "Conectando…" : "Conectar"}
                  </Button>
                  {powercrm.data?.info && (
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={disconnectPowercrm.isPending}
                      onClick={() => disconnectPowercrm.mutate()}
                    >
                      <Unplug className="h-4 w-4" />
                      {disconnectPowercrm.isPending ? "Desconectando…" : "Desconectar"}
                    </Button>
                  )}
                </div>
                <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
                  A senha é usada só para abrir a sessão e não fica salva. O app guarda apenas a sessão
                  autenticada, que pode ser encerrada a qualquer momento.
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <div className="rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold">Executor das cotações</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  O simulado cria a cotação de teste. O PowerCRM envia de verdade pelo sistema.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant={driver === "simulado" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDriver.mutate({ driver: "simulado" })}
                    disabled={setDriver.isPending}
                  >
                    Simulado
                  </Button>
                  <Button
                    variant={driver === "powercrm" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDriver.mutate({ driver: "powercrm" })}
                    disabled={setDriver.isPending || powercrm.data?.info?.status !== "conectada"}
                  >
                    PowerCRM
                  </Button>
                </div>
                {powercrm.data?.info?.status !== "conectada" && (
                  <p className="mt-2 text-[0.7rem] text-muted-foreground">
                    Conecte o PowerCRM para liberar o executor real.
                  </p>
                )}
              </div>

              <div className="rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4" /> Como a conexão funciona
                </h2>
                <p>
                  O login é feito uma vez e a sessão fica guardada no servidor. Cada cotação usa essa sessão
                  para preencher o PowerCRM. Quando o PowerCRM encerra a sessão, o painel avisa e basta entrar
                  de novo — as cotações que falharem podem ser reenviadas com um toque.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
