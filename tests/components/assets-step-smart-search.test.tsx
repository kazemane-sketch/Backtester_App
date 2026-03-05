import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssetsStep } from "@/components/backtests/steps-assets";
import type { BacktestConfig } from "@/lib/schemas/backtest-config";

function TestHarness({
  onConfigChange
}: {
  onConfigChange?: (next: BacktestConfig) => void;
}) {
  const [config, setConfig] = useState<BacktestConfig>({
    name: "Test",
    startDate: "2020-01-01",
    endDate: "2024-12-31",
    initialCapital: 10000,
    assets: [{ query: "", weight: 100 }],
    rebalancing: { mode: "none" },
    fees: { tradeFeePct: 0.1 },
    priceField: "adjClose",
    benchmark: { query: "SPY" },
    dataProvider: "EODHD"
  });

  return (
    <AssetsStep
      config={config}
      onChange={(next) => {
        setConfig(next);
        onConfigChange?.(next);
      }}
    />
  );
}

describe("AssetsStep smart search UX", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl.includes("/api/instruments/suggest")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (requestUrl.includes("/api/instruments/ai-search")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            query_it: "indice con india",
            query_en: "index with india",
            interpretedQuery: "india index",
            filters: {
              type: "etf",
              keywords: ["india index"],
              index_contains: "India",
              country_exposure: [{ country: "India", min: 0.08, max: 0.12 }]
            },
            results: [
              {
                instrumentId: "etf-1",
                symbol: "INDA.US",
                name: "iShares MSCI India ETF",
                isin: null,
                type: "etf",
                exchange: "NASDAQ",
                currency: "USD",
                indexName: "MSCI India",
                domicile: "US",
                score: 98,
                source: "db"
              }
            ],
            explanation: ["Filtro country_exposure applicato su 1 regole"]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      return new Response(JSON.stringify({ error: "unexpected request" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it("triggers AI search on Enter and renders italian semantic results", async () => {
    const onConfigChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TestHarness onConfigChange={onConfigChange} />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("es. VWCE, iShares Core MSCI World...");

    await user.type(input, "indice con india");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/instruments/ai-search",
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    expect(
      await screen.findByText((value) => value.toLowerCase().includes("ishares msci india etf"))
    ).toBeInTheDocument();
    expect(screen.getByText("Interpreted query")).toBeInTheDocument();
    expect(screen.getByText("india index")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Seleziona" }));

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        assets: [expect.objectContaining({ resolvedInstrumentId: "etf-1", query: "INDA.US" })]
      })
    );
  });
});
