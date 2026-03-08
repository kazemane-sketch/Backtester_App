import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock } from "lucide-react";

import { DrawdownChart } from "@/components/results/drawdown-chart";
import { EquityChart } from "@/components/results/equity-chart";
import { KpiCards } from "@/components/results/kpi-cards";
import { TradesTable } from "@/components/results/trades-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  running: "bg-blue-500/10 text-blue-600 border-blue-200",
  failed: "bg-red-500/10 text-red-600 border-red-200",
  pending: "bg-amber-500/10 text-amber-600 border-amber-200"
};

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

  const run = runResponse.data;
  const statusClass = STATUS_STYLE[run.status] ?? STATUS_STYLE.pending;

  const equityData = (timeseriesResponse.data ?? []).map((point) => ({
    date: point.t,
    portfolio: point.portfolio_value,
    benchmark: point.benchmark_value
  }));

  const drawdownData = (timeseriesResponse.data ?? []).map((point) => ({
    date: point.t,
    drawdownPct: point.drawdown * 100
  }));

  const createdDate = new Date(run.created_at).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });

  const duration =
    run.completed_at && run.created_at
      ? Math.round(
          (new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()) / 1000
        )
      : null;

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <h1 className="font-[var(--font-heading)] text-2xl font-bold">
              {run.name ?? "Backtest"}
            </h1>
            <Badge variant="outline" className={statusClass}>
              {run.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {createdDate}
            </span>
            {duration !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {duration}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {run.error_message && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{run.error_message}</p>
        </div>
      )}

      {/* KPI Cards */}
      <KpiCards summary={summaryResponse.data} />

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-1">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Equity Curve</CardTitle>
          </CardHeader>
          <CardContent>
            <EquityChart data={equityData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Drawdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DrawdownChart data={drawdownData} />
          </CardContent>
        </Card>
      </div>

      {/* Trade Log */}
      <TradesTable trades={tradesResponse.data ?? []} />

      {/* Config JSON */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Config</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-60 overflow-auto rounded-lg border bg-slate-900 p-4 text-[11px] text-slate-200 leading-relaxed">
            {JSON.stringify(run.config, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </section>
  );
}
