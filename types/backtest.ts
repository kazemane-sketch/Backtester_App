import type { BacktestConfig } from "@/lib/schemas/backtest-config";

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
  reason?: "initial_allocation" | "periodic" | "threshold";
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

export type BacktestRunResult = {
  config: BacktestConfig;
  summary: BacktestSummaryMetrics;
  timeseries: TimeSeriesPoint[];
  trades: TradeLogEntry[];
  diagnostics?: {
    droppedDates: string[];
  };
};
