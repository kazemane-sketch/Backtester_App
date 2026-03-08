import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/get-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComparisonChart } from "@/components/results/comparison-chart";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type MetricRow = {
  label: string;
  values: string[];
  highlight?: "max" | "min";
};

function formatPct(val: number) {
  return `${(val * 100).toFixed(2)}%`;
}

export default async function ComparePage({
  searchParams
}: {
  searchParams: { ids?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ids = (searchParams.ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length < 2) {
    return (
      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Link
            href="/results"
            className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <h1 className="font-[var(--font-heading)] text-2xl font-bold">Confronto</h1>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Seleziona almeno 2 backtest da confrontare.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Aggiungi gli ID alla URL: <code className="bg-muted px-1 rounded">?ids=id1,id2</code>
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const supabase = createServerSupabaseClient();

  // Fetch all runs in parallel
  const [runsResponse, summariesResponse, timeseriesResponses] = await Promise.all([
    supabase
      .from("backtest_runs")
      .select("id,name,status,created_at")
      .eq("user_id", user.id)
      .in("id", ids),
    supabase
      .from("backtest_results_summary")
      .select("run_id,total_return,cagr,volatility_ann,sharpe,max_drawdown,calmar,total_fees")
      .eq("user_id", user.id)
      .in("run_id", ids),
    Promise.all(
      ids.map((id) =>
        supabase
          .from("backtest_timeseries")
          .select("t,portfolio_value")
          .eq("run_id", id)
          .eq("user_id", user.id)
          .order("t", { ascending: true })
          .then((res) => ({ id, data: res.data ?? [] }))
      )
    )
  ]);

  const runs = runsResponse.data ?? [];
  const summaries = summariesResponse.data ?? [];

  // Build chart data
  const chartRuns = ids
    .map((id) => {
      const run = runs.find((r) => r.id === id);
      const ts = timeseriesResponses.find((t) => t.id === id);
      if (!run || !ts) return null;
      return {
        id: run.id,
        name: run.name ?? "Unnamed",
        timeseries: ts.data
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    timeseries: Array<{ t: string; portfolio_value: number }>;
  }>;

  // Build metrics comparison table
  const summaryMap = new Map(summaries.map((s) => [s.run_id, s]));
  const orderedSummaries = ids.map((id) => summaryMap.get(id) ?? null);

  const metricRows: MetricRow[] = [
    {
      label: "Total Return",
      values: orderedSummaries.map((s) => (s ? formatPct(s.total_return) : "—")),
      highlight: "max"
    },
    {
      label: "CAGR",
      values: orderedSummaries.map((s) => (s ? formatPct(s.cagr) : "—")),
      highlight: "max"
    },
    {
      label: "Volatility",
      values: orderedSummaries.map((s) => (s ? formatPct(s.volatility_ann) : "—")),
      highlight: "min"
    },
    {
      label: "Sharpe",
      values: orderedSummaries.map((s) => (s ? s.sharpe.toFixed(3) : "—")),
      highlight: "max"
    },
    {
      label: "Max Drawdown",
      values: orderedSummaries.map((s) => (s ? formatPct(s.max_drawdown) : "—")),
      highlight: "max" // Less negative is better
    },
    {
      label: "Calmar",
      values: orderedSummaries.map((s) => (s ? s.calmar.toFixed(3) : "—")),
      highlight: "max"
    }
  ];

  // Highlight best values in each row
  function getBestIndex(row: MetricRow): number {
    const numericValues = row.values.map((v) =>
      v === "—" ? (row.highlight === "max" ? -Infinity : Infinity) : parseFloat(v)
    );
    if (row.highlight === "max") {
      return numericValues.indexOf(Math.max(...numericValues));
    }
    return numericValues.indexOf(Math.min(...numericValues));
  }

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link
          href="/results"
          className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
        <h1 className="font-[var(--font-heading)] text-2xl font-bold">
          Confronto ({chartRuns.length} backtest)
        </h1>
      </div>

      {/* Equity curves overlay */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Equity Curves</CardTitle>
        </CardHeader>
        <CardContent>
          <ComparisonChart runs={chartRuns} />
        </CardContent>
      </Card>

      {/* Metrics comparison table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Metriche a confronto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left font-medium text-muted-foreground">Metrica</th>
                  {ids.map((id, idx) => {
                    const run = runs.find((r) => r.id === id);
                    return (
                      <th key={id} className="py-2 text-right font-medium">
                        <Link
                          href={`/backtests/${id}`}
                          className="text-primary hover:underline"
                        >
                          {run?.name ?? `Run ${idx + 1}`}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {metricRows.map((row) => {
                  const bestIdx = getBestIndex(row);
                  return (
                    <tr key={row.label} className="border-b border-border/50">
                      <td className="py-2 font-medium text-muted-foreground">
                        {row.label}
                      </td>
                      {row.values.map((val, idx) => (
                        <td
                          key={idx}
                          className={`py-2 text-right tabular-nums ${
                            idx === bestIdx && val !== "—"
                              ? "font-bold text-emerald-600"
                              : ""
                          }`}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
