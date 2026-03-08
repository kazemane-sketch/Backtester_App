"use client";

import {
  Activity,
  Calendar,
  Clock,
  Crosshair,
  Flame,
  Target,
  TrendingDown,
  TrendingUp
} from "lucide-react";

import type { EngineCExtendedMetrics, TradeRecord } from "@/types/backtest";
import { Card, CardContent } from "@/components/ui/card";

type MetricItem = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

function buildMetrics(m: EngineCExtendedMetrics): MetricItem[] {
  return [
    {
      label: "Win Rate",
      value: `${(m.winRate * 100).toFixed(1)}%`,
      icon: Target,
      color: m.winRate >= 0.5 ? "text-emerald-600" : "text-red-600"
    },
    {
      label: "Profit Factor",
      value: m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2),
      icon: Flame,
      color: m.profitFactor >= 1.5 ? "text-emerald-600" : m.profitFactor >= 1 ? "text-amber-600" : "text-red-600"
    },
    {
      label: "Avg Win",
      value: `+${(m.avgWinPct * 100).toFixed(2)}%`,
      icon: TrendingUp,
      color: "text-emerald-600"
    },
    {
      label: "Avg Loss",
      value: `${(m.avgLossPct * 100).toFixed(2)}%`,
      icon: TrendingDown,
      color: "text-red-600"
    },
    {
      label: "Total Trades",
      value: String(m.totalTrades),
      icon: Activity,
      color: "text-muted-foreground"
    },
    {
      label: "Time in Market",
      value: `${(m.timeInMarketPct * 100).toFixed(1)}%`,
      icon: Clock,
      color: "text-muted-foreground"
    },
    {
      label: "Avg Hold (days)",
      value: m.avgHoldingDays.toFixed(1),
      icon: Calendar,
      color: "text-muted-foreground"
    },
    {
      label: "Max Consec. Losses",
      value: String(m.maxConsecutiveLosses),
      icon: Crosshair,
      color: m.maxConsecutiveLosses <= 3 ? "text-emerald-600" : m.maxConsecutiveLosses <= 5 ? "text-amber-600" : "text-red-600"
    }
  ];
}

export function EngineCMetrics({ metrics }: { metrics: EngineCExtendedMetrics }) {
  const items = buildMetrics(metrics);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {items.map((item) => (
        <Card key={item.label} className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
            <p className={`text-base font-bold tabular-nums ${item.color}`}>
              {item.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Trade records table — round-trip trades with entry/exit/return */
export function TradeRecordsTable({ records }: { records: TradeRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        Nessun trade completato.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2 font-medium text-muted-foreground">Entry</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Entry Price</th>
            <th className="pb-2 font-medium text-muted-foreground">Exit</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Exit Price</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Return</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Days</th>
            <th className="pb-2 font-medium text-muted-foreground">Reason</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => {
            const returnPct = rec.returnPct * 100;
            const isWin = returnPct > 0;

            return (
              <tr key={`${rec.entryDate}-${idx}`} className="border-b border-border/50">
                <td className="py-1.5">{rec.entryDate}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {rec.entryPrice.toFixed(2)}
                </td>
                <td className="py-1.5">{rec.exitDate}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {rec.exitPrice.toFixed(2)}
                </td>
                <td
                  className={`py-1.5 text-right tabular-nums font-medium ${
                    isWin ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isWin ? "+" : ""}
                  {returnPct.toFixed(2)}%
                </td>
                <td className="py-1.5 text-right tabular-nums">{rec.holdingDays}</td>
                <td className="py-1.5">
                  <span
                    className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      rec.exitReason === "stop_loss"
                        ? "bg-red-500/10 text-red-600"
                        : rec.exitReason === "take_profit"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-blue-500/10 text-blue-600"
                    }`}
                  >
                    {rec.exitReason.replace("_", " ")}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
