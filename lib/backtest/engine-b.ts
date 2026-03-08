/**
 * Engine B — Tactical Rule-Based Allocation
 *
 * At each rebalance date:
 *   1. Compute indicators for all universe assets
 *   2. Apply filter rules (all must pass — AND logic)
 *   3. Rank surviving assets by specified criteria
 *   4. Select top-N (capped by maxPositions)
 *   5. Allocate weights (equal, inverse volatility, rank-weighted, risk parity)
 *   6. Execute trades: sell positions no longer selected, buy new ones
 *
 * Lookahead-free: decisions at close(t), execution at close(t+1).
 */

import { isPeriodEnd } from "@/lib/backtest/calendar";
import {
  computeDrawdown,
  computeEMA,
  computeMomentum,
  computeRSI,
  computeSMA,
  computeVolatility
} from "@/lib/backtest/indicators";
import { computeSummaryMetrics } from "@/lib/backtest/metrics";
import type { ProviderPriceSeries } from "@/lib/market-data/types";
import type { EngineBConfig, FilterRule, IndicatorType } from "@/lib/schemas/engine-b-config";
import type { BacktestSummaryMetrics, TimeSeriesPoint, TradeLogEntry } from "@/types/backtest";

// ─── Types ──────────────────────────────────────────────────────────────────

type ResolvedUniverseAsset = {
  instrumentId: string;
  symbol: string;
};

export type EngineBRunResult = {
  engine: "B";
  config: EngineBConfig;
  summary: BacktestSummaryMetrics;
  timeseries: TimeSeriesPoint[];
  trades: TradeLogEntry[];
  /** Per-rebalance snapshot of which assets were selected and their weights. */
  allocationHistory: AllocationSnapshot[];
  diagnostics?: {
    droppedDates: string[];
  };
};

type AllocationSnapshot = {
  date: string;
  positions: Array<{
    symbol: string;
    instrumentId: string;
    weight: number;
  }>;
  /** How many assets passed filters before ranking cutoff. */
  survivorCount: number;
};

// ─── Price Alignment (reused from Engine A pattern) ─────────────────────────

function alignDatesAndPrices(args: {
  assetSeries: ProviderPriceSeries[];
  benchmarkSeries?: ProviderPriceSeries | null;
  priceField: "adjClose" | "close";
}) {
  const getPrice = (point: { adjustedClose: number; close: number }) =>
    args.priceField === "close" ? point.close : point.adjustedClose;

  // Collect union of all dates
  const allDates = new Set<string>();
  const rawMaps: Map<string, number>[] = [];

  for (const series of args.assetSeries) {
    const map = new Map<string, number>();
    for (const p of series.points) {
      const v = getPrice(p);
      if (Number.isFinite(v)) {
        map.set(p.date, v);
        allDates.add(p.date);
      }
    }
    rawMaps.push(map);
  }

  const masterDates = [...allDates].sort();
  if (!masterDates.length) {
    return { dates: [] as string[], assetPrices: [] as number[][], benchmarkPrices: null as (number | null)[] | null, droppedDates: [] as string[] };
  }

  // Forward-fill each series (max 3-day gap)
  const filled = rawMaps.map((raw) => {
    const out: (number | null)[] = [];
    let last: number | null = null;
    let lastIdx = -Infinity;
    for (let i = 0; i < masterDates.length; i++) {
      const v = raw.get(masterDates[i]);
      if (v !== undefined && Number.isFinite(v)) {
        out.push(v);
        last = v;
        lastIdx = i;
      } else if (last !== null && i - lastIdx <= 3) {
        out.push(last);
      } else {
        out.push(null);
      }
    }
    return out;
  });

  // Keep only dates where ALL assets have data
  const alignedDates: string[] = [];
  const droppedDates: string[] = [];
  const alignedPrices: number[][] = args.assetSeries.map(() => []);

  for (let i = 0; i < masterDates.length; i++) {
    if (filled.every((s) => s[i] !== null)) {
      alignedDates.push(masterDates[i]);
      filled.forEach((s, a) => alignedPrices[a].push(s[i] as number));
    } else {
      droppedDates.push(masterDates[i]);
    }
  }

  // Benchmark
  let benchmarkPrices: (number | null)[] | null = null;
  if (args.benchmarkSeries) {
    const bMap = new Map<string, number>();
    for (const p of args.benchmarkSeries.points) {
      const v = getPrice(p);
      if (Number.isFinite(v)) bMap.set(p.date, v);
    }
    benchmarkPrices = alignedDates.map((d) => bMap.get(d) ?? null);
  }

  return { dates: alignedDates, assetPrices: alignedPrices, benchmarkPrices, droppedDates };
}

