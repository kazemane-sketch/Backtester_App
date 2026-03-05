"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DrawdownPoint = {
  date: string;
  drawdownPct: number;
};

export function DrawdownChart({ data }: { data: DrawdownPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#b91c1c" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#fca5a5" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" minTickGap={30} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(value: number) => `${value.toFixed(1)}%`} tick={{ fontSize: 12 }} width={70} />
          <Tooltip
            formatter={(value: number | string | undefined) =>
              `${(typeof value === "number" ? value : Number(value ?? 0)).toFixed(2)}%`
            }
          />
          <Area type="monotone" dataKey="drawdownPct" stroke="#b91c1c" fill="url(#drawdownGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
