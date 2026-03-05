import type { ProviderInstrument, ProviderPriceSeries } from "@/lib/market-data/types";

export interface MarketDataProvider {
  readonly name: "EODHD" | "YAHOO";
  searchInstruments(query: string, locale?: string): Promise<ProviderInstrument[]>;
  getDailyAdjustedClose(args: {
    instruments: ProviderInstrument[];
    startDate: string;
    endDate: string;
  }): Promise<ProviderPriceSeries[]>;
}
