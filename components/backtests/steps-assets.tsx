"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SmartSuggestion = {
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
  };
  results: SmartSuggestion[];
  explanation: string[];
};

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [delayMs, value]);

  return debounced;
}

async function fetchSuggestions(query: string) {
  const params = new URLSearchParams({
    q: query,
    type: "etf",
    limit: "10"
  });

  const response = await fetch(`/api/instruments/suggest?${params.toString()}`, {
    method: "GET"
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Suggest failed");
  }

  return (await response.json()) as SmartSuggestion[];
}

async function fetchAiSearch(query: string) {
  const response = await fetch("/api/instruments/ai-search", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      query,
      type: "etf",
      limit: 20
    })
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "AI search failed");
  }

  return (await response.json()) as AiSearchResponse;
}

function AssetQueryRow({
  asset,
  onChange,
  onSelectInstrument,
  onRemove,
  canRemove
}: {
  asset: BacktestConfig["assets"][number];
  onChange: (query: string) => void;
  onSelectInstrument: (instrument: SmartSuggestion) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showAiResults, setShowAiResults] = useState(false);
  const [lastAiQuery, setLastAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState<AiSearchResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const queryValue = asset.query ?? "";
  const normalizedQuery = queryValue.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, 250);

  const suggestQuery = useQuery({
    queryKey: ["smart-suggest", debouncedQuery],
    queryFn: () => fetchSuggestions(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60 * 5
  });

  async function runAiSearch(rawQuery: string) {
    const nextQuery = rawQuery.trim();
    if (nextQuery.length < 2) {
      return;
    }

    setShowAiResults(true);
    setLastAiQuery(nextQuery);
    setAiError(null);
    setIsAiLoading(true);

    try {
      const payload = await fetchAiSearch(nextQuery);
      setAiResponse(payload);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI search failed");
    } finally {
      setIsAiLoading(false);
    }
  }

  useEffect(() => {
    if (!aiEnabled) {
      return;
    }

    if (debouncedQuery.length < 2) {
      return;
    }

    if (debouncedQuery === lastAiQuery) {
      return;
    }

    void runAiSearch(debouncedQuery);
  }, [aiEnabled, debouncedQuery, lastAiQuery]);

  useEffect(() => {
    if (!aiEnabled && normalizedQuery !== lastAiQuery) {
      setShowAiResults(false);
    }
  }, [aiEnabled, lastAiQuery, normalizedQuery]);

  const showAiList =
    showAiResults && normalizedQuery.length >= 2 && aiResponse !== null && normalizedQuery === lastAiQuery;

  const visibleListings = useMemo(() => {
    if (showAiList) {
      return aiResponse?.results ?? [];
    }

    return suggestQuery.data ?? [];
  }, [aiResponse, showAiList, suggestQuery.data]);

  const showEnterAiCta =
    !showAiList &&
    !suggestQuery.isFetching &&
    (suggestQuery.data?.length ?? 0) === 0 &&
    normalizedQuery.includes(" ") &&
    normalizedQuery.length >= 2;

  const interpretedLabel = showAiList ? aiResponse?.interpretedQuery : "";
  const isLoading = suggestQuery.isFetching || isAiLoading;

  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div className="space-y-2">
          <Label>Ticker / Nome / ISIN</Label>
          <Input
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runAiSearch(queryValue);
              }
            }}
            placeholder="es. VWCE, iShares Core MSCI World..."
            value={queryValue}
          />
        </div>
        <Button
          onClick={() => setAiEnabled((enabled) => !enabled)}
          size="icon"
          title={aiEnabled ? "AI search attivo" : "Attiva AI search"}
          type="button"
          variant={aiEnabled ? "default" : "outline"}
        >
          <Sparkles className="h-4 w-4" />
        </Button>
        <Button disabled={!canRemove} onClick={onRemove} size="icon" type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Ricerca strumenti...
        </p>
      ) : null}

      {interpretedLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">Interpreted query</Badge>
          <span className="text-muted-foreground">{interpretedLabel}</span>
        </div>
      ) : null}

      {visibleListings.length ? (
        <div className="mt-3 space-y-2">
          {visibleListings.map((listing) => {
            const isSelected =
              asset.resolvedInstrumentId === listing.instrumentId ||
              queryValue.toUpperCase() === listing.symbol.toUpperCase();

            return (
              <div
                className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs ${
                  isSelected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                }`}
                key={`${listing.instrumentId}-${listing.symbol}`}
              >
                <Badge variant="secondary">{showAiList ? "AI" : "Suggest"}</Badge>
                <span>
                  {listing.symbol} · {listing.name}
                </span>
                <span className="text-muted-foreground">
                  {listing.exchange ?? "N/A"} · {listing.currency ?? "N/A"}
                </span>
                {listing.indexName ? <span className="text-muted-foreground">Index: {listing.indexName}</span> : null}
                <Button
                  className="ml-auto"
                  onClick={() => onSelectInstrument(listing)}
                  size="sm"
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                >
                  {isSelected ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Selezionata
                    </>
                  ) : (
                    "Seleziona"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {showEnterAiCta ? (
        <p className="mt-3 text-xs text-muted-foreground">Premi Invio per ricerca AI</p>
      ) : null}

      {aiError ? <p className="mt-2 text-xs text-red-500">{aiError}</p> : null}
    </div>
  );
}

export function AssetsStep({
  config,
  onChange
}: {
  config: BacktestConfig;
  onChange: (next: BacktestConfig) => void;
}) {
  function updateAsset(index: number, query: string) {
    onChange({
      ...config,
      assets: config.assets.map((asset, assetIndex) =>
        assetIndex === index
          ? {
              ...asset,
              query,
              resolvedInstrumentId: undefined
            }
          : asset
      )
    });
  }

  function selectAssetInstrument(index: number, instrument: SmartSuggestion) {
    onChange({
      ...config,
      assets: config.assets.map((asset, assetIndex) =>
        assetIndex === index
          ? {
              ...asset,
              query: instrument.symbol,
              resolvedInstrumentId: instrument.instrumentId
            }
          : asset
      )
    });
  }

  function removeAsset(index: number) {
    onChange({
      ...config,
      assets: config.assets.filter((_, assetIndex) => assetIndex !== index)
    });
  }

  function addAsset() {
    if (config.assets.length >= 30) {
      return;
    }

    onChange({
      ...config,
      assets: [
        ...config.assets,
        {
          query: "",
          weight: 0
        }
      ]
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assets</CardTitle>
        <CardDescription>
          Cerca strumenti per ticker/nome/ISIN e seleziona esplicitamente la quotazione da usare nel run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.assets.map((asset, index) => (
          <AssetQueryRow
            key={`asset-${index}`}
            asset={asset}
            canRemove={config.assets.length > 1}
            onChange={(query) => updateAsset(index, query)}
            onRemove={() => removeAsset(index)}
            onSelectInstrument={(instrument) => selectAssetInstrument(index, instrument)}
          />
        ))}
        <Button onClick={addAsset} type="button" variant="secondary">
          Aggiungi asset
        </Button>
      </CardContent>
    </Card>
  );
}
