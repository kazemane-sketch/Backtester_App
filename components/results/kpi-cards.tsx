"use client";

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  DollarSign,
  Percent,
  TrendingDown,
  TrendingUp,
  Zap
} from "lucide-react";

import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type Summary = {
  total_return: number;
  cagr: number;
  volatility_ann: number;
  sharpe: number;
  max_drawdown: number;
  calmar: number;
  total_fees: number;
};

type KpiItem = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  positive?: boolean;
};

function buildKpis(summary: Summary): KpiItem[] {
  const cagr = summary.cagr * 100;
  const vol = summary.volatility_ann * 100;
  const dd = summary.max_drawdown * 100;
  const totalReturn = summary.total_return * 100;

  return [
    {
      label: "CAGR",
      value: `${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)}%`,
      icon: cagr >= 0 ? TrendingUp : TrendingDown,
      color: cagr >= 0 ? "text-emerald-600" : "text-red-600",
      positive: cagr >= 0
    },
    {
      label: "Sharpe",
      value: summary.sharpe.toFixed(3),
      icon: Zap,
      color: summary.sharpe >= 1 ? "text-emerald-600" : summary.sharpe >= 0.5 ? "text-amber-600" : "text-red-600",
      positive: summary.sharpe >= 0.5
    },
    {
      label: "Max Drawdown",
      value: `${dd.toFixed(2)}%`,
      icon: ArrowDown,
      color: dd > -20 ? "text-emerald-600" : dd > -35 ? "text-amber-600" : "text-red-600",
      positive: dd > -20
    },
    {
      label: "Volatility",
      value: `${vol.toFixed(2)}%`,
      icon: BarChart3,
      color: vol < 15 ? "text-emerald-600" : vol < 25 ? "text-amber-600" : "text-red-600"
    },
    {
      label: "Total Return",
      value: `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%`,
      icon: totalReturn >= 0 ? ArrowUp : ArrowDown,
      color: totalReturn >= 0 ? "text-emerald-600" : "text-red-600",
      positive: totalReturn >= 0
    },
    {
      label: "Calmar",
      value: summary.calmar.toFixed(3),
      icon: Percent,
      color: summary.calmar >= 1 ? "text-emerald-600" : summary.calmar >= 0.3 ? "text-amber-600" : "text-red-600"
    },
    {
      label: "Total Fees",
      value: formatCurrency(summary.total_fees),
      icon: DollarSign,
      color: "text-muted-foreground"
    }
  ];
}

export function KpiCards({ summary }: { summary: Summary | null }) {
  if (!summary) {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">Metriche non disponibili.</p>
      </div>
    );
  }

  const kpis = buildKpis(summary);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
              <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={`text-lg font-bold tabular-nums ${kpi.color}`}>
              {kpi.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
