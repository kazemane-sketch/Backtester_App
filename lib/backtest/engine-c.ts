/**
 * Engine C — Single-Asset Trading Engine
 *
 * State machine: FLAT → LONG → FLAT
 *
 * - Entry: ALL entry rules must be true (AND logic)
 * - Exit: ANY exit rule or stop-loss/take-profit triggers (OR logic)
 * - Lookahead-free: signal at close(t), trade at close(t+1)
 */

import {
  computeATR,
  computeHighest,
  computeLowest,
  computeMomentum,
  computeRSI,
  computeSMA
} from "@/lib/backtest/indicators";
import { computeSummaryMetrics } from "@/lib/backtest/metrics";
import type { ProviderPriceSeries } from "@/lib/market-data/types";
import type { EngineCConfig, SignalCondition } from "@/lib/schemas/engine-c-config";
import type { BacktestSummaryMetrics, TimeSeriesPoint, TradeLogEntry } from "@/types/backtest";

// ─── Types ──────────────────────────────────────────────────────────────────

type ResolvedAsset = {
  instrumentId: string;
  symbol: string;
};

type TradeRecord = {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  holdingDays: number;
  exitReason: "signal" | "stop_loss" | "take_profit";
};

export type EngineCExtendedMetrics = {
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  maxConsecutiveLosses: number;
  timeInMarketPct: number;
  avgHoldingDays: number;
  totalTrades: number;
};

export type EngineCRunResult = {
  engine: "C";
  config: EngineCConfig;
  summary: BacktestSummaryMetrics;
  extendedMetrics: EngineCExtendedMetrics;
  timeseries: TimeSeriesPoint[];
  trades: TradeLogEntry[];
  tradeRecords: TradeRecord[];
  diagnostics?: {
    droppedDates: string[];
  };
};

// ─── Price Alignment ────────────────────────────────────────────────────────

function alignSeries(args: {
  assetSeries: ProviderPriceSeries;
  benchmarkSeries?: ProviderPriceSeries | null;
  priceField: "adjClose" | "close";
}) {
  const getPrice = (point: { adjustedClose: number; close: number }) =>
    args.priceField === "close" ? point.close : point.adjustedClose;

  const prices: number[] = [];
  const dates: string[] = [];

  for (const p of args.assetSeries.points) {
    const v = getPrice(p);
    if (Number.isFinite(v)) {
      prices.push(v);
      dates.push(p.date);
    }
  }

  let benchmarkPrices: (number | null)[] | null = null;
  if (args.benchmarkSeries) {
    const bMap = new Map<string, number>();
    for (const p of args.benchmarkSeries.points) {
      const v = getPrice(p);
      if (Number.isFinite(v)) bMap.set(p.date, v);
    }
    benchmarkPrices = dates.map((d) => bMap.get(d) ?? null);
  }

  return { dates, prices, benchmarkPrices };
}

// ─── Signal Evaluation ──────────────────────────────────────────────────────

type PrecomputedSignals = Map<string, number[]>;

function precomputeSignals(prices: number[], conditions: SignalCondition[]): PrecomputedSignals {
  const cache = new Map<string, number[]>();

  for (const cond of conditions) {
    switch (cond.type) {
      case "sma_cross_above":
      case "sma_cross_below":
      case "price_above_sma":
      case "price_below_sma": {
        const key = `sma:${cond.period}`;
        if (!cache.has(key)) cache.set(key, computeSMA(prices, cond.period));
        break;
      }
      case "rsi_above":
      case "rsi_below": {
        const key = `rsi:${cond.period}`;
        if (!cache.has(key)) cache.set(key, computeRSI(prices, cond.period));
        break;
      }
      case "price_above_highest": {
        const key = `highest:${cond.period}`;
        if (!cache.has(key)) cache.set(key, computeHighest(prices, cond.period));
        break;
      }
      case "price_below_lowest": {
        const key = `lowest:${cond.period}`;
        if (!cache.has(key)) cache.set(key, computeLowest(prices, cond.period));
        break;
      }
      case "momentum_positive":
      case "momentum_negative": {
        const key = `momentum:${cond.period}`;
        if (!cache.has(key)) cache.set(key, computeMomentum(prices, cond.period));
        break;
      }
    }
  }

  return cache;
}

