import { cn } from "@/lib/utils";
import { STATUS_LABEL, type QuoteStatus } from "@/lib/quota";
import { useProfile } from "@/hooks/useProfile";
import { goToLogin } from "@/const";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  LogOut,
  Plus,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

export function Placa({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("placa", className)} aria-label={`Placa ${value}`}>
      <span>{value.toUpperCase()}</span>
    </span>
  );
}

export function SeloStatus({
  status,
  className,
}: {
  status: QuoteStatus;
  className?: string;
}) {
  return (
    <span className={cn("status-chip", `status-${status}`, className)}>
      <span className="status-dot" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

type NavItem = { href: string; label: string; icon: typeof ClipboardList };

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, loading, user, logout } = useProfile();
  const [location] = useLocation();
  const online = useOnline();

  const nav: NavItem[] = [
    { href: "/", label: "Cotações", icon: ClipboardList },
    { href: "/nova", label: "Nova", icon: Plus },
  ];
  if (profile?.role === "admin") {
    nav.push({ href: "/painel", label: "Painel", icon: ShieldCheck });
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">Cotações dos indicadores</h1>
            <p className="text-sm text-muted-foreground">
              Entre com sua conta para solicitar e acompanhar cotações de seguro auto.
            </p>
          </div>
          <Button className="w-full" size="lg" onClick={() => goToLogin()}>
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {!online && (
        <div className="no-print flex items-center justify-center gap-2 bg-secondary py-2 text-xs font-medium text-secondary-foreground">
          <WifiOff className="h-3.5 w-3.5" /> Sem conexão. Os dados voltam quando a rede retornar.
        </div>
      )}

      <header className="no-print sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="text-[0.95rem] font-semibold tracking-tight">
              Cotação<span className="text-primary">.</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(item => {
              const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="max-w-[13rem] truncate text-xs font-medium leading-tight">
                {profile?.indicator?.name ?? profile?.name ?? user.name ?? "Conta"}
              </p>
              <p className="text-[0.7rem] text-muted-foreground">
                {profile?.role === "admin" ? "Responsável" : profile?.indicator ? "Indicador" : "Acesso pendente"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair"
              onClick={() => void logout()}
              className="text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="no-print mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:pb-10">{children}</main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {nav.map(item => {
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}