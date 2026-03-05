import { describe, expect, it } from "vitest";

import { backtestConfigSchema } from "@/lib/schemas/backtest-config";

describe("backtestConfigSchema", () => {
  const validConfig = {
    name: "Balanced Portfolio",
    startDate: "2020-01-01",
    endDate: "2025-01-01",
    initialCapital: 10000,
    assets: [
      { query: "SPY", weight: 60 },
      { query: "AGG", weight: 40 }
    ],
    rebalancing: {
      mode: "periodic",
      periodicFrequency: "quarterly"
    },
    fees: {
      tradeFeePct: 0.1
    },
    priceField: "adjClose",
    benchmark: {
      query: "ACWI"
    },
    dataProvider: "EODHD"
  };

  it("accepts a valid configuration", () => {
    const parsed = backtestConfigSchema.parse(validConfig);
    expect(parsed.name).toBe("Balanced Portfolio");
  });

  it("rejects invalid weights sum", () => {
    const result = backtestConfigSchema.safeParse({
      ...validConfig,
      assets: [
        { query: "SPY", weight: 70 },
        { query: "AGG", weight: 20 }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("accepts instrumentId-based assets", () => {
    const result = backtestConfigSchema.safeParse({
      ...validConfig,
      assets: [
        {
          instrumentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          weight: 100
        }
      ],
      benchmark: {
        instrumentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects fee outside range", () => {
    const result = backtestConfigSchema.safeParse({
      ...validConfig,
      fees: {
        tradeFeePct: 8
      }
    });

    expect(result.success).toBe(false);
  });

  it("rejects date ranges longer than 20 years", () => {
    const result = backtestConfigSchema.safeParse({
      ...validConfig,
      startDate: "1990-01-01",
      endDate: "2025-01-01"
    });

    expect(result.success).toBe(false);
  });
});
