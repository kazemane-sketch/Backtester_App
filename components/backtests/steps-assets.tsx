"use client";

import { Trash2 } from "lucide-react";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { useInstrumentSearch } from "@/hooks/use-instrument-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AssetQueryRow({
  asset,
  onChange,
  onRemove,
  provider,
  canRemove
}: {
  asset: BacktestConfig["assets"][number];
  onChange: (query: string) => void;
  onRemove: () => void;
  provider: BacktestConfig["dataProvider"];
  canRemove: boolean;
}) {
  const search = useInstrumentSearch(asset.query, provider);

  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label>Ticker / Nome / ISIN</Label>
          <Input
            onChange={(event) => onChange(event.target.value)}
            placeholder="es. VWCE, iShares Core MSCI World..."
            value={asset.query}
          />
        </div>
        <Button disabled={!canRemove} onClick={onRemove} size="icon" type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {search.data?.primary ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">Primary listing</Badge>
          <span>
            {search.data.primary.symbol} · {search.data.primary.name}
          </span>
          <span>
            {search.data.primary.exchange} · {search.data.primary.currency}
          </span>
          {search.data.alternatives.length ? (
            <Badge variant="outline">+{search.data.alternatives.length} altre quotazioni</Badge>
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
          Cerca strumenti per ticker/nome/ISIN. Il provider seleziona una primary listing secondo policy locale.
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
