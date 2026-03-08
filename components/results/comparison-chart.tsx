"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatCurrency } from "@/lib/utils";

const COLORS = [
  "#0369a1", // sky-700
  "#0f766e", // teal-700
  "#b45309", // amber-700
  "#7c3aed", // violet-600
  "#be185d"  // pink-700
];

type RunData = {
  id: string;
  name: string;
  timeseries: Array<{
    t: string;
    portfolio_value: number;
  }>;
};

type MergedPoint = Record<string, string | number>;

export function ComparisonChart({ runs }: { runs: RunData[] }) {
  if (runs.length === 0) return null;

  // Merge all timeseries into a single array keyed by date
  const dateMap = new Map<string, MergedPoint>();

  runs.forEach((run, runIdx) => {
    run.timeseries.forEach((point) => {
      if (!dateMap.has(point.t)) {
        dateMap.set(point.t, { date: point.t });
      }
      const entry = dateMap.get(point.t)!;
      entry[`run_${runIdx}`] = point.portfolio_value;
    });
  });

  const data = Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  return (
    <div className="space-y-3">
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
            <XAxis dataKey="date" minTickGap={30} tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(value: number) =>
                formatCurrency(value).replace(".00", "")
              }
              tick={{ fontSize: 11 }}
              width={90}
            />
            <Tooltip
              formatter={(value: number | string | undefined) =>
                formatCurrency(typeof value === "number" ? value : Number(value ?? 0))
              }
              contentStyle={{ borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 12 }}
            />
            {runs.map((run, idx) => (
              <Line
                key={run.id}
                dataKey={`run_${idx}`}
                type="monotone"
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={false}
                name={run.name}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2">
        {runs.map((run, idx) => (
          <div key={run.id} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            <span className="text-xs text-muted-foreground">{run.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
