import { describe, expect, it } from "vitest";

import {
  buildEmbeddingText,
  hasEmbeddingTextChanged,
  parseFundamentalsPayload
} from "../../apps/worker/src/supabase/parsers";

describe("worker fundamentals parsers", () => {
  it("parses country/region/sector weights from fundamentals payload", () => {
    const parsed = parseFundamentalsPayload({
      UpdatedAt: "2026-01-10",
      General: {
        Description: "MSCI World ETF"
      },
      ETF_Data: {
        Index_Name: "MSCI World",
        Domicile: "Ireland",
        Category: "Equity",
        World_Regions: {
          North_America: 65,
          Europe: 25
        },
        Sector_Weights: {
          Technology: 22,
          Financials: 16
        },
        Holdings: {
          AAPL: { Country: "United States", "Assets_%": 4.5 },
          NOVN: { Country: "Switzerland", "Assets_%": 1.2 }
        }
      }
    });

    expect(parsed.indexName).toBe("MSCI World");
    expect(parsed.domicile).toBe("Ireland");
    expect(parsed.category).toBe("Equity");
    expect(parsed.regionWeights[0].name).toBe("North_America");
    expect(parsed.regionWeights[0].value).toBeCloseTo(0.65, 8);
    expect(parsed.sectorWeights[0].name).toBe("Technology");
    expect(parsed.sectorWeights[0].value).toBeCloseTo(0.22, 8);
    expect(parsed.countryWeights.some((row) => row.name === "United States")).toBe(true);
  });

  it("detects embedding text changes by hash", () => {
    const previous = buildEmbeddingText({
      type: "etf",
      symbol: "SWDA.LSE",
      isin: "IE00B4L5Y983",
      name: "iShares Core MSCI World",
      indexName: "MSCI World",
      category: "Equity",
      domicile: "Ireland",
      description: "Core world equity",
      countryWeights: [{ name: "United States", value: 0.65 }],
      regionWeights: [{ name: "North America", value: 0.7 }],
      sectorWeights: [{ name: "Technology", value: 0.2 }]
    });

    const unchanged = buildEmbeddingText({
      type: "etf",
      symbol: "SWDA.LSE",
      isin: "IE00B4L5Y983",
      name: "iShares Core MSCI World",
      indexName: "MSCI World",
      category: "Equity",
      domicile: "Ireland",
      description: "Core world equity",
      countryWeights: [{ name: "United States", value: 0.65 }],
      regionWeights: [{ name: "North America", value: 0.7 }],
      sectorWeights: [{ name: "Technology", value: 0.2 }]
    });

    const changed = buildEmbeddingText({
      type: "etf",
      symbol: "SWDA.LSE",
      isin: "IE00B4L5Y983",
      name: "iShares Core MSCI World UCITS",
      indexName: "MSCI World",
      category: "Equity",
      domicile: "Ireland",
      description: "Core world equity",
      countryWeights: [{ name: "United States", value: 0.65 }],
      regionWeights: [{ name: "North America", value: 0.7 }],
      sectorWeights: [{ name: "Technology", value: 0.2 }]
    });

    expect(hasEmbeddingTextChanged(previous, unchanged)).toBe(false);
    expect(hasEmbeddingTextChanged(previous, changed)).toBe(true);
  });
});
