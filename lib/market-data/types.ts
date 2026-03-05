export type DataProvider = "EODHD" | "YAHOO";

export type ProviderInstrument = {
  provider: DataProvider;
  providerInstrumentId: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  isin?: string;
  countryCode?: string;
  type?: string;
};

export type ProviderPricePoint = {
  date: string;
  adjustedClose: number;
};

export type ProviderPriceSeries = {
  providerInstrumentId: string;
  symbol: string;
  currency: string;
  points: ProviderPricePoint[];
};
