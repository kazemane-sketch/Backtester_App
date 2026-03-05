import { describe, expect, it } from "vitest";

import { runBacktestEngine } from "@/lib/backtest/engine";
import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import type { ProviderPriceSeries } from "@/lib/market-data/types";

const baseConfig: BacktestConfig = {
  name: "Test",
  startDate: "2024-01-01",
  endDate: "2024-01-05",
  initialCapital: 10000,
  assets: [
    { query: "AAA", weight: 50 },
    { query: "BBB", weight: 50 }
  ],
  rebalancing: {
    mode: "none"
  },
  fees: {
    tradeFeePct: 0
  },
  dataProvider: "EODHD"
};

const assetSeries: ProviderPriceSeries[] = [
  {
    providerInstrumentId: "AAA.US",
    symbol: "AAA",
    currency: "USD",
    points: [
      { date: "2024-01-01", adjustedClose: 100 },
      { date: "2024-01-02", adjustedClose: 102 },
      { date: "2024-01-03", adjustedClose: 101 },
      { date: "2024-01-04", adjustedClose: 103 },
      { date: "2024-01-05", adjustedClose: 105 }
    ]
  },
  {
    providerInstrumentId: "BBB.US",
    symbol: "BBB",
    currency: "USD",
    points: [
      { date: "2024-01-01", adjustedClose: 200 },
      { date: "2024-01-02", adjustedClose: 202 },
      { date: "2024-01-03", adjustedClose: 204 },
      { date: "2024-01-04", adjustedClose: 206 },
      { date: "2024-01-05", adjustedClose: 208 }
    ]
  }
];

describe("runBacktestEngine", () => {
  const assets = [
    { instrumentId: "i-aaa", symbol: "AAA", weight: 50 },
    { instrumentId: "i-bbb", symbol: "BBB", weight: 50 }
  ];

  it("calculates equity curve and metrics", () => {
    const result = runBacktestEngine({
      config: baseConfig,
      assets,
      assetSeries
    });

    expect(result.timeseries.length).toBe(5);
    expect(result.summary.totalReturn).toBeGreaterThan(0);
    expect(Number.isFinite(result.summary.cagr)).toBe(true);
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it("applies periodic rebalancing", () => {
    const result = runBacktestEngine({
      config: {
        ...baseConfig,
        rebalancing: {
          mode: "periodic",
          periodicFrequency: "weekly"
        }
      },
      assets,
      assetSeries
    });

    expect(result.trades.length).toBeGreaterThan(2);
  });

  it("applies threshold rebalancing", () => {
    const trendingSeries: ProviderPriceSeries[] = [
      {
        ...assetSeries[0],
        points: assetSeries[0].points.map((point, index) => ({
          ...point,
          adjustedClose: point.adjustedClose * (1 + index * 0.2)
        }))
      },
      assetSeries[1]
    ];

    const result = runBacktestEngine({
      config: {
        ...baseConfig,
        rebalancing: {
          mode: "threshold",
          thresholdPct: 5
        }
      },
      assets,
      assetSeries: trendingSeries
    });

    expect(result.trades.length).toBeGreaterThan(2);
  });

  it("captures fee impact", () => {
    const noFee = runBacktestEngine({
      config: {
        ...baseConfig,
        fees: { tradeFeePct: 0 }
      },
      assets,
      assetSeries
    });

    const withFee = runBacktestEngine({
      config: {
        ...baseConfig,
        fees: { tradeFeePct: 0.5 }
      },
      assets,
      assetSeries
    });

    expect(withFee.summary.totalFees).toBeGreaterThan(0);
    expect(withFee.timeseries[withFee.timeseries.length - 1].portfolioValue).toBeLessThan(
      noFee.timeseries[noFee.timeseries.length - 1].portfolioValue
    );
  });
});
