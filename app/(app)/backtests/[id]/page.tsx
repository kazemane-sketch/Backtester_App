import { notFound } from "next/navigation";

import { DrawdownChart } from "@/components/results/drawdown-chart";
import { EquityChart } from "@/components/results/equity-chart";
import { MetricsTable } from "@/components/results/metrics-table";
import { TradesTable } from "@/components/results/trades-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function BacktestResultPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const [runResponse, summaryResponse, timeseriesResponse, tradesResponse] = await Promise.all([
    supabase
      .from("backtest_runs")
      .select("id,name,status,config,created_at,completed_at,error_message")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("backtest_results_summary")
      .select("total_return,cagr,volatility_ann,sharpe,max_drawdown,calmar,total_fees")
      .eq("run_id", params.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("backtest_timeseries")
      .select("t,portfolio_value,benchmark_value,daily_return,drawdown")
      .eq("run_id", params.id)
      .eq("user_id", user.id)
      .order("t", { ascending: true }),
    supabase
      .from("backtest_trades")
      .select("trade_date,symbol,side,quantity,price,gross_amount,fee_amount")
      .eq("run_id", params.id)
      .eq("user_id", user.id)
      .order("trade_date", { ascending: true })
  ]);

  if (runResponse.error || !runResponse.data) {
    notFound();
  }

  const equityData = (timeseriesResponse.data ?? []).map((point) => ({
    date: point.t,
    portfolio: point.portfolio_value,
    benchmark: point.benchmark_value
  }));

  const drawdownData = (timeseriesResponse.data ?? []).map((point) => ({
    date: point.t,
    drawdownPct: point.drawdown * 100
  }));

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[var(--font-heading)] text-3xl">{runResponse.data.name}</h1>
        <p className="text-sm text-muted-foreground">
          Status: {runResponse.data.status} · Creato il {new Date(runResponse.data.created_at).toLocaleString("it-IT")}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Equity Curve vs Benchmark</CardTitle>
            <CardDescription>Serie storica giornaliera del portafoglio.</CardDescription>
          </CardHeader>
          <CardContent>
            <EquityChart data={equityData} />
          </CardContent>
        </Card>

        <MetricsTable summary={summaryResponse.data} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Drawdown</CardTitle>
        </CardHeader>
        <CardContent>
          <DrawdownChart data={drawdownData} />
        </CardContent>
      </Card>

      <TradesTable trades={tradesResponse.data ?? []} />

      <Card>
        <CardHeader>
          <CardTitle>Config</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md border bg-slate-900 p-4 text-xs text-slate-100">
            {JSON.stringify(runResponse.data.config, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </section>
  );
}
