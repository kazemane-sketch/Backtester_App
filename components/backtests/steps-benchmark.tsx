"use client";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { useInstrumentSearch } from "@/hooks/use-instrument-search";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BenchmarkStep({
  config,
  onChange
}: {
  config: BacktestConfig;
  onChange: (next: BacktestConfig) => void;
}) {
  const benchmarkQuery = config.benchmark?.query ?? "";
  const search = useInstrumentSearch(benchmarkQuery, config.dataProvider);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benchmark</CardTitle>
        <CardDescription>Seleziona 1 benchmark per confrontare curva equity e metriche.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Benchmark query</Label>
          <Input
            onChange={(event) =>
              onChange({
                ...config,
                benchmark: event.target.value
                  ? {
                      query: event.target.value
                    }
                  : undefined
              })
            }
            placeholder="es. ACWI o SPY"
            value={benchmarkQuery}
          />
        </div>

        {search.data?.primary ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">Primary</Badge>
            <span>
              {search.data.primary.symbol} · {search.data.primary.name}
            </span>
            <span>
              {search.data.primary.exchange} · {search.data.primary.currency}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
