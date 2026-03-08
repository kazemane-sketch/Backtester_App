import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import type { BacktestSummaryMetrics, TimeSeriesPoint, TradeLogEntry } from "@/types/backtest";
import { uniformDownsample } from "@/lib/backtest/downsample";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Minimal result shape accepted by saveBacktestResult — works with any engine */
type SaveableResult = {
  summary: BacktestSummaryMetrics;
  timeseries: TimeSeriesPoint[];
  trades: TradeLogEntry[];
  diagnostics?: { droppedDates: string[] };
};

export async function createBacktestRun(args: {
  userId: string;
  config: BacktestConfig | Record<string, unknown>;
}) {
  const supabase = createServiceRoleClient();

  // Extract common fields safely — works for any engine config shape
  const name =
    (args.config as Record<string, unknown>).name as string | undefined;
  const dataProvider =
    (args.config as Record<string, unknown>).dataProvider as string | undefined;

  const { data, error } = await supabase
    .from("backtest_runs")
    .insert({
      user_id: args.userId,
      name: name ?? "Backtest run",
      status: "running",
      config: args.config,
      data_provider: dataProvider ?? "EODHD",
      started_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create backtest run: ${error?.message ?? "Unknown error"}`);
  }

  return data.id;
}

export async function saveBacktestResult(args: {
  userId: string;
  runId: string;
  result: SaveableResult;
}) {
  const supabase = createServiceRoleClient();

  const summaryPayload = {
    run_id: args.runId,
    user_id: args.userId,
    total_return: args.result.summary.totalReturn,
    cagr: args.result.summary.cagr,
    volatility_ann: args.result.summary.volatilityAnn,
    sharpe: args.result.summary.sharpe,
    max_drawdown: args.result.summary.maxDrawdown,
    calmar: args.result.summary.calmar,
    total_fees: args.result.summary.totalFees
  };

  const persistedTimeseries = uniformDownsample(args.result.timeseries, 1000);

  const timeseriesPayload = persistedTimeseries.map((point) => ({
    run_id: args.runId,
    user_id: args.userId,
    t: point.date,
    portfolio_value: point.portfolioValue,
    benchmark_value: point.benchmarkValue ?? null,
    daily_return: point.dailyReturn,
    drawdown: point.drawdown
  }));

  const tradesPayload = args.result.trades.map((trade) => ({
    run_id: args.runId,
    user_id: args.userId,
    trade_date: trade.date,
    instrument_id: trade.instrumentId ?? null,
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
    price: trade.price,
    gross_amount: trade.grossAmount,
    fee_amount: trade.feeAmount
  }));

  const [{ error: summaryError }, { error: timeseriesError }, { error: tradesError }, { error: runError }] =
    await Promise.all([
      supabase.from("backtest_results_summary").upsert(summaryPayload),
      timeseriesPayload.length
        ? supabase.from("backtest_timeseries").insert(timeseriesPayload)
        : Promise.resolve({ error: null }),
      tradesPayload.length
        ? supabase.from("backtest_trades").insert(tradesPayload)
        : Promise.resolve({ error: null }),
      supabase
        .from("backtest_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("id", args.runId)
    ]);

  const message = summaryError?.message || timeseriesError?.message || tradesError?.message || runError?.message;

  if (message) {
    throw new Error(`Failed to persist backtest result: ${message}`);
  }
}

export async function markRunFailed(args: {
  runId: string;
  message: string;
}) {
  const supabase = createServiceRoleClient();
  await supabase
    .from("backtest_runs")
    .update({
      status: "failed",
      error_message: args.message,
      completed_at: new Date().toISOString()
    })
    .eq("id", args.runId);
}
