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

/**
 * Map EODHD search exchange names → EODHD API exchange codes.
 *
 * The /search/ endpoint sometimes returns full exchange names like
 * "NYSE ARCA", "NASDAQ", "BATS" but the /eod/ price endpoint expects
 * the short code ("US" for all US exchanges, "LSE" for London, etc.).
 *
 * Source: https://eodhd.com/api/exchanges-list/
 */
const EXCHANGE_NAME_TO_CODE: Record<string, string> = {
  // US exchanges → all map to "US"
  "NYSE ARCA": "US",
  "NYSE": "US",
  "NASDAQ": "US",
  "BATS": "US",
  "AMEX": "US",
  "NYSE MKT": "US",
  "PINK": "US",
  "OTC": "US",
  "NMFQS": "US",
  "US": "US",
  // UK
  "LSE": "LSE",
  "LONDON": "LSE",
  // Germany
  "XETRA": "XETRA",
  "F": "F",
  "FRANKFURT": "F",
  "BE": "BE",
  "HM": "HM",
  "DU": "DU",
  "MU": "MU",
  "STU": "STU",
  "HA": "HA",
  // France / Benelux / Portugal
  "PA": "PA",
  "PARIS": "PA",
  "BR": "BR",
  "BRUSSELS": "BR",
  "LS": "LS",
  "LISBON": "LS",
  "AS": "AS",
  "AMSTERDAM": "AS",
  // Switzerland
  "SW": "SW",
  "SIX": "SW",
  // Southern Europe
  "MI": "MI",
  "MILAN": "MI",
  "MC": "MC",
  "MADRID": "MC",
  // Nordics
  "ST": "ST",
  "OL": "OL",
  "HE": "HE",
  "CO": "CO",
  // Ireland / Austria
  "IR": "IR",
  "VI": "VI",
  // Asia-Pacific
  "TO": "TO",
  "V": "V",
  "AU": "AU",
  "HK": "HK",
  "SG": "SG",
  "TSE": "TSE",
  // Latin America
  "SA": "SA",
  "MX": "MX",
  "SN": "SN"
};

/**
 * Normalize an exchange name/code to the EODHD API exchange code.
 * If no mapping is found, returns the original (it might already be correct).
 */
export function normalizeEodhdExchange(exchange: string): string {
  const upper = exchange.toUpperCase().trim();
  return EXCHANGE_NAME_TO_CODE[upper] ?? exchange;
}

function normalizeProviderInstrument(entry: EodSearchResult): ProviderInstrument | null {
  const symbol = entry.Code?.trim();
  const rawExchange = entry.Exchange?.trim();

  if (!symbol || !rawExchange) {
    return null;
  }

  const exchange = normalizeEodhdExchange(rawExchange);
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
      // Normalize the providerInstrumentId in case the DB has a stale
      // exchange name (e.g. "IWM.NYSE ARCA" → "IWM.US")
      const dotIdx = instrument.providerInstrumentId.indexOf(".");
      const normalizedId = dotIdx > 0
        ? `${instrument.providerInstrumentId.substring(0, dotIdx)}.${normalizeEodhdExchange(instrument.providerInstrumentId.substring(dotIdx + 1))}`
        : instrument.providerInstrumentId;

      const url = new URL(`${this.baseUrl}/eod/${normalizedId}`);
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
