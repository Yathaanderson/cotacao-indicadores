import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppShell } from "./components/AppShell";
import { useProfile } from "./hooks/useProfile";
import Inicio from "./pages/Inicio";
import NovaCotacao from "./pages/NovaCotacao";
import CotacaoDetalhe from "./pages/CotacaoDetalhe";
import Imprimir from "./pages/Imprimir";
import LinkPublico from "./pages/LinkPublico";
import Painel from "./pages/Painel";

/** O painel é exclusivo do responsável; qualquer outro perfil vê um aviso. */
function AdminRoute() {
  const { profile, loading, user } = useProfile();

  if (loading) {
    return (
      <AppShell>
        <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
      </AppShell>
    );
  }

  if (!user) return <AppShell>{null}</AppShell>;

  if (profile?.role !== "admin") {
    return (
      <AppShell>
        <div className="mx-auto max-w-md space-y-3 py-16 text-center">
          <h1 className="text-lg font-semibold">Área do responsável</h1>
          <p className="text-sm text-muted-foreground">
            Esta área é restrita a quem administra a conta. Suas cotações continuam disponíveis no início.
          </p>
          <Link href="/" className="text-sm font-medium text-primary underline underline-offset-4">
            Voltar para as cotações
          </Link>
        </div>
      </AppShell>
    );
  }

  return <Painel />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Inicio} />
      <Route path="/nova" component={NovaCotacao} />
      <Route path="/cotacoes/:id" component={CotacaoDetalhe} />
      <Route path="/cotacoes/:id/imprimir" component={Imprimir} />
      <Route path="/painel" component={AdminRoute} />
      {/* Link compartilhável: aberto sem login, somente leitura */}
      <Route path="/c/:token" component={LinkPublico} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;