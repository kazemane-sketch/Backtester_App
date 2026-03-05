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

function toProviderInstrument(row: {
  id: string;
  provider: string;
  provider_instrument_id: string;
  symbol: string;
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
    type: metadata.type
  };
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

  const { data: dbRows } = await supabase
    .from("instruments")
    .select("id,provider,provider_instrument_id,symbol,name,exchange,currency,isin,metadata")
    .eq("provider", providerName)
    .or(`symbol.ilike.${searchToken}%,name.ilike.%${searchToken}%,isin.eq.${searchToken}`)
    .limit(12);

  let candidates = (dbRows ?? []).map((row) => toProviderInstrument(row));

  if (!candidates.length) {
    const provider = getMarketDataProvider(providerName);
    const providerResults = await provider.searchInstruments(args.query, args.locale);

    candidates = providerResults;

    if (providerResults.length) {
      const upserts = providerResults.map((instrument) => ({
        provider: instrument.provider,
        provider_instrument_id: instrument.providerInstrumentId,
        symbol: instrument.symbol,
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

      candidates = providerResults.map((instrument) => ({
        ...instrument,
        instrumentId: idByProviderInstrumentId.get(instrument.providerInstrumentId)
      }));
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