function evaluateCondition(
  cond: SignalCondition,
  idx: number,
  prices: number[],
  cache: PrecomputedSignals
): boolean {
  const price = prices[idx];

  switch (cond.type) {
    case "sma_cross_above": {
      if (idx < 1) return false;
      const sma = cache.get(`sma:${cond.period}`)!;
      return !isNaN(sma[idx]) && !isNaN(sma[idx - 1]) && prices[idx] > sma[idx] && prices[idx - 1] <= sma[idx - 1];
    }
    case "sma_cross_below": {
      if (idx < 1) return false;
      const sma = cache.get(`sma:${cond.period}`)!;
      return !isNaN(sma[idx]) && !isNaN(sma[idx - 1]) && prices[idx] < sma[idx] && prices[idx - 1] >= sma[idx - 1];
    }
    case "price_above_sma": {
      const sma = cache.get(`sma:${cond.period}`)!;
      return !isNaN(sma[idx]) && price > sma[idx];
    }
    case "price_below_sma": {
      const sma = cache.get(`sma:${cond.period}`)!;
      return !isNaN(sma[idx]) && price < sma[idx];
    }
    case "rsi_above": {
      const rsi = cache.get(`rsi:${cond.period}`)!;
      return !isNaN(rsi[idx]) && rsi[idx] > cond.threshold;
    }
    case "rsi_below": {
      const rsi = cache.get(`rsi:${cond.period}`)!;
      return !isNaN(rsi[idx]) && rsi[idx] < cond.threshold;
    }
    case "price_above_highest": {
      const highest = cache.get(`highest:${cond.period}`)!;
      // Price must exceed the previous bar's highest (breakout)
      return idx >= 1 && !isNaN(highest[idx - 1]) && price > highest[idx - 1];
    }
    case "price_below_lowest": {
      const lowest = cache.get(`lowest:${cond.period}`)!;
      return idx >= 1 && !isNaN(lowest[idx - 1]) && price < lowest[idx - 1];
    }
    case "momentum_positive": {
      const mom = cache.get(`momentum:${cond.period}`)!;
      return !isNaN(mom[idx]) && mom[idx] > 0;
    }
    case "momentum_negative": {
      const mom = cache.get(`momentum:${cond.period}`)!;
      return !isNaN(mom[idx]) && mom[idx] < 0;
    }
  }

  return false;
}

// ─── Main Engine ────────────────────────────────────────────────────────────

