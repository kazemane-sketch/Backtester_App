import { workerEnv } from "../config";
import {
  buildEodEndpoint,
  buildExchangeSymbolListEndpoint,
  buildFundamentalsEndpoint,
  buildSearchEndpoint,
  EODHD_BASE_URL
} from "./endpoints";
import { EodhdRateLimiter } from "./rateLimit";

type SearchType = "etf" | "stock";

export type EodhdSearchItem = {
  Code?: string;
  Name?: string;
  Exchange?: string;
  Currency?: string;
  ISIN?: string;
  Country?: string;
  Type?: string;
};

export type EodhdExchangeSymbol = {
  Code?: string;
  Name?: string;
  Country?: string;
  Exchange?: string;
  Currency?: string;
  Type?: string;
  Isin?: string;
};

export type EodhdEodBar = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  adjusted_close?: number;
  volume?: number;
};

export class EodhdClient {
  private readonly limiter = new EodhdRateLimiter(250);

  private async fetchJson<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const url = new URL(`${EODHD_BASE_URL}${path}`);
    url.searchParams.set("api_token", workerEnv.EODHD_API_KEY);
    url.searchParams.set("fmt", "json");

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    return this.limiter.schedule(async () => {
      const response = await fetch(url.toString(), {
        headers: {
          accept: "application/json"
        }
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`EODHD request failed (${response.status}) for ${path}: ${body}`);
      }

      return (await response.json()) as T;
    });
  }

  async searchInstruments(query: string, type?: SearchType) {
    return this.fetchJson<EodhdSearchItem[]>(buildSearchEndpoint(query), {
      type
    });
  }

  async getFundamentals(symbol: string) {
    return this.fetchJson<Record<string, unknown>>(buildFundamentalsEndpoint(symbol));
  }

  async getDailyHistory(symbol: string, from?: string, to?: string) {
    return this.fetchJson<EodhdEodBar[]>(buildEodEndpoint(symbol), {
      period: "d",
      from,
      to
    });
  }

  async getExchangeSymbols(exchange: string, type?: "etf" | "stock") {
    return this.fetchJson<EodhdExchangeSymbol[]>(
      buildExchangeSymbolListEndpoint(exchange),
      { type }
    );
  }
}

export const eodhdClient = new EodhdClient();
