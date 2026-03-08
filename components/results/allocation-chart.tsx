"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { AllocationSnapshot } from "@/types/backtest";

// Tailwind-inspired palette for up to 15 assets
const COLORS = [
  "#0369a1", // sky-700
  "#0f766e", // teal-700
  "#b45309", // amber-700
  "#7c3aed", // violet-600
  "#be185d", // pink-700
  "#15803d", // green-700
  "#dc2626", // red-600
  "#4338ca", // indigo-700
  "#c2410c", // orange-700
  "#0891b2", // cyan-600
  "#a21caf", // fuchsia-700
  "#65a30d", // lime-600
  "#e11d48", // rose-600
  "#1d4ed8", // blue-700
  "#854d0e"  // yellow-800
];

type DataPoint = Record<string, number | string>;

export function AllocationChart({
  allocationHistory
}: {
  allocationHistory: AllocationSnapshot[];
}) {
  const { data, symbols } = useMemo(() => {
    // Collect all unique symbols across all snapshots
    const symbolSet = new Set<string>();
    allocationHistory.forEach((snap) => {
      snap.positions.forEach((p) => symbolSet.add(p.symbol));
    });

    const allSymbols = Array.from(symbolSet).sort();

    // Build data points — each point is one rebalance date
    const chartData: DataPoint[] = allocationHistory.map((snap) => {
      const point: DataPoint = { date: snap.date };
      const posMap = new Map(snap.positions.map((p) => [p.symbol, p.weight]));

      allSymbols.forEach((sym) => {
        point[sym] = posMap.get(sym) ?? 0;
      });

      return point;
    });

    return { data: chartData, symbols: allSymbols };
  }, [allocationHistory]);

  if (allocationHistory.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Nessun dato di allocazione disponibile.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          stackOffset="expand"
          margin={{ top: 16, right: 24, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" minTickGap={40} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
            tick={{ fontSize: 11 }}
            width={50}
          />
          <Tooltip
            formatter={(value: number | string | undefined) => {
              const num = typeof value === "number" ? value : Number(value ?? 0);
              return `${(num * 100).toFixed(1)}%`;
            }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              fontSize: 12
            }}
          />
          {symbols.map((sym, idx) => (
            <Area
              key={sym}
              type="monotone"
              dataKey={sym}
              stackId="1"
              stroke={COLORS[idx % COLORS.length]}
              fill={COLORS[idx % COLORS.length]}
              fillOpacity={0.7}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-2">
        {symbols.map((sym, idx) => (
          <div key={sym} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            <span className="text-[11px] text-muted-foreground">{sym}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
