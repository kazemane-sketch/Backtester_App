"use client";

import { useMemo, useState } from "react";

import { backtestConfigSchema, type BacktestConfig } from "@/lib/schemas/backtest-config";

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  name: "My Portfolio Backtest",
  startDate: "2018-01-01",
  endDate: new Date().toISOString().slice(0, 10),
  initialCapital: 10000,
  assets: [
    {
      query: "SPY",
      weight: 100
    }
  ],
  rebalancing: {
    mode: "none"
  },
  fees: {
    tradeFeePct: 0.1
  },
  priceField: "adjClose",
  benchmark: {
    query: "SPY"
  },
  dataProvider: "EODHD"
};

export function useBacktestConfig(initialConfig?: BacktestConfig) {
  const [config, setConfig] = useState<BacktestConfig>(initialConfig ?? DEFAULT_BACKTEST_CONFIG);

  const validation = useMemo(() => backtestConfigSchema.safeParse(config), [config]);

  return {
    config,
    setConfig,
    validation,
    isValid: validation.success,
    issues: validation.success ? [] : validation.error.issues
  };
}
