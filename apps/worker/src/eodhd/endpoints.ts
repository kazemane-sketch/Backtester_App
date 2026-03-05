export const EODHD_BASE_URL = "https://eodhd.com/api";

export function buildSearchEndpoint(query: string) {
  return `/search/${encodeURIComponent(query)}`;
}

export function buildFundamentalsEndpoint(symbol: string) {
  return `/fundamentals/${encodeURIComponent(symbol)}`;
}

export function buildEodEndpoint(symbol: string) {
  return `/eod/${encodeURIComponent(symbol)}`;
}
