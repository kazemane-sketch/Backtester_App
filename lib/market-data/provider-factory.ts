import type { MarketDataProvider } from "@/lib/market-data/provider.interface";
import type { DataProvider } from "@/lib/market-data/types";
import { EodhdProvider } from "@/lib/market-data/providers/eodhd";
import { YahooProvider } from "@/lib/market-data/providers/yahoo";

const eodhdProvider = new EodhdProvider();
const yahooProvider = new YahooProvider();

export function getMarketDataProvider(provider: DataProvider): MarketDataProvider {
  if (provider === "YAHOO") {
    return yahooProvider;
  }

  return eodhdProvider;
}
