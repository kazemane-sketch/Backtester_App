import { addDays } from "date-fns";

import { getServerSecrets } from "@/lib/env";
import type { MarketDataProvider } from "@/lib/market-data/provider.interface";
import type { ProviderInstrument, ProviderPriceSeries } from "@/lib/market-data/types";

type EodSearchResult = {
  Code?: string;
  Name?: string;
  Exchange?: string;
  Currency?: string;
  ISIN?: string;
  Country?: string;
  Type?: string;
};

type EodHistoryRow = {
  date: string;
  adjusted_close?: number;
  close?: number;
};

function normalizeProviderInstrument(entry: EodSearchResult): ProviderInstrument | null {
  const symbol = entry.Code?.trim();
  const exchange = entry.Exchange?.trim();

  if (!symbol || !exchange) {
    return null;
  }

  const providerInstrumentId = `${symbol}.${exchange}`;

  return {
    provider: "EODHD",
    providerInstrumentId,
    symbol: providerInstrumentId,
    name: entry.Name?.trim() || symbol,
    exchange,
    currency: entry.Currency?.trim() || "USD",
    isin: entry.ISIN?.trim() || undefined,
    countryCode: entry.Country?.trim() || undefined,
    type: entry.Type?.trim() || undefined
  };
}

export class EodhdProvider implements MarketDataProvider {
  readonly name = "EODHD" as const;

  private readonly baseUrl = "https://eodhd.com/api";

  private get apiKey() {
    return getServerSecrets().eodhdApiKey;
  }

  async searchInstruments(query: string): Promise<ProviderInstrument[]> {
    const url = new URL(`${this.baseUrl}/search/${encodeURIComponent(query)}`);
    url.searchParams.set("api_token", this.apiKey);
    url.searchParams.set("fmt", "json");

    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json"
      },
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      throw new Error(`EODHD search failed with status ${response.status}`);
    }

    const payload = (await response.json()) as EodSearchResult[];

    return payload.map(normalizeProviderInstrument).filter((item): item is ProviderInstrument => Boolean(item));
  }

  async getDailyPrices(args: {
    instruments: ProviderInstrument[];
    startDate: string;
    endDate: string;
  }): Promise<ProviderPriceSeries[]> {
    const requests = args.instruments.map(async (instrument) => {
      const url = new URL(`${this.baseUrl}/eod/${instrument.providerInstrumentId}`);
      url.searchParams.set("api_token", this.apiKey);
      url.searchParams.set("fmt", "json");
      url.searchParams.set("period", "d");
      url.searchParams.set("from", args.startDate);
      // Include end date by requesting next day boundary.
      url.searchParams.set("to", addDays(new Date(args.endDate), 1).toISOString().slice(0, 10));

      const response = await fetch(url.toString(), {
        headers: {
          accept: "application/json"
        },
        next: { revalidate: 60 * 60 * 12 }
      });

      if (!response.ok) {
        // Check for plain-text rate limit response
        const body = await response.text();
        const isRateLimit = body.toLowerCase().includes("exceeded") || body.toLowerCase().includes("limit");

        if (response.status === 402 || response.status === 429 || isRateLimit) {
          throw new Error(
            `EODHD daily API limit reached. Try again tomorrow or upgrade your EODHD plan at eodhistoricaldata.com`
          );
        }

        if (response.status === 403) {
          throw new Error(
            `EODHD access denied for ${instrument.providerInstrumentId}. ` +
              "The exchange may not be included in your plan. " +
              "Try a different listing (e.g. .LSE or .XETRA) or upgrade your subscription."
          );
        }

        throw new Error(
          `EODHD history failed for ${instrument.providerInstrumentId} with status ${response.status}`
        );
      }

      const rows = (await response.json()) as EodHistoryRow[];
      return {
        providerInstrumentId: instrument.providerInstrumentId,
        symbol: instrument.symbol,
        currency: instrument.currency,
        points: rows
          .map((row) => ({
            date: row.date,
            close: row.close ?? NaN,
            adjustedClose: row.adjusted_close ?? row.close ?? NaN
          }))
          .filter((point) => Number.isFinite(point.adjustedClose) && Number.isFinite(point.close))
      };
    });

    return Promise.all(requests);
  }
}
