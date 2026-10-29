import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useProfile";
import { LEAD_SOURCES, STATES, VEHICLE_TYPES, formatPlate } from "@/lib/quota";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

type FormState = {
  vehicleType: string;
  plate: string;
  brand: string;
  model: string;
  modelYear: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  state: string;
  city: string;
  leadSource: string;
  subOrigin: string;
  notes: string;
  optionalIds: number[];
};

const STEPS = ["Veículo", "Cliente", "Extras"] as const;

export default function NovaCotacao() {
  const [, navigate] = useLocation();
  const { profile } = useProfile();
  const utils = trpc.useUtils();

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    vehicleType: "carro-utilitario-pequeno",
    plate: "",
    brand: "",
    model: "",
    modelYear: "",
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    state: "PE",
    city: "",
    leadSource: "Indicação",
    subOrigin: "",
    notes: "",
    optionalIds: [],
  });

  const optionals = trpc.quotes.optionals.useQuery(undefined, { retry: false });

  const create = trpc.quotes.create.useMutation({
    onSuccess: async data => {
      await utils.quotes.mine.invalidate();
      navigate(`/cotacoes/${data.id}`);
    },
    onError: error => {
      setErrors({ submit: error.message });
    },
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key as string];
      delete next.submit;
      return next;
    });
  };

  const toggleOptional = (id: number) => {
    setForm(prev => ({
      ...prev,
      optionalIds: prev.optionalIds.includes(id)
        ? prev.optionalIds.filter(item => item !== id)
        : [...prev.optionalIds, id],
    }));
  };

  const validateStep = (current: number) => {
    const found: Record<string, string> = {};
    if (current === 1) {
      if (formatPlate(form.plate).length < 7) found.plate = "Informe a placa completa (7 caracteres).";
      if (form.modelYear && !/^\d{4}$/.test(form.modelYear)) found.modelYear = "Use o ano com 4 dígitos.";
    }
    if (current === 2) {
      if (form.clientName.trim().length < 3) found.clientName = "Informe o nome do cliente.";
      if (form.clientPhone.replace(/\D/g, "").length < 10) found.clientPhone = "Informe o celular com DDD.";
      if (form.city.trim().length < 2) found.city = "Informe a cidade.";
      if (form.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail))
        found.clientEmail = "E-mail inválido.";
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep(value => Math.min(value + 1, 3));
  };

  const submit = () => {
    if (!validateStep(1) || !validateStep(2)) {
      setStep(1);
      return;
    }
    create.mutate({
      vehicleType: form.vehicleType,
      plate: form.plate,
      brand: form.brand || null,
      model: form.model || null,
      modelYear: form.modelYear || null,
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      clientEmail: form.clientEmail.trim() || null,
      state: form.state,
      city: form.city.trim(),
      leadSource: form.leadSource || null,
      subOrigin: form.subOrigin || null,
      notes: form.notes.trim() || null,
      optionalIds: form.optionalIds,
    });
  };

  const selectedNames = useMemo(
    () => (optionals.data ?? []).filter(item => form.optionalIds.includes(item.id)).map(item => item.name),
    [optionals.data, form.optionalIds]
  );

  const blocked = !profile?.indicator;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-xl space-y-5 pb-24">
        <header className="space-y-3">
          <button
            type="button"
            onClick={() => (step === 1 ? navigate("/") : setStep(step - 1))}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {step === 1 ? "Início" : "Voltar"}
          </button>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Nova cotação</h1>
              <p className="text-sm text-muted-foreground">
                Etapa {step} de 3 · {STEPS[step - 1]}
              </p>
            </div>
            <div className="flex gap-1.5 pb-1" aria-hidden>
              {STEPS.map((label, index) => (
                <span
                  key={label}
                  className={cn(
                    "h-1.5 w-8 rounded-full",
                    index + 1 <= step ? "bg-primary" : "bg-border"
                  )}
                />
              ))}
            </div>
          </div>
        </header>

        {blocked && (
          <div className="rounded-xl border border-amber-200 bg-[#fdf3df] p-4 text-sm text-[#8a5a00]">
            Sua conta ainda não está vinculada a um indicador. Peça ao responsável para liberar seu acesso
            antes de criar cotações.
          </div>
        )}

        <div className="rounded-xl border bg-card p-4 sm:p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="vehicleType">Tipo de veículo</Label>
                <select
                  id="vehicleType"
                  value={form.vehicleType}
                  onChange={event => update("vehicleType", event.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {VEHICLE_TYPES.map(item => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                  <Lock className="h-3 w-3" /> O plano é definido automaticamente pelo sistema conforme o
                  veículo.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plate">Placa</Label>
                <Input
                  id="plate"
                  value={form.plate}
                  onChange={event => update("plate", event.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="h-11 font-mono tracking-widest"
                  maxLength={8}
                />
                {errors.plate && <p className="text-xs font-medium text-destructive">{errors.plate}</p>}
                <p className="text-[0.7rem] text-muted-foreground">
                  O sistema tenta identificar o veículo pela placa. Se não encontrar, completa pelos dados
                  abaixo.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="brand" className="text-muted-foreground">
                    Marca (opcional)
                  </Label>
                  <Input
                    id="brand"
                    value={form.brand}
                    onChange={event => update("brand", event.target.value)}
                    placeholder="Hyundai"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="modelYear" className="text-muted-foreground">
                    Ano (opcional)
                  </Label>
                  <Input
                    id="modelYear"
                    value={form.modelYear}
                    onChange={event => update("modelYear", event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="2024"
                    inputMode="numeric"
                    className="h-11 font-mono"
                  />
                  {errors.modelYear && <p className="text-xs text-destructive">{errors.modelYear}</p>}
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="model" className="text-muted-foreground">
                    Modelo (opcional)
                  </Label>
                  <Input
                    id="model"
                    value={form.model}
                    onChange={event => update("model", event.target.value)}
                    placeholder="HB20 Comfort"
                    className="h-11"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="clientName">Nome do cliente</Label>
                <Input
                  id="clientName"
                  value={form.clientName}
                  onChange={event => update("clientName", event.target.value)}
                  placeholder="Nome completo"
                  className="h-11"
                  autoComplete="off"
                />
                {errors.clientName && <p className="text-xs text-destructive">{errors.clientName}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="clientPhone">Celular</Label>
                  <Input
                    id="clientPhone"
                    value={form.clientPhone}
                    onChange={event => update("clientPhone", event.target.value)}
                    placeholder="(81) 99999-9999"
                    inputMode="tel"
                    className="h-11 font-mono"
                  />
                  {errors.clientPhone && <p className="text-xs text-destructive">{errors.clientPhone}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clientEmail" className="text-muted-foreground">
                    E-mail (opcional)
                  </Label>
                  <Input
                    id="clientEmail"
                    value={form.clientEmail}
                    onChange={event => update("clientEmail", event.target.value)}
                    placeholder="cliente@email.com"
                    inputMode="email"
                    className="h-11"
                  />
                  {errors.clientEmail && <p className="text-xs text-destructive">{errors.clientEmail}</p>}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="state">Estado</Label>
                  <select
                    id="state"
                    value={form.state}
                    onChange={event => update("state", event.target.value)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {STATES.map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={event => update("city", event.target.value)}
                    placeholder="Caruaru"
                    className="h-11"
                  />
                  {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="leadSource" className="text-muted-foreground">
                    Origem do lead (opcional)
                  </Label>
                  <select
                    id="leadSource"
                    value={form.leadSource}
                    onChange={event => update("leadSource", event.target.value)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {LEAD_SOURCES.map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subOrigin" className="text-muted-foreground">
                    Suborigem (opcional)
                  </Label>
                  <Input
                    id="subOrigin"
                    value={form.subOrigin}
                    onChange={event => update("subOrigin", event.target.value)}
                    placeholder="Afiliado"
                    className="h-11"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold">Opcionais do plano</h2>
                <p className="text-xs text-muted-foreground">
                  Marque apenas o que o cliente pediu. O plano continua sendo definido pelo sistema.
                </p>
              </div>

              {optionals.isLoading && (
                <div className="space-y-2">
                  {[0, 1].map(index => (
                    <div key={index} className="h-14 animate-pulse rounded-lg bg-muted/50" />
                  ))}
                </div>
              )}

              {!optionals.isLoading && (optionals.data ?? []).length === 0 && (
                <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                  Nenhum opcional disponível no momento.
                </p>
              )}

              <ul className="space-y-2">
                {(optionals.data ?? []).map(item => {
                  const checked = form.optionalIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          checked ? "border-primary/60 bg-accent/60" : "hover:bg-muted/40"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border",
                            checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                          )}
                        >
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleOptional(item.id)}
                        />
                        <span>
                          <span className="block text-sm font-medium">{item.name}</span>
                          {item.description && (
                            <span className="block text-xs text-muted-foreground">{item.description}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-muted-foreground">
                  Observações (opcional)
                </Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={event => update("notes", event.target.value.slice(0, 2000))}
                  placeholder="Algo que o responsável precise saber sobre este pedido."
                  rows={3}
                />
              </div>

              <div className="rounded-lg border bg-secondary/60 p-3.5 text-sm">
                <p className="font-semibold">Resumo</p>
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt>Veículo</dt>
                    <dd className="text-right font-medium text-foreground">
                      {VEHICLE_TYPES.find(item => item.value === form.vehicleType)?.label}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Placa</dt>
                    <dd className="font-mono font-medium text-foreground">{formatPlate(form.plate)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Cliente</dt>
                    <dd className="max-w-[60%] truncate text-right font-medium text-foreground">
                      {form.clientName || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Opcionais</dt>
                    <dd className="max-w-[60%] text-right font-medium text-foreground">
                      {selectedNames.length ? selectedNames.join(", ") : "nenhum"}
                    </dd>
                  </div>
                </dl>
              </div>

              {errors.submit && (
                <p className="rounded-lg bg-[#fbeae8] p-3 text-sm text-[#8b2b22]">{errors.submit}</p>
              )}
            </div>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <div className="mx-auto flex max-w-xl gap-3">
            {step > 1 && (
              <Button variant="outline" size="lg" className="h-12" onClick={() => setStep(step - 1)}>
                Voltar
              </Button>
            )}
            {step < 3 ? (
              <Button size="lg" className="h-12 flex-1 gap-2" onClick={next} disabled={blocked}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="lg"
                className="h-12 flex-1 gap-2"
                onClick={submit}
                disabled={blocked || create.isPending}
              >
                {create.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                  </>
                ) : (
                  <>
                    Enviar cotação <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}