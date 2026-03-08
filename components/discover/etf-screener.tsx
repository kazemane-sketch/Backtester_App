"use client";

import { FormEvent, useState } from "react";
import {
  ArrowUpDown,
  Filter,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X
} from "lucide-react";
import Link from "next/link";

import { useEuMode } from "@/components/providers/eu-mode-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type SearchResult = {
  instrumentId: string;
  symbol: string;
  name: string;
  isin: string | null;
  type: string;
  exchange: string | null;
  currency: string | null;
  indexName: string | null;
  domicile: string | null;
  score: number;
  source: "db" | "eodhd";
};

type AiSearchResponse = {
  query_it: string;
  query_en: string;
  interpretedQuery: string;
  filters: {
    keywords?: string[];
    index_contains?: string | null;
    country_exposure?: Array<{
      country: string;
      min?: number;
      max?: number;
    }>;
    domicile?: string | null;
    currency?: string | null;
    accumulation?: string | null;
  };
  results: SearchResult[];
  explanation: string[];
};

type SortField = "score" | "name" | "symbol";
type SortDirection = "asc" | "desc";

const EXAMPLE_QUERIES = [
  "S&P 500 UCITS ETF with low TER",
  "Emerging markets excluding China",
  "Global technology ETF accumulating",
  "European dividend ETF",
  "All-world ETF physical replication",
  "AI and robotics ETF available in Europe"
];

export function EtfScreener() {
  const { euMode } = useEuMode();
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiSearchResponse | null>(null);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  async function handleSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/instruments/ai-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: q,
          type: "etf",
          limit: 30,
          eu_mode: euMode
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Search failed");
      }

      setResult(payload as AiSearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "score" ? "desc" : "asc");
    }
  }

  const sortedResults = result
    ? [...result.results].sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortField === "score") return (a.score - b.score) * dir;
        if (sortField === "name") return a.name.localeCompare(b.name) * dir;
        return a.symbol.localeCompare(b.symbol) * dir;
      })
    : [];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Search bar */}
      <div className="space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca ETF con ricerca semantica AI..."
              className="h-10 pl-10 text-sm"
            />
          </div>
          <Button type="submit" disabled={isLoading || query.trim().length < 2}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Cerca</span>
          </Button>
        </form>

        {/* Quick query chips */}
        {!result && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  // Trigger search immediately
                  setTimeout(() => {
                    const form = document.querySelector<HTMLFormElement>("form");
                    form?.requestSubmit();
                  }, 50);
                }}
                className="rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active filters display */}
      {result && (
        <div className="flex flex-wrap items-center gap-2">
          {result.interpretedQuery && (
            <div className="flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {result.interpretedQuery}
              </span>
            </div>
          )}
          {result.filters?.keywords?.map((kw) => (
            <Badge key={kw} variant="secondary" className="text-[10px]">
              {kw}
            </Badge>
          ))}
          {result.filters?.domicile && (
            <Badge variant="outline" className="text-[10px]">
              Domicile: {result.filters.domicile}
            </Badge>
          )}
          {result.filters?.accumulation && (
            <Badge variant="outline" className="text-[10px]">
              {result.filters.accumulation}
            </Badge>
          )}
          {euMode && (
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              EU Only
            </Badge>
          )}
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setQuery("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Results count + sort controls */}
      {result && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {sortedResults.length} risultati
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-1">Ordina:</span>
            {(["score", "symbol", "name"] as SortField[]).map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => handleSort(field)}
                className={`flex items-center gap-0.5 rounded px-2 py-0.5 text-[11px] transition-colors ${
                  sortField === field
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {field === "score" ? "Rilevanza" : field === "symbol" ? "Ticker" : "Nome"}
                {sortField === field && (
                  <ArrowUpDown className="h-2.5 w-2.5" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Results grid */}
      {result && (
        <ScrollArea className="flex-1 -mx-1">
          <div className="grid gap-3 px-1 sm:grid-cols-2 xl:grid-cols-3">
            {sortedResults.map((etf) => (
              <EtfCard key={`${etf.instrumentId}-${etf.symbol}`} etf={etf} />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">
              Ricerca semantica in corso...
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
              <Search className="h-7 w-7 text-accent" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Scopri ETF</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Usa la ricerca semantica AI per trovare ETF per strategia, indice, settore, paese e molto altro.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EtfCard({ etf }: { etf: SearchResult }) {
  return (
    <Card className="group overflow-hidden transition-all hover:shadow-md hover:border-primary/20">
      <CardContent className="p-4 space-y-2.5">
        {/* Top row: Symbol + Exchange */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{etf.symbol}</span>
              {etf.exchange && (
                <Badge variant="secondary" className="text-[10px]">
                  {etf.exchange}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {etf.name}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <Badge
              variant="outline"
              className="text-[10px] tabular-nums"
            >
              {(etf.score * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {etf.currency && (
            <span>{etf.currency}</span>
          )}
          {etf.domicile && (
            <span>Domicile: {etf.domicile}</span>
          )}
          {etf.isin && (
            <span className="font-mono">{etf.isin}</span>
          )}
        </div>

        {/* Index */}
        {etf.indexName && (
          <p className="text-[11px] text-muted-foreground/80 line-clamp-1">
            Index: {etf.indexName}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/backtests/new?instrument=${etf.instrumentId}&symbol=${etf.symbol}`}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Add to Strategy
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
