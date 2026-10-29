import { FolhaCotacao } from "@/components/FolhaCotacao";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { QuoteStatus } from "@/lib/quota";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "wouter";

export default function Imprimir() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const query = trpc.quotes.byId.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0, retry: false }
  );

  useEffect(() => {
    if (!query.data) return;
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, [query.data]);

  if (query.isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Preparando…</div>;
  }

  if (!query.data) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium">Cotação indisponível para impressão.</p>
          <Button asChild variant="outline">
            <Link href="/">Voltar</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { quote } = query.data;

  return (
    <div className="min-h-screen bg-white p-4 sm:p-8">
      <div className="no-print mx-auto mb-4 flex w-full max-w-[210mm] items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href={`/cotacoes/${quote.id}`}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <Button size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Salvar em PDF
        </Button>
      </div>

      <FolhaCotacao
        quote={{
          ...quote,
          status: quote.status as QuoteStatus,
        }}
      />

      <p className="no-print mx-auto mt-4 max-w-[210mm] text-center text-xs text-muted-foreground">
        No celular, escolha “Imprimir” e depois “Salvar em PDF” para guardar ou enviar o arquivo.
      </p>
    </div>
  );
}