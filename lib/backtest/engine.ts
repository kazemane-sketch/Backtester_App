import { alignBenchmarkSeries, alignSeriesWithInterpolation } from "@/lib/backtest/calendar";
import { computeSummaryMetrics } from "@/lib/backtest/metrics";
import { shouldRebalance } from "@/lib/backtest/rebalancing";
import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import type { ProviderPriceSeries } from "@/lib/market-data/types";
import type { BacktestRunResult, TimeSeriesPoint, TradeLogEntry } from "@/types/backtest";

type ResolvedAsset = {
  instrumentId: string;
  symbol: string;
  weight: number;
};

const MAX_INTERPOLATION_GAP = 3;

export function runBacktestEngine(args: {
  config: BacktestConfig;
  assets: ResolvedAsset[];
  assetSeries: ProviderPriceSeries[];
  benchmarkSeries?: ProviderPriceSeries | null;
}): BacktestRunResult {
  const { dates, series } = alignSeriesWithInterpolation({
    series: args.assetSeries,
    maxInterpolationGap: MAX_INTERPOLATION_GAP
  });

  if (!dates.length) {
    throw new Error("No common dates available after alignment");
  }

  const benchmarkMap = alignBenchmarkSeries({
    benchmark: args.benchmarkSeries ?? null,
    dates,
    maxInterpolationGap: MAX_INTERPOLATION_GAP
  });

  const weights = args.assets.map((asset) => asset.weight / 100);
  const feePct = args.config.fees.tradeFeePct / 100;

  let cash = args.config.initialCapital;
  let totalFees = 0;
  const holdings = new Map<string, number>();
  const trades: TradeLogEntry[] = [];

  function addTrade(entry: {
    date: string;
    instrumentId: string;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    grossAmount: number;
    feeAmount: number;
  }) {
    trades.push({
      date: entry.date,
      instrumentId: entry.instrumentId,
      symbol: entry.symbol,
      side: entry.side,
      quantity: entry.quantity,
      price: entry.price,
      grossAmount: entry.grossAmount,
      feeAmount: entry.feeAmount
    });
  }

  function computePortfolioValue(dayIndex: number): number {
    const holdingsValue = args.assets.reduce((sum, asset, assetIndex) => {
      const qty = holdings.get(asset.instrumentId) ?? 0;
      const price = series[assetIndex].points[dayIndex].adjustedClose;
      return sum + qty * price;
    }, 0);

    return cash + holdingsValue;
  }

  function rebalance(dayIndex: number, date: string) {
    const totalValue = computePortfolioValue(dayIndex);

    args.assets.forEach((asset, assetIndex) => {
      const price = series[assetIndex].points[dayIndex].adjustedClose;
      const quantity = holdings.get(asset.instrumentId) ?? 0;
      const currentValue = quantity * price;
      const targetValue = totalValue * weights[assetIndex];
      const diff = targetValue - currentValue;

      if (Math.abs(diff) < 1e-9) {
        return;
      }

      if (diff < 0) {
        const grossAmount = Math.min(Math.abs(diff), currentValue);
        const quantityToSell = grossAmount / price;
        const feeAmount = grossAmount * feePct;

        holdings.set(asset.instrumentId, quantity - quantityToSell);
        cash += grossAmount - feeAmount;
        totalFees += feeAmount;

        addTrade({
          date,
          instrumentId: asset.instrumentId,
          symbol: asset.symbol,
          side: "sell",
          quantity: quantityToSell,
          price,
          grossAmount,
          feeAmount
        });

        return;
      }

      let grossAmount = diff;
      let feeAmount = grossAmount * feePct;

      if (grossAmount + feeAmount > cash) {
        grossAmount = cash / (1 + feePct);
        feeAmount = grossAmount * feePct;
      }

      if (grossAmount <= 0) {
        return;
      }

      const quantityToBuy = grossAmount / price;
      holdings.set(asset.instrumentId, quantity + quantityToBuy);
      cash -= grossAmount + feeAmount;
      totalFees += feeAmount;

      addTrade({
        date,
        instrumentId: asset.instrumentId,
        symbol: asset.symbol,
        side: "buy",
        quantity: quantityToBuy,
        price,
        grossAmount,
        feeAmount
      });
    });
  }

  rebalance(0, dates[0]);

  const firstBenchmarkPrice = benchmarkMap?.get(dates[0]);
  const benchmarkUnits = firstBenchmarkPrice ? args.config.initialCapital / firstBenchmarkPrice : null;

  const timeseries: TimeSeriesPoint[] = [];
  let runningPeak = Number.NEGATIVE_INFINITY;
  let previousValue = 0;

  for (let dayIndex = 0; dayIndex < dates.length; dayIndex += 1) {
    const date = dates[dayIndex];
    const nextDate = dates[dayIndex + 1];

    const totalValue = computePortfolioValue(dayIndex);

    const currentWeights = args.assets.map((asset, assetIndex) => {
      const qty = holdings.get(asset.instrumentId) ?? 0;
      const price = series[assetIndex].points[dayIndex].adjustedClose;
      return (qty * price) / totalValue;
    });

    if (
      dayIndex > 0 &&
      shouldRebalance({
        mode: args.config.rebalancing,
        date,
        nextDate,
        currentWeights,
        targetWeights: weights
      })
    ) {
      rebalance(dayIndex, date);
    }

    const portfolioValue = computePortfolioValue(dayIndex);
    runningPeak = Math.max(runningPeak, portfolioValue);

    const benchmarkPrice = benchmarkMap?.get(date);
    const benchmarkValue = benchmarkUnits && benchmarkPrice ? benchmarkUnits * benchmarkPrice : undefined;

    timeseries.push({
      date,
      portfolioValue,
      benchmarkValue,
      dailyReturn: dayIndex === 0 ? 0 : portfolioValue / previousValue - 1,
      drawdown: runningPeak <= 0 ? 0 : portfolioValue / runningPeak - 1
    });

    previousValue = portfolioValue;
  }

  const summary = computeSummaryMetrics({
    timeseries,
    totalFees
  });

  return {
    config: args.config,
    summary,
    timeseries,
    trades
  };
}