export function runEngineCBacktest(args: {
  config: EngineCConfig;
  asset: ResolvedAsset;
  assetSeries: ProviderPriceSeries;
  benchmarkSeries?: ProviderPriceSeries | null;
}): EngineCRunResult {
  const { config, asset } = args;

  const aligned = alignSeries({
    assetSeries: args.assetSeries,
    benchmarkSeries: args.benchmarkSeries,
    priceField: config.priceField
  });

  if (aligned.dates.length < 2) {
    throw new Error("Insufficient price data for Engine C backtest");
  }

  const { dates, prices } = aligned;
  const N = dates.length;
  const feePct = config.fees.tradeFeePct / 100;
  const positionFraction = config.positionSizePct / 100;

  // Precompute indicator signals for entry and exit rules separately
  const entryCache = precomputeSignals(prices, config.entryRules);
  const exitCache = precomputeSignals(prices, config.exitRules);

  // Precompute ATR if needed for stop loss
  let atrSeries: number[] | null = null;
  if (config.stopLoss?.type === "atr_multiple") {
    atrSeries = computeATR(prices, config.stopLoss.period);
  }

  // State
  let cash = config.initialCapital;
  let shares = 0;
  let totalFees = 0;
  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;
  let peakSinceEntry = 0;

  const trades: TradeLogEntry[] = [];
  const tradeRecords: TradeRecord[] = [];
  const timeseries: TimeSeriesPoint[] = [];

  // Benchmark
  const benchmarkBasePrice = aligned.benchmarkPrices?.find((p): p is number => p !== null) ?? null;
  const benchmarkUnits = benchmarkBasePrice !== null ? config.initialCapital / benchmarkBasePrice : null;

  // Pending actions (lookahead-free)
  let pendingEntry = false;
  let pendingExit = false;
  let pendingExitReason: "signal" | "stop_loss" | "take_profit" = "signal";

  let daysInMarket = 0;
  let peak = Number.NEGATIVE_INFINITY;
  let previousValue = 0;

  for (let i = 0; i < N; i++) {
    const price = prices[i];

    // Execute pending entry
    if (pendingEntry && !inPosition && i > 0) {
      const capitalForTrade = cash * positionFraction;
      const notional = capitalForTrade / (1 + feePct);
      const fee = notional * feePct;
      shares = notional / price;

      cash -= notional + fee;
      totalFees += fee;
      inPosition = true;
      entryPrice = price;
      entryIdx = i;
      peakSinceEntry = price;

      trades.push({
        date: dates[i],
        decisionDate: dates[i - 1],
        instrumentId: asset.instrumentId,
        symbol: asset.symbol,
        side: "buy",
        quantity: shares,
        price,
        grossAmount: notional,
        feeAmount: fee
      });

      pendingEntry = false;
    }

    // Execute pending exit
    if (pendingExit && inPosition && i > 0) {
      const notional = shares * price;
      const fee = notional * feePct;

      cash += notional - fee;
      totalFees += fee;

      trades.push({
        date: dates[i],
        decisionDate: dates[i - 1],
        instrumentId: asset.instrumentId,
        symbol: asset.symbol,
        side: "sell",
        quantity: shares,
        price,
        grossAmount: notional,
        feeAmount: fee
      });

      tradeRecords.push({
        entryDate: dates[entryIdx],
        entryPrice,
        exitDate: dates[i],
        exitPrice: price,
        returnPct: (price / entryPrice - 1) * 100,
        holdingDays: i - entryIdx,
        exitReason: pendingExitReason
      });

      shares = 0;
      inPosition = false;
      pendingExit = false;
    }

    // Track days in market
    if (inPosition) {
      daysInMarket++;
      peakSinceEntry = Math.max(peakSinceEntry, price);
    }

    // Record timeseries
    const portfolioValue = cash + shares * price;
    peak = Math.max(peak, portfolioValue);

    const benchmarkPrice = aligned.benchmarkPrices?.[i] ?? null;
    const benchmarkValue =
      benchmarkUnits !== null && benchmarkPrice !== null ? benchmarkUnits * benchmarkPrice : undefined;

    timeseries.push({
      date: dates[i],
      portfolioValue,
      benchmarkValue,
      dailyReturn: i === 0 ? 0 : portfolioValue / previousValue - 1,
      drawdown: peak <= 0 ? 0 : portfolioValue / peak - 1
    });
    previousValue = portfolioValue;

    // Skip signal evaluation on last day (can't trade next day)
    if (i >= N - 1) continue;

    // ── Evaluate exit signals (if in position) ──
    if (inPosition && !pendingExit) {
      let shouldExit = false;
      let exitReason: "signal" | "stop_loss" | "take_profit" = "signal";

      // Check stop loss
      if (config.stopLoss) {
        if (config.stopLoss.type === "fixed_pct") {
          const stopPrice = entryPrice * (1 - config.stopLoss.pct / 100);
          if (price <= stopPrice) {
            shouldExit = true;
            exitReason = "stop_loss";
          }
        } else if (config.stopLoss.type === "trailing_pct") {
          const stopPrice = peakSinceEntry * (1 - config.stopLoss.pct / 100);
          if (price <= stopPrice) {
            shouldExit = true;
            exitReason = "stop_loss";
          }
        } else if (config.stopLoss.type === "atr_multiple" && atrSeries) {
          const atr = atrSeries[i];
          if (!isNaN(atr)) {
            const stopPrice = entryPrice - atr * config.stopLoss.multiple;
            if (price <= stopPrice) {
              shouldExit = true;
              exitReason = "stop_loss";
            }
          }
        }
      }

      // Check take profit
      if (!shouldExit && config.takeProfitPct) {
        const tpPrice = entryPrice * (1 + config.takeProfitPct / 100);
        if (price >= tpPrice) {
          shouldExit = true;
          exitReason = "take_profit";
        }
      }

      // Check exit signal rules (OR logic — any one triggers)
      if (!shouldExit) {
        for (const rule of config.exitRules) {
          if (evaluateCondition(rule, i, prices, exitCache)) {
            shouldExit = true;
            exitReason = "signal";
            break;
          }
        }
      }

      if (shouldExit) {
        pendingExit = true;
        pendingExitReason = exitReason;
      }
    }

    // ── Evaluate entry signals (if flat) ──
    if (!inPosition && !pendingEntry && !pendingExit) {
      // ALL entry rules must be true (AND logic)
      const allPass = config.entryRules.every((rule) => evaluateCondition(rule, i, prices, entryCache));
      if (allPass) {
        pendingEntry = true;
      }
    }
  }

  // ─── Force close any open position at end ──
  if (inPosition) {
    const lastPrice = prices[N - 1];
    const notional = shares * lastPrice;
    const fee = notional * feePct;
    cash += notional - fee;
    totalFees += fee;

    trades.push({
      date: dates[N - 1],
      instrumentId: asset.instrumentId,
      symbol: asset.symbol,
      side: "sell",
      quantity: shares,
      price: lastPrice,
      grossAmount: notional,
      feeAmount: fee
    });

    tradeRecords.push({
      entryDate: dates[entryIdx],
      entryPrice,
      exitDate: dates[N - 1],
      exitPrice: lastPrice,
      returnPct: (lastPrice / entryPrice - 1) * 100,
      holdingDays: N - 1 - entryIdx,
      exitReason: "signal"
    });

    shares = 0;
  }

  // ─── Compute Metrics ──────────────────────────────────────────────────────

  const summary = computeSummaryMetrics({
    initialCapital: config.initialCapital,
    timeseries,
    totalFees
  });

  const extendedMetrics = computeExtendedMetrics(tradeRecords, daysInMarket, N);

  return {
    engine: "C",
    config,
    summary,
    extendedMetrics,
    timeseries,
    trades,
    tradeRecords,
    diagnostics: { droppedDates: [] }
  };
}

