"use client";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export function RulesStep({
  config,
  onChange
}: {
  config: BacktestConfig;
  onChange: (next: BacktestConfig) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regole</CardTitle>
        <CardDescription>Date range, capitale iniziale, fees, data provider e strategia di rebalance.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome Backtest</Label>
            <Input
              onChange={(event) => onChange({ ...config, name: event.target.value })}
              value={config.name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Initial Capital</Label>
            <Input
              min={100}
              onChange={(event) => onChange({ ...config, initialCapital: Number(event.target.value) })}
              step={100}
              type="number"
              value={config.initialCapital}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              onChange={(event) => onChange({ ...config, startDate: event.target.value })}
              type="date"
              value={config.startDate}
            />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              onChange={(event) => onChange({ ...config, endDate: event.target.value })}
              type="date"
              value={config.endDate}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Trade Fee (%)</Label>
            <Input
              max={5}
              min={0}
              onChange={(event) => onChange({ ...config, fees: { tradeFeePct: Number(event.target.value) } })}
              step={0.01}
              type="number"
              value={config.fees.tradeFeePct}
            />
          </div>

          <div className="space-y-2">
            <Label>Data Provider</Label>
            <Select
              onValueChange={(value: "EODHD" | "YAHOO") => onChange({ ...config, dataProvider: value })}
              value={config.dataProvider}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EODHD">EODHD (default)</SelectItem>
                <SelectItem value="YAHOO">Yahoo (optional)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Price Field</Label>
          <Select
            onValueChange={(value: "adjClose" | "close") => onChange({ ...config, priceField: value })}
            value={config.priceField}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="adjClose">Adjusted Close (default)</SelectItem>
              <SelectItem value="close">Close</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Rebalancing Mode</Label>
          <Select
            onValueChange={(value: "none" | "periodic" | "threshold") => {
              if (value === "none") {
                onChange({
                  ...config,
                  rebalancing: {
                    mode: "none"
                  }
                });
                return;
              }

              if (value === "periodic") {
                onChange({
                  ...config,
                  rebalancing: {
                    mode: "periodic",
                    periodicFrequency: "monthly"
                  }
                });
                return;
              }

              onChange({
                ...config,
                rebalancing: {
                  mode: "threshold",
                  thresholdPct: 10
                }
              });
            }}
            value={config.rebalancing.mode}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Buy & Hold</SelectItem>
              <SelectItem value="periodic">Periodic</SelectItem>
              <SelectItem value="threshold">Threshold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.rebalancing.mode === "periodic" ? (
          <div className="space-y-2">
            <Label>Periodic Frequency</Label>
            <Select
              onValueChange={(value: "weekly" | "monthly" | "quarterly" | "yearly") =>
                onChange({
                  ...config,
                  rebalancing: {
                    mode: "periodic",
                    periodicFrequency: value
                  }
                })
              }
              value={config.rebalancing.periodicFrequency}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {config.rebalancing.mode === "threshold" ? (
          <div className="space-y-2">
            <Label>Threshold (%)</Label>
            <Select
              onValueChange={(value: "5" | "10" | "15" | "20") =>
                onChange({
                  ...config,
                  rebalancing: {
                    mode: "threshold",
                    thresholdPct: Number(value) as 5 | 10 | 15 | 20
                  }
                })
              }
              value={String(config.rebalancing.thresholdPct)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5%</SelectItem>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="15">15%</SelectItem>
                <SelectItem value="20">20%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
