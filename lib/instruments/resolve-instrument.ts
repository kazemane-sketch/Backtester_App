import { memoryCache } from "@/lib/cache/memory-cache";
import { choosePrimaryListing } from "@/lib/locale/listing-policy";
import { getMarketDataProvider } from "@/lib/market-data/provider-factory";
import type { DataProvider, ProviderInstrument } from "@/lib/market-data/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

const SEARCH_TTL = 1000 * 60 * 10;

type SearchResult = {
  primary: ProviderInstrument | null;
  alternatives: ProviderInstrument[];
};

function normalizeInstrumentType(type: string | undefined) {
  if (!type) {
    return "stock";
  }

  return type.toLowerCase() === "etf" ? "etf" : "stock";
}

function toProviderInstrument(row: {
  id: string;
  provider: string;
  provider_instrument_id: string;
  symbol: string;
  type: string;
  name: string;
  exchange: string;
  currency: string;
  isin: string | null;
  metadata: unknown;
}): ProviderInstrument {
  const metadata = typeof row.metadata === "object" && row.metadata ? (row.metadata as Record<string, string>) : {};

  return {
    instrumentId: row.id,
    provider: row.provider as DataProvider,
    providerInstrumentId: row.provider_instrument_id,
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    isin: row.isin ?? undefined,
    countryCode: metadata.countryCode,
    type: row.type ?? metadata.type
  };
}

/**
 * Parse a query that might be "TICKER.EXCHANGE" format.
 * Returns the base ticker for fallback search when exact match fails.
 */
function parseTickerQuery(query: string): { baseTicker: string; exchange: string | null } {
  const dotIdx = query.indexOf(".");
  if (dotIdx > 0 && dotIdx < query.length - 1) {
    return {
      baseTicker: query.substring(0, dotIdx),
      exchange: query.substring(dotIdx + 1)
    };
  }
  return { baseTicker: query, exchange: null };
}

/**
 * Search EODHD and upsert results into the DB, returning enriched candidates.
 */
async function searchAndUpsert(
  query: string,
  providerName: DataProvider,
  locale: string | undefined
): Promise<ProviderInstrument[]> {
  const provider = getMarketDataProvider(providerName);
  let providerResults: ProviderInstrument[];
  try {
    providerResults = await provider.searchInstruments(query, locale);
  } catch {
    // If EODHD search fails (402, network, etc.), return empty rather than crashing
    return [];
  }

  if (!providerResults.length) return [];

  const supabase = createServiceRoleClient();
  const upserts = providerResults.map((instrument) => ({
    provider: instrument.provider,
    provider_instrument_id: instrument.providerInstrumentId,
    symbol: instrument.providerInstrumentId,
    type: normalizeInstrumentType(instrument.type),
    isin: instrument.isin ?? null,
    name: instrument.name,
    exchange: instrument.exchange,
    currency: instrument.currency,
    metadata: {
      countryCode: instrument.countryCode ?? null,
      type: instrument.type ?? null
    }
  }));

  await supabase.from("instruments").upsert(upserts, {
    onConflict: "provider,provider_instrument_id"
  });

  const providerInstrumentIds = providerResults.map((instrument) => instrument.providerInstrumentId);
  const { data: instrumentRows } = await supabase
    .from("instruments")
    .select("id,provider_instrument_id")
    .eq("provider", providerName)
    .in("provider_instrument_id", providerInstrumentIds);

  const idByProviderInstrumentId = new Map(
    (instrumentRows ?? []).map((row) => [row.provider_instrument_id, row.id])
  );

  return providerResults.map((instrument) => ({
    ...instrument,
    instrumentId: idByProviderInstrumentId.get(instrument.providerInstrumentId)
  }));
}

export async function resolveInstrumentsBySearch(args: {
  query: string;
  locale?: string;
  dataProvider?: DataProvider;
}): Promise<SearchResult> {
  const providerName = args.dataProvider ?? "EODHD";
  const normalizedQuery = args.query.trim().toLowerCase();
  const safeQuery = normalizedQuery.replace(/[,%()]/g, " ").trim();
  const searchToken = safeQuery || normalizedQuery;
  const cacheKey = `instrument:search:${providerName}:${args.locale ?? "na"}:${normalizedQuery}`;
  const cached = memoryCache.get<SearchResult>(cacheKey);

  if (cached) {
    return cached;
  }

  const supabase = createServiceRoleClient();

  // ── Step 1: DB lookup (exact symbol / name / ISIN) ──────────────────
  const { data: dbRows } = await supabase
    .from("instruments")
    .select("id,provider,provider_instrument_id,symbol,type,name,exchange,currency,isin,metadata")
    .eq("provider", providerName)
    .or(`symbol.ilike.${searchToken}%,name.ilike.%${searchToken}%,isin.eq.${searchToken}`)
    .limit(12);

  let candidates = (dbRows ?? []).map((row) => toProviderInstrument(row));

  // ── Step 2: If DB has nothing, search the provider API ──────────────
  if (!candidates.length) {
    candidates = await searchAndUpsert(args.query, providerName, args.locale);
  }

  // ── Step 3: Fuzzy fallback for AI-generated tickers ─────────────────
  // If the query is "TICKER.EXCHANGE" (e.g. "AGGH.LSE") and still no
  // results, retry with just the base ticker. This handles cases where
  // the AI hallucinates a ticker+exchange that doesn't exist on EODHD
  // (e.g. AGGH.LSE → search "AGGH" finds AGGH.AS, AGGU.LSE, etc.)
  if (!candidates.length) {
    const { baseTicker, exchange } = parseTickerQuery(args.query);
    if (exchange) {
      // First try DB with just the base ticker
      const { data: fallbackDbRows } = await supabase
        .from("instruments")
        .select("id,provider,provider_instrument_id,symbol,type,name,exchange,currency,isin,metadata")
        .eq("provider", providerName)
        .ilike("symbol", `${baseTicker.toLowerCase()}%`)
        .limit(20);

      candidates = (fallbackDbRows ?? []).map((row) => toProviderInstrument(row));

      // If DB still empty, search EODHD with the base ticker
      if (!candidates.length) {
        candidates = await searchAndUpsert(baseTicker, providerName, args.locale);
      }
    }
  }

  const primary = choosePrimaryListing([...candidates], args.locale);
  const alternatives = primary
    ? candidates.filter(
        (instrument) => instrument.providerInstrumentId !== primary.providerInstrumentId
      )
    : candidates;

  const result = {
    primary,
    alternatives
  };

  memoryCache.set(cacheKey, result, SEARCH_TTL);

  return result;
}
