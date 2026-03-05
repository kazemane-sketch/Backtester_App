import { describe, expect, it } from "vitest";

import { runBacktestEngine } from "@/lib/backtest/engine";
import type { ProviderPriceSeries } from "@/lib/market-data/types";
import type { BacktestConfig } from "@/lib/schemas/backtest-config";

function buildConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    name: "No Lookahead Test",
    startDate: "2024-01-01",
    endDate: "2024-01-10",
    initialCapital: 1000,
    assets: [
      { query: "AAA", resolvedInstrumentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", weight: 50 },
      { query: "BBB", resolvedInstrumentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", weight: 50 }
    ],
    rebalancing: { mode: "threshold", thresholdPct: 10 },
    fees: { tradeFeePct: 0 },
    priceField: "adjClose",
    dataProvider: "EODHD",
    ...overrides
  };
}

function asSeries(symbol: string, prices: Array<[string, number]>): ProviderPriceSeries {
  return {
    providerInstrumentId: `${symbol}.US`,
    symbol,
    currency: "USD",
    points: prices.map(([date, value]) => ({
      date,
      close: value,
      adjustedClose: value
    }))
  };
}

describe("runBacktestEngine - lookahead free", () => {
  const assets = [
    { instrumentId: "asset-a", symbol: "AAA", weight: 50 },
    { instrumentId: "asset-b", symbol: "BBB", weight: 50 }
  ];

  it("threshold decision at t executes trades at t+1", () => {
    const result = runBacktestEngine({
      config: buildConfig(),
      assets,
      assetSeries: [
        asSeries("AAA", [
          ["2024-01-01", 100],
          ["2024-01-02", 100],
          ["2024-01-03", 200],
          ["2024-01-04", 50]
        ]),
        asSeries("BBB", [
          ["2024-01-01", 100],
          ["2024-01-02", 100],
          ["2024-01-03", 100],
          ["2024-01-04", 100]
        ])
      ]
    });

    const thresholdTrades = result.trades.filter((trade) => trade.reason === "threshold");
    expect(thresholdTrades.length).toBeGreaterThan(0);
    expect(thresholdTrades.every((trade) => trade.decisionDate !== trade.date)).toBe(true);

    const firstThresholdTrade = thresholdTrades[0];
    expect(firstThresholdTrade.decisionDate).toBe("2024-01-03");
    expect(firstThresholdTrade.date).toBe("2024-01-04");
  });

  it("forward-fill uses last known value and never future values", () => {
    const result = runBacktestEngine({
      config: buildConfig({
        rebalancing: { mode: "none" }
      }),
      assets,
      assetSeries: [
        asSeries("AAA", [
          ["2024-01-01", 100],
          ["2024-01-03", 200]
        ]),
        asSeries("BBB", [
          ["2024-01-01", 100],
          ["2024-01-02", 100],
          ["2024-01-03", 100]
        ])
      ]
    });

    const day2 = result.timeseries.find((point) => point.date === "2024-01-02");
    expect(day2).toBeDefined();
    expect(day2!.portfolioValue).toBeCloseTo(1000, 8);
    expect(result.diagnostics?.droppedDates.includes("2024-01-02")).toBe(false);
  });

  it("benchmark series does not affect portfolio decisions", () => {
    const input = {
      config: buildConfig(),
      assets,
      assetSeries: [
        asSeries("AAA", [
          ["2024-01-01", 100],
          ["2024-01-02", 100],
          ["2024-01-03", 200],
          ["2024-01-04", 50]
        ]),
        asSeries("BBB", [
          ["2024-01-01", 100],
          ["2024-01-02", 100],
          ["2024-01-03", 100],
          ["2024-01-04", 100]
        ])
      ]
    };

    const withoutBenchmark = runBacktestEngine(input);
    const withBenchmark = runBacktestEngine({
      ...input,
      benchmarkSeries: asSeries("BMK", [
        ["2024-01-01", 10],
        ["2024-01-04", 3000]
      ])
    });

    expect(withoutBenchmark.trades).toHaveLength(withBenchmark.trades.length);
    expect(
      withoutBenchmark.trades.map((trade) => `${trade.date}-${trade.symbol}-${trade.side}-${trade.quantity.toFixed(6)}`)
    ).toEqual(
      withBenchmark.trades.map((trade) => `${trade.date}-${trade.symbol}-${trade.side}-${trade.quantity.toFixed(6)}`)
    );
  });

  it("keeps mixed-frequency history and rebalances monthly on month-end decision day", () => {
    const result = runBacktestEngine({
      config: buildConfig({
        rebalancing: { mode: "periodic", periodicFrequency: "monthly" }
      }),
      assets,
      assetSeries: [
        asSeries("AAA", [
          ["2024-01-31", 100],
          ["2024-02-29", 100],
          ["2024-03-07", 101],
          ["2024-03-14", 102],
          ["2024-03-15", 103],
          ["2024-03-18", 104]
        ]),
        asSeries("BBB", [
          ["2024-01-31", 100],
          ["2024-02-29", 90],
          ["2024-03-07", 95],
          ["2024-03-14", 100],
          ["2024-03-15", 100.5],
          ["2024-03-18", 101]
        ])
      ]
    });

    expect(result.timeseries.map((point) => point.date)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-07",
      "2024-03-14",
      "2024-03-15",
      "2024-03-18"
    ]);

    const periodicTrades = result.trades.filter((trade) => trade.reason === "periodic");
    expect(periodicTrades.length).toBeGreaterThan(0);
    expect(periodicTrades.some((trade) => trade.decisionDate === "2024-02-29" && trade.date === "2024-03-07")).toBe(
      true
    );
  });

  it("fees reduce portfolio value vs zero fees", () => {
    const series = [
      asSeries("AAA", [
        ["2024-01-01", 100],
        ["2024-01-02", 90],
        ["2024-01-03", 110],
        ["2024-01-04", 95]
      ]),
      asSeries("BBB", [
        ["2024-01-01", 100],
        ["2024-01-02", 110],
        ["2024-01-03", 90],
        ["2024-01-04", 105]
      ])
    ];

    const noFee = runBacktestEngine({
      config: buildConfig({ fees: { tradeFeePct: 0 } }),
      assets,
      assetSeries: series
    });

    const withFee = runBacktestEngine({
      config: buildConfig({ fees: { tradeFeePct: 0.5 } }),
      assets,
      assetSeries: series
    });

    expect(withFee.summary.totalFees).toBeGreaterThan(0);
    expect(withFee.timeseries[withFee.timeseries.length - 1].portfolioValue).toBeLessThan(
      noFee.timeseries[noFee.timeseries.length - 1].portfolioValue
    );
  });
});
