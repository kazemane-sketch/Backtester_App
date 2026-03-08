"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useEuMode } from "@/components/providers/eu-mode-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export type SelectedInstrument = {
  instrumentId: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  weight: number;
};

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
  filters: Record<string, unknown>;
  results: SearchResult[];
  explanation: string[];
};

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [delayMs, value]);

  return debounced;
}

async function fetchSuggestions(query: string, euMode: boolean) {
  const params = new URLSearchParams({
    q: query,
    type: "etf",
    limit: "12"
  });
  if (euMode) params.set("eu_mode", "true");

  const response = await fetch(`/api/instruments/suggest?${params.toString()}`);
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Search failed");
  }

  return (await response.json()) as SearchResult[];
}

async function fetchAiSearch(query: string, euMode: boolean) {
  const response = await fetch("/api/instruments/ai-search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      type: "etf",
      limit: 20,
      euMode
    })
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "AI search failed");
  }

  return (await response.json()) as AiSearchResponse;
}

type Props = {
  selected: SelectedInstrument[];
  onAdd: (instrument: SelectedInstrument) => void;
  onRemove: (instrumentId: string) => void;
  onWeightChange: (instrumentId: string, weight: number) => void;
};

export function InstrumentPanel({ selected, onAdd, onRemove, onWeightChange }: Props) {
  const { euMode } = useEuMode();
  const [query, setQuery] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiResult, setAiResult] = useState<AiSearchResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  // Standard suggestion search
  const suggestQuery = useQuery({
    queryKey: ["instrument-suggest", debouncedQuery, euMode],
    queryFn: () => fetchSuggestions(debouncedQuery, euMode),
    enabled: debouncedQuery.length >= 2 && !aiMode,
    staleTime: 1000 * 60 * 5
  });

  // AI search trigger
  async function runAiSearch() {
    const q = query.trim();
    if (q.length < 2) return;

    setAiLoading(true);
    setAiError(null);
    try {
      const result = await fetchAiSearch(q, euMode);
      setAiResult(result);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI search failed");
    } finally {
      setAiLoading(false);
    }
  }

  // Reset AI results when query changes
  useEffect(() => {
    if (aiMode && debouncedQuery.length >= 2) {
      void runAiSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, aiMode, euMode]);

  const results: SearchResult[] = useMemo(() => {
    if (aiMode && aiResult) return aiResult.results;
    return suggestQuery.data ?? [];
  }, [aiMode, aiResult, suggestQuery.data]);

  const isLoading = suggestQuery.isFetching || aiLoading;
  const selectedIds = new Set(selected.map((s) => s.instrumentId));
  const totalWeight = selected.reduce((sum, s) => sum + s.weight, 0);

  function handleAdd(result: SearchResult) {
    if (selectedIds.has(result.instrumentId)) return;

    // Auto-distribute: give remaining weight to new instrument
    const remaining = Math.max(0, 100 - totalWeight);
    onAdd({
      instrumentId: result.instrumentId,
      symbol: result.symbol,
      name: result.name,
      exchange: result.exchange,
      currency: result.currency,
      weight: selected.length === 0 ? 100 : remaining
    });
  }

  function handleEqualWeight() {
    if (selected.length === 0) return;
    const eachWeight = Math.round((100 / selected.length) * 100) / 100;
    selected.forEach((inst) => onWeightChange(inst.instrumentId, eachWeight));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Strumenti</h2>
          <p className="text-[11px] text-muted-foreground">
            Cerca e aggiungi ETF al backtest
          </p>
        </div>
        {euMode && (
          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
            EU Only
          </Badge>
        )}
      </div>

      {/* Search */}
      <div className="border-b p-3 space-y-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!aiMode) setAiMode(true);
                  else void runAiSearch();
                }
              }}
              placeholder="VWCE, S&P 500 ETF..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant={aiMode ? "default" : "outline"}
            className="h-8 w-8 shrink-0"
            onClick={() => setAiMode((v) => !v)}
            title={aiMode ? "AI Search attivo" : "Attiva AI Search"}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
        </div>

        {aiMode && aiResult?.interpretedQuery && (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">AI</Badge>
            <span className="text-[11px] text-muted-foreground truncate">
              {aiResult.interpretedQuery}
            </span>
          </div>
        )}
      </div>

      {/* Search results */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Ricerca...</span>
            </div>
          )}

          {!isLoading && debouncedQuery.length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Search className="h-5 w-5 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                Nessun risultato.{" "}
                {!aiMode && (
                  <button
                    type="button"
                    onClick={() => setAiMode(true)}
                    className="text-primary hover:underline"
                  >
                    Prova AI Search
                  </button>
                )}
              </p>
            </div>
          )}

          {results.map((result) => {
            const isSelected = selectedIds.has(result.instrumentId);

            return (
              <div
                key={`${result.instrumentId}-${result.symbol}`}
                className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                  isSelected
                    ? "border-primary/20 bg-primary/5"
                    : "border-transparent hover:border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{result.symbol}</span>
                    {result.exchange && (
                      <span className="text-[10px] text-muted-foreground">
                        {result.exchange}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {result.name}
                  </p>
                  {result.indexName && (
                    <p className="text-[10px] text-muted-foreground/70 truncate">
                      {result.indexName}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {isSelected ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleAdd(result)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {aiError && (
          <div className="px-3 pb-2">
            <p className="text-xs text-destructive">{aiError}</p>
          </div>
        )}
      </ScrollArea>

      {/* Selected instruments (bottom section) */}
      <div className="border-t">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium">
            Selezionati ({selected.length})
          </span>
          <div className="flex items-center gap-2">
            <Badge
              variant={Math.abs(totalWeight - 100) < 0.01 ? "default" : "outline"}
              className="text-[10px]"
            >
              {totalWeight.toFixed(1)}%
            </Badge>
            {selected.length > 1 && (
              <button
                type="button"
                onClick={handleEqualWeight}
                className="text-[10px] text-primary hover:underline"
              >
                Equal weight
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[200px]">
          <div className="px-3 pb-3 space-y-1">
            {selected.length === 0 && (
              <p className="py-3 text-center text-[11px] text-muted-foreground">
                Nessuno strumento selezionato
              </p>
            )}

            {selected.map((inst) => (
              <div
                key={inst.instrumentId}
                className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5"
              >
                <span className="text-xs font-medium min-w-[60px]">{inst.symbol}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={inst.weight}
                  onChange={(event) =>
                    onWeightChange(inst.instrumentId, Number(event.target.value))
                  }
                  className="h-6 w-16 rounded border bg-background px-1.5 text-center text-xs"
                />
                <span className="text-[10px] text-muted-foreground">%</span>
                <button
                  type="button"
                  onClick={() => onRemove(inst.instrumentId)}
                  className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
