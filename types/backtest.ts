import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import type { EngineBConfig } from "@/lib/schemas/engine-b-config";
import type { EngineCConfig } from "@/lib/schemas/engine-c-config";

export type PricePoint = {
  date: string;
  close: number;
  adjustedClose: number;
};

export type InstrumentSeries = {
  instrumentId: string;
  symbol: string;
  currency: string;
  points: PricePoint[];
};

export type TimeSeriesPoint = {
  date: string;
  portfolioValue: number;
  benchmarkValue?: number;
  dailyReturn: number;
  drawdown: number;
};

export type TradeLogEntry = {
  date: string;
  decisionDate?: string;
  reason?: "initial_allocation" | "periodic" | "threshold" | "signal" | "stop_loss" | "take_profit";
  instrumentId?: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  grossAmount: number;
  feeAmount: number;
};

export type BacktestSummaryMetrics = {
  totalReturn: number;
  cagr: number;
  volatilityAnn: number;
  sharpe: number;
  maxDrawdown: number;
  calmar: number;
  totalFees: number;
};

// ─── Engine A Result ────────────────────────────────────────────────────────

export type BacktestRunResult = {
  engine?: "A";
  config: BacktestConfig;
  summary: BacktestSummaryMetrics;
  timeseries: TimeSeriesPoint[];
  trades: TradeLogEntry[];
  diagnostics?: {
    droppedDates: string[];
  };
};

// ─── Engine B Result ────────────────────────────────────────────────────────

export type AllocationSnapshot = {
  date: string;
  positions: Array<{
    symbol: string;
    instrumentId: string;
    weight: number;
  }>;
  survivorCount: number;
};

export type EngineBRunResult = {
  engine: "B";
  config: EngineBConfig;
  summary: BacktestSummaryMetrics;
  timeseries: TimeSeriesPoint[];
  trades: TradeLogEntry[];
  allocationHistory: AllocationSnapshot[];
  diagnostics?: {
    droppedDates: string[];
  };
};

// ─── Engine C Result ────────────────────────────────────────────────────────

export type TradeRecord = {
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

// ─── Union Type ─────────────────────────────────────────────────────────────

export type AnyBacktestResult = BacktestRunResult | EngineBRunResult | EngineCRunResult;