// ─── Indicator Computation ──────────────────────────────────────────────────

function getIndicatorValues(
  prices: number[],
  indicator: IndicatorType,
  period: number
): number[] {
  switch (indicator) {
    case "sma":
      return computeSMA(prices, period);
    case "ema":
      return computeEMA(prices, period);
    case "rsi":
      return computeRSI(prices, period);
    case "momentum":
      return computeMomentum(prices, period);
    case "volatility":
      return computeVolatility(prices, period);
    case "drawdown":
      return computeDrawdown(prices);
    case "price":
      return [...prices];
    default:
      return prices.map(() => NaN);
  }
}

// ─── Filter Evaluation ──────────────────────────────────────────────────────

function evaluateFilter(
  rule: FilterRule,
  indicatorValue: number,
  currentPrice: number
): boolean {
  if (!Number.isFinite(indicatorValue)) return false;

  const threshold = rule.threshold === "price" ? currentPrice : rule.threshold;
  if (!Number.isFinite(threshold)) return false;

  switch (rule.operator) {
    case "gt":
      return indicatorValue > threshold;
    case "lt":
      return indicatorValue < threshold;
    case "gte":
      return indicatorValue >= threshold;
    case "lte":
      return indicatorValue <= threshold;
    default:
      return false;
  }
}

// ─── Weight Allocation ──────────────────────────────────────────────────────

function allocateWeights(args: {
  method: EngineBConfig["allocation"];
  selectedCount: number;
  /** Annualized volatility per selected asset (for inv-vol / risk-parity). */
  volatilities: number[];
  /** Rank position per selected asset (0 = best, 1 = second best, ...). */
  ranks: number[];
}): number[] {
  const n = args.selectedCount;
  if (n === 0) return [];

  if (args.method === "equal_weight") {
    return new Array(n).fill(1 / n);
  }

  if (args.method === "inverse_volatility") {
    const invVols = args.volatilities.map((v) => (v > 0 ? 1 / v : 0));
    const total = invVols.reduce((s, v) => s + v, 0);
    return total > 0 ? invVols.map((v) => v / total) : new Array(n).fill(1 / n);
  }

  if (args.method === "risk_parity") {
    // Simplified risk parity: weight ∝ 1/variance so each asset contributes equal risk
    const invVar = args.volatilities.map((v) => (v > 0 ? 1 / (v * v) : 0));
    const total = invVar.reduce((s, v) => s + v, 0);
    return total > 0 ? invVar.map((v) => v / total) : new Array(n).fill(1 / n);
  }

  if (args.method === "rank_weighted") {
    // Weight inversely proportional to rank (best rank = highest weight)
    const weights = args.ranks.map((r) => n - r);
    const total = weights.reduce((s, w) => s + w, 0);
    return total > 0 ? weights.map((w) => w / total) : new Array(n).fill(1 / n);
  }

  return new Array(n).fill(1 / n);
}

// ─── Main Engine ────────────────────────────────────────────────────────────

