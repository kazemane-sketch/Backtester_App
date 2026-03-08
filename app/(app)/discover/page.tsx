import { EtfScreener } from "@/components/discover/etf-screener";

export default function DiscoverPage() {
  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="font-[var(--font-heading)] text-2xl font-bold">Discover ETF</h1>
        <p className="text-sm text-muted-foreground">
          Ricerca semantica AI — cerca per strategia, indice, settore, paese, TER e altro.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <EtfScreener />
      </div>
    </div>
  );
}
