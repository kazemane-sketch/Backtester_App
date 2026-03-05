"use client";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WeightsStep({
  config,
  onChange
}: {
  config: BacktestConfig;
  onChange: (next: BacktestConfig) => void;
}) {
  const totalWeight = config.assets.reduce((sum, asset) => sum + asset.weight, 0);

  function updateWeight(index: number, weight: number) {
    onChange({
      ...config,
      assets: config.assets.map((asset, assetIndex) => (assetIndex === index ? { ...asset, weight } : asset))
    });
  }

  function equalWeight() {
    const equal = Number((100 / config.assets.length).toFixed(4));
    const normalized = config.assets.map((asset, index) => ({
      ...asset,
      weight: index === config.assets.length - 1 ? Number((100 - equal * (config.assets.length - 1)).toFixed(4)) : equal
    }));

    onChange({
      ...config,
      assets: normalized
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pesi</CardTitle>
        <CardDescription>Imposta la composizione target. Validazione rigida: somma totale = 100%.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.assets.map((asset, index) => (
          <div key={`weight-${index}`} className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <Label>Asset {index + 1}</Label>
              <Input readOnly value={asset.query || asset.instrumentId || `Asset ${index + 1}`} />
            </div>
            <div className="space-y-2">
              <Label>Peso (%)</Label>
              <Input
                max={100}
                min={0}
                onChange={(event) => updateWeight(index, Number(event.target.value))}
                step={0.01}
                type="number"
                value={asset.weight}
              />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={Math.abs(totalWeight - 100) < 0.001 ? "secondary" : "outline"}>
            Totale: {totalWeight.toFixed(4)}%
          </Badge>
          <Button onClick={equalWeight} type="button" variant="outline">
            Equal weight
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