export function runEngineBBacktest(args: {
  config: EngineBConfig;
  assets: ResolvedUniverseAsset[];
  assetSeries: ProviderPriceSeries[];
  benchmarkSeries?: ProviderPriceSeries | null;
}): EngineBRunResult {
  const { config, assets } = args;

  const alignment = alignDatesAndPrices({
    assetSeries: args.assetSeries,
    benchmarkSeries: args.benchmarkSeries,
    priceField: config.priceField
  });

  if (!alignment.dates.length) {
    throw new Error("No tradable dates available after alignment");
  }

  const N = alignment.dates.length;
  const feePct = config.fees.tradeFeePct / 100;

  // Pre-compute all indicator series needed for filters and ranking
  const indicatorCache = new Map<string, number[]>();

  function getCachedIndicator(assetIdx: number, indicator: IndicatorType, period: number): number[] {
    const key = `${assetIdx}:${indicator}:${period}`;
    let cached = indicatorCache.get(key);
    if (!cached) {
      cached = getIndicatorValues(alignment.assetPrices[assetIdx], indicator, period);
      indicatorCache.set(key, cached);
    }
    return cached;
  }

  // State
  const holdings = new Map<string, number>(); // instrumentId → shares
  let cash = config.initialCapital;
  let totalFees = 0;
  const trades: TradeLogEntry[] = [];
  const timeseries: TimeSeriesPoint[] = [];
  const allocationHistory: AllocationSnapshot[] = [];

  // Benchmark
  const benchmarkBasePrice = alignment.benchmarkPrices?.find((p): p is number => p !== null) ?? null;
  const benchmarkUnits = benchmarkBasePrice !== null ? config.initialCapital / benchmarkBasePrice : null;

  // Current target weights (updated at each rebalance)
  // Current target weights are tracked for potential future threshold-rebalance support

  function portfolioValueAt(dayIdx: number): number {
    let value = cash;
    for (const [instId, shares] of holdings) {
      const assetIdx = assets.findIndex((a) => a.instrumentId === instId);
      if (assetIdx >= 0) {
        value += shares * alignment.assetPrices[assetIdx][dayIdx];
      }
    }
    return value;
  }

  function executeRebalance(dayIdx: number, execIdx: number) {
    // ── Step 1: Evaluate filters for each asset ──
    const survivors: number[] = []; // asset indices that pass all filters

    for (let a = 0; a < assets.length; a++) {
      const price = alignment.assetPrices[a][dayIdx];
      let passes = true;

      for (const filter of config.filters) {
        const indicatorValues = getCachedIndicator(a, filter.indicator, filter.period);
        const value = indicatorValues[dayIdx];
        if (!evaluateFilter(filter, value, price)) {
          passes = false;
          break;
        }
      }

      if (passes) survivors.push(a);
    }

    // ── Step 2: Rank survivors ──
    const rankedSurvivors = [...survivors];

    if (config.ranking.length > 0) {
      // Sort by multiple criteria (first is primary)
      rankedSurvivors.sort((a, b) => {
        for (const criterion of config.ranking) {
          const aValues = getCachedIndicator(a, criterion.metric, criterion.period);
          const bValues = getCachedIndicator(b, criterion.metric, criterion.period);
          const aVal = aValues[dayIdx];
          const bVal = bValues[dayIdx];

          // NaN goes to the end
          if (isNaN(aVal) && isNaN(bVal)) continue;
          if (isNaN(aVal)) return 1;
          if (isNaN(bVal)) return -1;

          const diff = criterion.direction === "desc" ? bVal - aVal : aVal - bVal;
          if (Math.abs(diff) > 1e-12) return diff;
        }
        return 0;
      });
    }

    // ── Step 3: Select top-N ──
    const selected = rankedSurvivors.slice(0, config.maxPositions);

    // ── Step 4: Compute weights ──
    const volatilities = selected.map((a) => {
      const volSeries = getCachedIndicator(a, "volatility", config.volatilityLookback);
      const v = volSeries[dayIdx];
      return Number.isFinite(v) ? v : 0.2; // Default 20% vol if not available
    });

    const ranks = selected.map((_, i) => i);

    const rawWeights = allocateWeights({
      method: config.allocation,
      selectedCount: selected.length,
      volatilities,
      ranks
    });

    // Build new target weights map
    const newTargets = new Map<string, number>();
    selected.forEach((assetIdx, i) => {
      newTargets.set(assets[assetIdx].instrumentId, rawWeights[i]);
    });

    // Record allocation snapshot
    allocationHistory.push({
      date: alignment.dates[dayIdx],
      positions: selected.map((assetIdx, i) => ({
        symbol: assets[assetIdx].symbol,
        instrumentId: assets[assetIdx].instrumentId,
        weight: rawWeights[i]
      })),
      survivorCount: survivors.length
    });

    // ── Step 5: Execute trades at execIdx ──
    // Determine what to sell (positions no longer in target or overweight)
    const execValue = portfolioValueAt(execIdx);

    // Sell positions that are no longer selected
    for (const [instId, shares] of holdings) {
      if (shares <= 0) continue;
      const newWeight = newTargets.get(instId) ?? 0;
      const assetIdx = assets.findIndex((a) => a.instrumentId === instId);
      if (assetIdx < 0) continue;

      const price = alignment.assetPrices[assetIdx][execIdx];
      const currentValue = shares * price;
      const targetValue = newWeight * execValue;

      if (currentValue > targetValue + 1) {
        // Sell excess
        const sellValue = currentValue - targetValue;
        const sharesToSell = Math.min(shares, sellValue / price);
        if (sharesToSell <= 0) continue;

        const notional = sharesToSell * price;
        const fee = notional * feePct;
        holdings.set(instId, shares - sharesToSell);
        cash += notional - fee;
        totalFees += fee;

        trades.push({
          date: alignment.dates[execIdx],
          decisionDate: alignment.dates[dayIdx],
          reason: "periodic",
          instrumentId: instId,
          symbol: assets[assetIdx].symbol,
          side: "sell",
          quantity: sharesToSell,
          price,
          grossAmount: notional,
          feeAmount: fee
        });
      }
    }

    // Buy into new/underweight positions
    const totalBuyNeeded: { assetIdx: number; targetValue: number; currentValue: number }[] = [];

    for (const [assetIdx, weight] of selected.map((a, i) => [a, rawWeights[i]] as const)) {
      const instId = assets[assetIdx].instrumentId;
      const price = alignment.assetPrices[assetIdx][execIdx];
      const currentShares = holdings.get(instId) ?? 0;
      const currentValue = currentShares * price;
      const updatedExecValue = portfolioValueAt(execIdx);
      const targetValue = weight * updatedExecValue;

      if (targetValue > currentValue + 1) {
        totalBuyNeeded.push({ assetIdx, targetValue, currentValue });
      }
    }

    // Scale buys if insufficient cash
    const totalDesiredBuy = totalBuyNeeded.reduce((s, b) => s + (b.targetValue - b.currentValue), 0);
    const cashForBuys = cash;
    const buyScale = totalDesiredBuy > 0 ? Math.min(1, cashForBuys / (totalDesiredBuy * (1 + feePct))) : 1;

    for (const buy of totalBuyNeeded) {
      const instId = assets[buy.assetIdx].instrumentId;
      const price = alignment.assetPrices[buy.assetIdx][execIdx];
      const desiredNotional = (buy.targetValue - buy.currentValue) * buyScale;
      const affordable = Math.min(desiredNotional, cash / (1 + feePct));
      if (affordable <= 0) continue;

      const sharesToBuy = affordable / price;
      const fee = affordable * feePct;

      holdings.set(instId, (holdings.get(instId) ?? 0) + sharesToBuy);
      cash -= affordable + fee;
      totalFees += fee;

      trades.push({
        date: alignment.dates[execIdx],
        decisionDate: alignment.dates[dayIdx],
        reason: "periodic",
        instrumentId: instId,
        symbol: assets[buy.assetIdx].symbol,
        side: "buy",
        quantity: sharesToBuy,
        price,
        grossAmount: affordable,
        feeAmount: fee
      });
    }

    // newTargets captured for future threshold-rebalance support
    void newTargets;
  }

  // ─── Main Simulation Loop ─────────────────────────────────────────────────

  let peak = Number.NEGATIVE_INFINITY;
  let previousValue = 0;
  let pendingRebalance: { decisionIdx: number; execIdx: number } | null = null;

  for (let dayIdx = 0; dayIdx < N; dayIdx++) {
    // Execute pending rebalance
    if (pendingRebalance && pendingRebalance.execIdx === dayIdx) {
      executeRebalance(pendingRebalance.decisionIdx, dayIdx);
      pendingRebalance = null;
    }

    // Initial allocation on day 0
    if (dayIdx === 0) {
      executeRebalance(0, 0);
    }

    // Record timeseries
    const portfolioValue = portfolioValueAt(dayIdx);
    peak = Math.max(peak, portfolioValue);

    const benchmarkPrice = alignment.benchmarkPrices?.[dayIdx] ?? null;
    const benchmarkValue =
      benchmarkUnits !== null && benchmarkPrice !== null ? benchmarkUnits * benchmarkPrice : undefined;

    timeseries.push({
      date: alignment.dates[dayIdx],
      portfolioValue,
      benchmarkValue,
      dailyReturn: dayIdx === 0 ? 0 : portfolioValue / previousValue - 1,
      drawdown: peak <= 0 ? 0 : portfolioValue / peak - 1
    });
    previousValue = portfolioValue;

    // Check for rebalance trigger
    if (dayIdx > 0 && dayIdx < N - 1) {
      const nextDate = alignment.dates[dayIdx + 1];
      const freq = config.rebalanceFrequency === "weekly"
        ? "weekly" as const
        : config.rebalanceFrequency === "quarterly"
          ? "quarterly" as const
          : "monthly" as const;

      if (isPeriodEnd(alignment.dates[dayIdx], nextDate, freq)) {
        pendingRebalance = {
          decisionIdx: dayIdx,
          execIdx: dayIdx + 1
        };
      }
    }
  }

  // ─── Compute Summary ──────────────────────────────────────────────────────

  const summary = computeSummaryMetrics({
    initialCapital: config.initialCapital,
    timeseries,
    totalFees
  });

  return {
    engine: "B",
    config,
    summary,
    timeseries,
    trades,
    allocationHistory,
    diagnostics: { droppedDates: alignment.droppedDates }
  };
}