// ─── Extended Metrics ───────────────────────────────────────────────────────

function computeExtendedMetrics(
  records: TradeRecord[],
  daysInMarket: number,
  totalDays: number
): EngineCExtendedMetrics {
  if (records.length === 0) {
    return {
      winRate: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      profitFactor: 0,
      maxConsecutiveLosses: 0,
      timeInMarketPct: 0,
      avgHoldingDays: 0,
      totalTrades: 0
    };
  }

  const wins = records.filter((r) => r.returnPct > 0);
  const losses = records.filter((r) => r.returnPct <= 0);

  const winRate = wins.length / records.length;
  const avgWinPct = wins.length > 0 ? wins.reduce((s, r) => s + r.returnPct, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? losses.reduce((s, r) => s + r.returnPct, 0) / losses.length : 0;

  const grossProfit = wins.reduce((s, r) => s + r.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r.returnPct, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max consecutive losses
  let maxConsecLosses = 0;
  let currentStreak = 0;
  for (const r of records) {
    if (r.returnPct <= 0) {
      currentStreak++;
      maxConsecLosses = Math.max(maxConsecLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const avgHoldingDays = records.reduce((s, r) => s + r.holdingDays, 0) / records.length;
  const timeInMarketPct = totalDays > 0 ? (daysInMarket / totalDays) * 100 : 0;

  return {
    winRate,
    avgWinPct,
    avgLossPct,
    profitFactor,
    maxConsecutiveLosses: maxConsecLosses,
    timeInMarketPct,
    avgHoldingDays,
    totalTrades: records.length
  };
}
