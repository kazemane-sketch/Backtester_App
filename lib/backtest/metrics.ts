import { yearsBetween } from "@/lib/utils/date";
import type { BacktestSummaryMetrics, TimeSeriesPoint } from "@/types/backtest";

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function computeSummaryMetrics(args: {
  initialCapital: number;
  timeseries: TimeSeriesPoint[];
  totalFees: number;
}): BacktestSummaryMetrics {
  const first = args.timeseries[0];
  const last = args.timeseries[args.timeseries.length - 1];

  if (!first || !last) {
    throw new Error("Timeseries must contain at least one point");
  }

  const totalReturn = last.portfolioValue / args.initialCapital - 1;
  const durationYears = Math.max(yearsBetween(first.date, last.date), 1 / 252);
  const cagr = Math.pow(last.portfolioValue / args.initialCapital, 1 / durationYears) - 1;

  const dailyReturns = args.timeseries.slice(1).map((point) => point.dailyReturn);
  const averageDailyReturn = mean(dailyReturns);
  const volatilityAnn = stdDev(dailyReturns) * Math.sqrt(252);
  const sharpe = volatilityAnn === 0 ? 0 : (averageDailyReturn * 252) / volatilityAnn;

  const maxDrawdown = Math.min(...args.timeseries.map((point) => point.drawdown));
  const calmar = maxDrawdown === 0 ? 0 : cagr / Math.abs(maxDrawdown);

  return {
    totalReturn,
    cagr,
    volatilityAnn,
    sharpe,
    maxDrawdown,
    calmar,
    totalFees: args.totalFees
  };
}
