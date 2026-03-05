"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/lib/utils";

type EquityPoint = {
  date: string;
  portfolio: number;
  benchmark?: number | null;
};

export function EquityChart({ data }: { data: EquityPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis dataKey="date" minTickGap={30} tick={{ fontSize: 12 }} />
          <YAxis
            tickFormatter={(value: number) => formatCurrency(value).replace(".00", "")}
            tick={{ fontSize: 12 }}
            width={90}
          />
          <Tooltip
            formatter={(value: number | string | undefined) =>
              formatCurrency(typeof value === "number" ? value : Number(value ?? 0))
            }
            contentStyle={{ borderRadius: 10, border: "1px solid #cbd5e1" }}
          />
          <Line
            dataKey="portfolio"
            type="monotone"
            stroke="#0369a1"
            strokeWidth={2.2}
            dot={false}
            name="Portfolio"
          />
          <Line
            dataKey="benchmark"
            type="monotone"
            stroke="#0f766e"
            strokeWidth={1.8}
            dot={false}
            name="Benchmark"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
