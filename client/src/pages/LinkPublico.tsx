import { FolhaCotacao } from "@/components/FolhaCotacao";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { QuoteStatus } from "@/lib/quota";
import { MessageCircle, Printer } from "lucide-react";
import { useParams } from "wouter";

export default function LinkPublico() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const query = trpc.quotes.public.useQuery(
    { token },
    { enabled: token.length >= 10, retry: false }
  );

  if (query.isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando cotação…</div>;
  }

  if (!query.data) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Cotação não encontrada</h1>
          <p className="text-sm text-muted-foreground">
            O link pode ter expirado ou sido digitado incorretamente. Peça um novo link ao seu corretor.
          </p>
        </div>
      </div>
    );
  }

  const quote = query.data;
  const ready = quote.status === "concluida";
  const text = ready
    ? `Cotação ${quote.quoteNumber ?? ""} — ${quote.planName ?? "plano"} — ${quote.monthlyPrice ?? ""}`.trim()
    : "Cotação em elaboração.";

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Proposta de seguro auto</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Salvar em PDF
          </Button>
          <Button asChild size="sm" className="gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${typeof window !== "undefined" ? window.location.href : ""}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-4 w-4" /> Compartilhar
            </a>
          </Button>
        </div>
      </div>

      <FolhaCotacao quote={{ ...quote, status: quote.status as QuoteStatus }} />

      <p className="no-print mx-auto mt-6 max-w-[210mm] text-center text-[0.7rem] text-muted-foreground">
        Documento gerado pelo sistema de cotações.
      </p>
    </div>
  );
}