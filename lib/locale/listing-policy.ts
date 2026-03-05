import type { ProviderInstrument } from "@/lib/market-data/types";

const EU_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE"
]);

const MAJOR_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
  "NYSE ARCA",
  "XETRA",
  "LSE",
  "EURONEXT",
  "TSX",
  "SIX",
  "BME",
  "FWB"
]);

function inferCountryFromLocale(locale?: string): string | null {
  if (!locale) {
    return null;
  }

  const normalized = locale.replace("_", "-");
  const parts = normalized.split("-");
  if (parts.length < 2) {
    return null;
  }

  return parts[1]?.toUpperCase() ?? null;
}

export function isEuLocale(locale?: string): boolean {
  const country = inferCountryFromLocale(locale);
  return country ? EU_COUNTRY_CODES.has(country) : false;
}

function exchangeScore(exchange: string): number {
  const upper = exchange.toUpperCase();
  if (MAJOR_EXCHANGES.has(upper)) {
    return 3;
  }

  if (upper.includes("NASDAQ") || upper.includes("NYSE") || upper.includes("XETRA")) {
    return 2;
  }

  return 1;
}

export function choosePrimaryListing(instruments: ProviderInstrument[], locale?: string): ProviderInstrument | null {
  if (!instruments.length) {
    return null;
  }

  if (isEuLocale(locale)) {
    const eurCandidate = instruments
      .filter((instrument) => instrument.currency.toUpperCase() === "EUR")
      .sort((a, b) => exchangeScore(b.exchange) - exchangeScore(a.exchange))[0];

    if (eurCandidate) {
      return eurCandidate;
    }
  }

  const major = instruments.sort((a, b) => exchangeScore(b.exchange) - exchangeScore(a.exchange))[0];
  return major ?? instruments[0];
}
