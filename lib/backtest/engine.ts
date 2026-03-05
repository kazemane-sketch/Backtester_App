import { computeSummaryMetrics } from "@/lib/backtest/metrics";
import type { ProviderPriceSeries } from "@/lib/market-data/types";
import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import type { BacktestRunResult, TimeSeriesPoint, TradeLogEntry } from "@/types/backtest";
import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";

type ResolvedAsset = {
  instrumentId: string;
  symbol: string;
  weight: number;
};

type PendingOrder = {
  decisionIndex: number;
  execIndex: number;
  reason: "initial_allocation" | "periodic" | "threshold";
  deltaDollars: number[];
};

type AlignmentResult = {
  dates: string[];
  assetPrices: number[][];
  benchmarkPrices: (number | null)[] | null;
  droppedDates: string[];
};

const BASE_MAX_GAP_DAYS = 3;

function getPrice(point: { adjustedClose: number; close: number }, field: "adjClose" | "close") {
  return field === "close" ? point.close : point.adjustedClose;
}

function dayDiff(fromDate: string, toDate: string): number {
  const from = parseISO(`${fromDate}T00:00:00.000Z`).getTime();
  const to = parseISO(`${toDate}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((to - from) / (24 * 60 * 60 * 1000)));
}

function buildFilledSeries(args: {
  dates: string[];
  rawSeries: Map<string, number>;
}): (number | null)[] {
  const output: (number | null)[] = [];
  let lastValue: number | null = null;
  let lastObservationDate: string | null = null;

  for (const date of args.dates) {
    const value = args.rawSeries.get(date);
    if (Number.isFinite(value)) {
      output.push(value as number);
      lastValue = value as number;
      lastObservationDate = date;
      continue;
    }

    const gapDays = lastObservationDate ? dayDiff(lastObservationDate, date) : Number.POSITIVE_INFINITY;

    if (lastValue !== null && gapDays <= BASE_MAX_GAP_DAYS) {
      output.push(lastValue);
    } else {
      output.push(null);
    }
  }

  return output;
}

function alignDatesAndPrices(args: {
  assetSeries: ProviderPriceSeries[];
  benchmarkSeries?: ProviderPriceSeries | null;
  priceField: "adjClose" | "close";
}): AlignmentResult {
  const allAssetDates = new Set<string>();

  const rawAssetPriceMaps = args.assetSeries.map((series) => {
    const map = new Map<string, number>();

    for (const point of series.points) {
      const value = getPrice(point, args.priceField);
      if (!Number.isFinite(value)) {
        continue;
      }

      map.set(point.date, value);
      allAssetDates.add(point.date);
    }

    return map;
  });

  const masterDates = [...allAssetDates].sort((a, b) => a.localeCompare(b));
  if (!masterDates.length) {
    return {
      dates: [],
      assetPrices: args.assetSeries.map((): number[] => []),
      benchmarkPrices: null,
      droppedDates: []
    };
  }

  const filledAssetSeries = rawAssetPriceMaps.map((seriesMap) =>
    buildFilledSeries({
      dates: masterDates,
      rawSeries: seriesMap
    })
  );

  const alignedDates: string[] = [];
  const droppedDates: string[] = [];
  const alignedAssetPrices = args.assetSeries.map((): number[] => []);

  for (let index = 0; index < masterDates.length; index += 1) {
    const validAssets = filledAssetSeries.every((series) => series[index] !== null);

    if (!validAssets) {
      droppedDates.push(masterDates[index]);
      continue;
    }

    alignedDates.push(masterDates[index]);
    filledAssetSeries.forEach((series, assetIndex) => {
      alignedAssetPrices[assetIndex].push(series[index] as number);
    });
  }

  const benchmarkRawMap = new Map<string, number>();
  if (args.benchmarkSeries) {
    for (const point of args.benchmarkSeries.points) {
      const value = getPrice(point, args.priceField);
      if (!Number.isFinite(value)) {
        continue;
      }

      benchmarkRawMap.set(point.date, value);
    }
  }

  const filledBenchmarkSeries = args.benchmarkSeries
    ? buildFilledSeries({
        dates: alignedDates,
        rawSeries: benchmarkRawMap
      })
    : null;

  return {
    dates: alignedDates,
    assetPrices: alignedAssetPrices,
    benchmarkPrices: filledBenchmarkSeries,
    droppedDates
  };
}

function getPeriodKey(date: string, frequency: "monthly" | "quarterly" | "yearly") {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));

  if (frequency === "monthly") {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  if (frequency === "quarterly") {
    const quarter = Math.floor((month - 1) / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  return year;
}

function getWeekKey(date: string): string {
  const parsed = parseISO(`${date}T00:00:00.000Z`);
  return `${getISOWeekYear(parsed)}-W${String(getISOWeek(parsed)).padStart(2, "0")}`;
}

export function runBacktestEngine(args: {
  config: BacktestConfig;
  assets: ResolvedAsset[];
  assetSeries: ProviderPriceSeries[];
  benchmarkSeries?: ProviderPriceSeries | null;
}): BacktestRunResult {
  const alignment = alignDatesAndPrices({
    assetSeries: args.assetSeries,
    benchmarkSeries: args.benchmarkSeries,
    priceField: args.config.priceField
  });

  if (!alignment.dates.length) {
    throw new Error("No tradable dates available after forward-fill and calendar alignment");
  }

  const feePct = args.config.fees.tradeFeePct / 100;
  const targetWeights = args.assets.map((asset) => asset.weight / 100);

  const holdings = new Map<string, number>();
  args.assets.forEach((asset) => holdings.set(asset.instrumentId, 0));

  let cash = args.config.initialCapital;
  let totalFees = 0;
  let pendingOrder: PendingOrder | null = null;
  let initialAllocated = false;
  const trades: TradeLogEntry[] = [];
  const timeseries: TimeSeriesPoint[] = [];

  const benchmarkBasePrice =
    alignment.benchmarkPrices?.find((price): price is number => price !== null) ?? null;
  const benchmarkUnits =
    benchmarkBasePrice !== null ? args.config.initialCapital / benchmarkBasePrice : null;

  function portfolioValueAt(index: number) {
    let holdingsValue = 0;
    args.assets.forEach((asset, assetIndex) => {
      holdingsValue += (holdings.get(asset.instrumentId) ?? 0) * alignment.assetPrices[assetIndex][index];
    });

    return cash + holdingsValue;
  }

  function buildOrder(argsOrder: {
    decisionIndex: number;
    execIndex: number;
    reason: PendingOrder["reason"];
  }): PendingOrder {
    const decisionValue = portfolioValueAt(argsOrder.decisionIndex);
    const deltaDollars = args.assets.map((asset, assetIndex) => {
      const price = alignment.assetPrices[assetIndex][argsOrder.decisionIndex];
      const shares = holdings.get(asset.instrumentId) ?? 0;
      const currentValue = shares * price;
      const targetValue = targetWeights[assetIndex] * decisionValue;
      return targetValue - currentValue;
    });

    return {
      ...argsOrder,
      deltaDollars
    };
  }

  function appendTrade(entry: {
    decisionIndex: number;
    execIndex: number;
    assetIndex: number;
    side: "buy" | "sell";
    shares: number;
    notional: number;
    fee: number;
    reason: PendingOrder["reason"];
  }) {
    trades.push({
      date: alignment.dates[entry.execIndex],
      decisionDate: alignment.dates[entry.decisionIndex],
      reason: entry.reason,
      instrumentId: args.assets[entry.assetIndex].instrumentId,
      symbol: args.assets[entry.assetIndex].symbol,
      side: entry.side,
      quantity: entry.shares,
      price: alignment.assetPrices[entry.assetIndex][entry.execIndex],
      grossAmount: entry.notional,
      feeAmount: entry.fee
    });
  }

  function executeOrder(order: PendingOrder) {
    const execIndex = order.execIndex;

    // Lookahead-free rule: order was decided at close(t) and is executed at close(t+1).
    // Sells first to release cash.
    args.assets.forEach((asset, assetIndex) => {
      const deltaDollar = order.deltaDollars[assetIndex];
      if (deltaDollar >= 0) {
        return;
      }

      const price = alignment.assetPrices[assetIndex][execIndex];
      const currentShares = holdings.get(asset.instrumentId) ?? 0;
      const desiredShares = Math.abs(deltaDollar) / price;
      const sharesToSell = Math.min(currentShares, desiredShares);

      if (sharesToSell <= 0) {
        return;
      }

      const notional = sharesToSell * price;
      const fee = notional * feePct;
      holdings.set(asset.instrumentId, currentShares - sharesToSell);
      cash += notional - fee;
      totalFees += fee;

      appendTrade({
        decisionIndex: order.decisionIndex,
        execIndex,
        assetIndex,
        side: "sell",
        shares: sharesToSell,
        notional,
        fee,
        reason: order.reason
      });
    });

    // Buys second and scaled if cash is insufficient after fees.
    const desiredBuyTotal = order.deltaDollars.reduce((sum, deltaDollar) => {
      if (deltaDollar <= 0) {
        return sum;
      }
      return sum + deltaDollar;
    }, 0);

    const requiredCash = desiredBuyTotal * (1 + feePct);
    const scale = requiredCash > 0 ? Math.min(1, cash / requiredCash) : 1;

    args.assets.forEach((asset, assetIndex) => {
      const deltaDollar = order.deltaDollars[assetIndex];
      if (deltaDollar <= 0) {
        return;
      }

      const price = alignment.assetPrices[assetIndex][execIndex];
      const desiredNotional = deltaDollar * scale;
      const affordableNotional = Math.min(desiredNotional, cash / (1 + feePct));

      if (affordableNotional <= 0) {
        return;
      }

      const sharesToBuy = affordableNotional / price;
      const fee = affordableNotional * feePct;

      holdings.set(asset.instrumentId, (holdings.get(asset.instrumentId) ?? 0) + sharesToBuy);
      cash -= affordableNotional + fee;
      totalFees += fee;

      appendTrade({
        decisionIndex: order.decisionIndex,
        execIndex,
        assetIndex,
        side: "buy",
        shares: sharesToBuy,
        notional: affordableNotional,
        fee,
        reason: order.reason
      });
    });

  }

  let peak = Number.NEGATIVE_INFINITY;
  let previousValue = 0;

  for (let dayIndex = 0; dayIndex < alignment.dates.length; dayIndex += 1) {
    if (pendingOrder && pendingOrder.execIndex === dayIndex) {
      executeOrder(pendingOrder);
      pendingOrder = null;
    }

    if (!initialAllocated && dayIndex === 0) {
      const initialOrder = buildOrder({
        decisionIndex: 0,
        execIndex: 0,
        reason: "initial_allocation"
      });
      executeOrder(initialOrder);
      initialAllocated = true;
    }

    const portfolioValue = portfolioValueAt(dayIndex);
    peak = Math.max(peak, portfolioValue);

    const benchmarkPrice = alignment.benchmarkPrices?.[dayIndex] ?? null;
    const benchmarkValue =
      benchmarkUnits !== null && benchmarkPrice !== null ? benchmarkUnits * benchmarkPrice : undefined;

    timeseries.push({
      date: alignment.dates[dayIndex],
      portfolioValue,
      benchmarkValue,
      dailyReturn: dayIndex === 0 ? 0 : portfolioValue / previousValue - 1,
      drawdown: peak <= 0 ? 0 : portfolioValue / peak - 1
    });

    previousValue = portfolioValue;

    if (dayIndex >= alignment.dates.length - 1) {
      continue;
    }

    let rebalanceToday = false;
    let reason: PendingOrder["reason"] | null = null;

    if (args.config.rebalancing.mode === "periodic" && dayIndex > 0) {
      const freq = args.config.rebalancing.periodicFrequency;
      const nextDate = alignment.dates[dayIndex + 1];

      if (freq === "weekly") {
        rebalanceToday = getWeekKey(alignment.dates[dayIndex]) !== getWeekKey(nextDate);
      } else {
        const currentKey = getPeriodKey(alignment.dates[dayIndex], freq);
        const nextKey = getPeriodKey(nextDate, freq);
        rebalanceToday = currentKey !== nextKey;
      }

      if (rebalanceToday) {
        reason = "periodic";
      }
    }

    if (args.config.rebalancing.mode === "threshold" && dayIndex > 0) {
      const currentWeights = args.assets.map((asset, assetIndex) => {
        const shares = holdings.get(asset.instrumentId) ?? 0;
        const currentValue = shares * alignment.assetPrices[assetIndex][dayIndex];
        return portfolioValue > 0 ? currentValue / portfolioValue : 0;
      });

      const maxDeviation = currentWeights.reduce((max, currentWeight, assetIndex) => {
        const deviation = Math.abs(currentWeight - targetWeights[assetIndex]);
        return Math.max(max, deviation);
      }, 0);

      rebalanceToday = maxDeviation >= args.config.rebalancing.thresholdPct / 100;
      if (rebalanceToday) {
        reason = "threshold";
      }
    }

    if (rebalanceToday && reason) {
      // Core anti-lookahead rule: decide on close(t), execute strictly on close(t+1).
      pendingOrder = buildOrder({
        decisionIndex: dayIndex,
        execIndex: dayIndex + 1,
        reason
      });
    }
  }

  const summary = computeSummaryMetrics({
    initialCapital: args.config.initialCapital,
    timeseries,
    totalFees
  });

  return {
    config: args.config,
    summary,
    timeseries,
    trades,
    diagnostics: {
      droppedDates: alignment.droppedDates
    }
  };
}
