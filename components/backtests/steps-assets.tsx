"use client";

import { useState } from "react";
import { Check, ChevronDown, Trash2 } from "lucide-react";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import type { ProviderInstrument } from "@/lib/market-data/types";
import { useInstrumentSearch } from "@/hooks/use-instrument-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AssetQueryRow({
  asset,
  onChange,
  onSelectInstrument,
  onRemove,
  provider,
  canRemove
}: {
  asset: BacktestConfig["assets"][number];
  onChange: (query: string) => void;
  onSelectInstrument: (instrument: ProviderInstrument) => void;
  onRemove: () => void;
  provider: BacktestConfig["dataProvider"];
  canRemove: boolean;
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const queryValue = asset.query ?? "";
  const search = useInstrumentSearch(queryValue, provider);
  const primary = search.data?.primary ?? null;
  const alternatives = search.data?.alternatives ?? [];
  const visibleListings = primary ? [primary, ...(showAlternatives ? alternatives : [])] : [];

  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label>Ticker / Nome / ISIN</Label>
          <Input
            onChange={(event) => onChange(event.target.value)}
            placeholder="es. VWCE, iShares Core MSCI World..."
            value={queryValue}
          />
        </div>
        <Button disabled={!canRemove} onClick={onRemove} size="icon" type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {search.isFetching ? <p className="mt-3 text-xs text-muted-foreground">Ricerca quotazioni...</p> : null}

      {visibleListings.length ? (
        <div className="mt-3 space-y-2">
          {visibleListings.map((listing, index) => {
            const isSelected =
              (asset.resolvedInstrumentId && listing.instrumentId === asset.resolvedInstrumentId) ||
              queryValue.toUpperCase() === listing.providerInstrumentId.toUpperCase();

            return (
              <div
                className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs ${
                  isSelected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                }`}
                key={listing.providerInstrumentId}
              >
                <Badge variant={index === 0 ? "secondary" : "outline"}>
                  {index === 0 ? "Primary listing" : "Alternative"}
                </Badge>
                <span>
                  {listing.providerInstrumentId} · {listing.name}
                </span>
                <span className="text-muted-foreground">
                  {listing.exchange} · {listing.currency}
                </span>
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

          {alternatives.length ? (
            <Button
              onClick={() => setShowAlternatives((previous) => !previous)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ChevronDown className={`h-4 w-4 transition ${showAlternatives ? "rotate-180" : ""}`} />
              {showAlternatives
                ? "Nascondi altre quotazioni"
                : `Mostra altre quotazioni (+${alternatives.length})`}
            </Button>
          ) : null}
        </div>
      ) : null}
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

  function selectAssetInstrument(index: number, instrument: ProviderInstrument) {
    onChange({
      ...config,
      assets: config.assets.map((asset, assetIndex) =>
        assetIndex === index
          ? {
              ...asset,
              query: instrument.providerInstrumentId,
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
            provider={config.dataProvider}
          />
        ))}
        <Button onClick={addAsset} type="button" variant="secondary">
          Aggiungi asset
        </Button>
      </CardContent>
    </Card>
  );
}
