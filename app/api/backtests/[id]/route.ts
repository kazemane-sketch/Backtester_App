import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = context.params.id;

  const [runResponse, summaryResponse, timeseriesResponse, tradesResponse] = await Promise.all([
    supabase
      .from("backtest_runs")
      .select("id,name,status,config,data_provider,created_at,completed_at,error_message")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("backtest_results_summary")
      .select("total_return,cagr,volatility_ann,sharpe,max_drawdown,calmar,total_fees")
      .eq("run_id", runId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("backtest_timeseries")
      .select("t,portfolio_value,benchmark_value,daily_return,drawdown")
      .eq("run_id", runId)
      .eq("user_id", user.id)
      .order("t", { ascending: true }),
    supabase
      .from("backtest_trades")
      .select("trade_date,symbol,side,quantity,price,gross_amount,fee_amount")
      .eq("run_id", runId)
      .eq("user_id", user.id)
      .order("trade_date", { ascending: true })
  ]);

  if (runResponse.error || !runResponse.data) {
    return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
  }

  return NextResponse.json({
    run: runResponse.data,
    summary: summaryResponse.data,
    timeseries: timeseriesResponse.data ?? [],
    trades: tradesResponse.data ?? []
  });
}
