import type { MarketDataProvider } from "@/lib/market-data/provider.interface";
import type { ProviderInstrument, ProviderPriceSeries } from "@/lib/market-data/types";

export class YahooProvider implements MarketDataProvider {
  readonly name = "YAHOO" as const;

  async searchInstruments(query: string): Promise<ProviderInstrument[]> {
    throw new Error(
      `Yahoo provider is disabled in this MVP build. Query "${query}" must be run with EODHD.`
    );
  }

  async getDailyAdjustedClose(args: {
    instruments: ProviderInstrument[];
    startDate: string;
    endDate: string;
  }): Promise<ProviderPriceSeries[]> {
    void args;
    throw new Error("Yahoo provider is disabled in this MVP build. Use EODHD.");
  }
}
