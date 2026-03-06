import OpenAI from "openai";

import { getServerSecrets } from "@/lib/env";
import { resolveInstrumentsBySearch } from "@/lib/instruments/resolve-instrument";
import {
  aiExtractedFiltersSchema,
  type AiExtractedFilters,
  type InstrumentTypeFilter
} from "@/lib/schemas/instrument-search";
import { createServiceRoleClient } from "@/lib/supabase/server";

type RpcSuggestionRow = {
  instrument_id: string;
  symbol: string;
  name: string;
  isin: string | null;
  type: string;
  exchange: string;
  currency: string;
  index_name: string | null;
  domicile: string | null;
  category: string | null;
  score: number;
};

type RpcMatchRow = {
  instrument_id: string;
  symbol: string;
  name: string;
  isin: string | null;
  type: string;
  index_name: string | null;
  domicile: string | null;
  category: string | null;
  similarity: number;
};

type SearchViewRow = {
  instrument_id: string;
  symbol: string;
  name: string;
  isin: string | null;
  type: string;
  exchange: string | null;
  currency: string | null;
  index_name: string | null;
  domicile: string | null;
  category: string | null;
  description: string | null;
};

type EodhdSearchItem = {
  Code?: string;
  Name?: string;
  Exchange?: string;
  Currency?: string;
  ISIN?: string;
  Country?: string;
  Type?: string;
};

export type SmartSuggestion = {
  instrumentId: string;
  symbol: string;
  name: string;
  isin: string | null;
  type: string;
  exchange: string | null;
  currency: string | null;
  indexName: string | null;
  domicile: string | null;
  description?: string | null;
  score: number;
  source: "db" | "eodhd";
};

export type SmartAiSearchResult = {
  query_it: string;
  query_en: string;
  interpretedQuery: string;
  filters: AiExtractedFilters;
  results: SmartSuggestion[];
  explanation: string[];
};

const FILTER_EXTRACTION_PROMPT = `You extract structured instrument search filters for ETF/stock screening.
Return JSON only.
No markdown.
No financial advice.

Output schema:
{
  "type": "etf" | "stock" | null,
  "keywords": string[],
  "index_contains": string | null,
  "country_exposure": [{"country": string, "min": number, "max": number}],
  "domicile": string | null,
  "currency": string | null,
  "accumulation": "accumulating" | "distributing" | null
}

Rules:
- country_exposure min/max are fractions in [0,1]. Example 10% => 0.10.
- keep keywords concise and technical.
- if unknown, set null or empty array.`;

const TRANSLATION_PROMPT = `Translate ETF screening queries from Italian to English.
Return JSON only with:
{
  "query_en": "..."
}
Keep finance terms precise and concise.`;

const SYNONYMS: Array<{
  from: string;
  to: string;
}> = [
  { from: "oro", to: "gold" },
  { from: "mondo", to: "world" },
  { from: "azioni", to: "equity" }
];

const EU_EXCHANGES = new Set(["LSE", "XETRA", "F", "PA", "MI", "AS", "BR", "SW", "MC", "BIT"]);

function normalizeType(type: string | null | undefined): InstrumentTypeFilter | undefined {
  if (!type) {
    return undefined;
  }

  const normalized = type.toLowerCase();
  if (normalized === "etf" || normalized === "stock") {
    return normalized;
  }

  return undefined;
}

function clampLimit(limit: number, max: number) {
  return Math.max(1, Math.min(limit, max));
}

function isTickerLike(query: string) {
  return /^[a-z0-9.\-]{1,20}$/i.test(query.trim());
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLikeTerm(value: string) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ");
}

function replaceWord(source: string, from: string, to: string) {
  const pattern = new RegExp(`\\b${escapeRegex(from)}\\b`, "gi");
  return source.replace(pattern, to);
}

function expandQueryVariants(query: string): string[] {
  const normalized = sanitizeText(query);
  const variants = new Set<string>();

  if (normalized) {
    variants.add(normalized);
  }

  for (const synonym of SYNONYMS) {
    if (new RegExp(`\\b${escapeRegex(synonym.from)}\\b`, "i").test(normalized)) {
      variants.add(sanitizeText(replaceWord(normalized, synonym.from, synonym.to)));
    }
  }

  return [...variants].filter(Boolean);
}

function buildSearchTerms(queries: string[]) {
  const terms = new Set<string>();

  for (const query of queries) {
    for (const token of normalizeLikeTerm(query).split(" ")) {
      if (token.length >= 3) {
        terms.add(token);
      }
    }
  }

  return [...terms].slice(0, 8);
}

function mergeSuggestions(items: SmartSuggestion[], limit: number): SmartSuggestion[] {
  const merged = new Map<string, SmartSuggestion>();

  for (const item of items) {
    const key = item.instrumentId || item.symbol;
    const existing = merged.get(key);

    if (!existing || item.score > existing.score) {
      merged.set(key, item);
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

async function fetchDbSuggestions(args: {
  query: string;
  type?: InstrumentTypeFilter;
  limit: number;
}): Promise<SmartSuggestion[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("suggest_instruments", {
    query_text: args.query,
    requested_type: args.type ?? null,
    limit_count: clampLimit(args.limit, 50)
  });

  if (error) {
    throw new Error(`suggest_instruments RPC failed: ${error.message}`);
  }

  return ((data ?? []) as RpcSuggestionRow[]).map((row) => ({
    instrumentId: row.instrument_id,
    symbol: row.symbol,
    name: row.name,
    isin: row.isin,
    type: row.type,
    exchange: row.exchange,
    currency: row.currency,
    indexName: row.index_name,
    domicile: row.domicile,
    description: null,
    score: Number(row.score ?? 0),
    source: "db"
  }));
}

async function fetchDbSuggestionsForQueries(args: {
  queries: string[];
  type?: InstrumentTypeFilter;
  limit: number;
}) {
  const all: SmartSuggestion[] = [];

  for (const query of args.queries) {
    if (query.trim().length < 2) {
      continue;
    }

    const rows = await fetchDbSuggestions({
      query,
      type: args.type,
      limit: clampLimit(args.limit, 50)
    });
    all.push(...rows);
  }

  return mergeSuggestions(all, args.limit);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function normalizeProviderSymbol(item: EodhdSearchItem): string | null {
  const code = item.Code?.trim();
  const exchange = item.Exchange?.trim();

  if (!code) {
    return null;
  }

  if (code.includes(".")) {
    return code;
  }

  if (!exchange) {
    return null;
  }

  return `${code}.${exchange}`;
}

async function fetchEodhdCandidates(args: {
  query: string;
  type?: InstrumentTypeFilter;
  limit: number;
}) {
  const { eodhdApiKey } = getServerSecrets();

  const url = new URL(`https://eodhd.com/api/search/${encodeURIComponent(args.query)}`);
  url.searchParams.set("api_token", eodhdApiKey);
  url.searchParams.set("fmt", "json");
  if (args.type) {
    url.searchParams.set("type", args.type);
  }

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`EODHD search failed (${response.status})`);
  }

  const payload = (await response.json()) as EodhdSearchItem[];
  return payload.slice(0, clampLimit(args.limit, 50));
}

async function indexEodhdCandidatesInline(args: {
  query: string;
  type?: InstrumentTypeFilter;
  limit: number;
}) {
  const admin = createServiceRoleClient();

  const candidates = await fetchEodhdCandidates({
    query: args.query,
    type: args.type,
    limit: args.limit
  });

  const upserts = candidates
    .map((item) => {
      const symbol = normalizeProviderSymbol(item);
      if (!symbol) {
        return null;
      }

      return {
        symbol,
        type: normalizeType(item.Type) ?? args.type ?? "stock",
        name: sanitizeText(item.Name ?? symbol),
        exchange: item.Exchange?.trim() || "US",
        currency: item.Currency?.trim() || "USD",
        isin: item.ISIN?.trim() || null,
        provider: "EODHD",
        provider_instrument_id: symbol,
        metadata: {
          countryCode: item.Country?.trim() || null,
          type: item.Type?.trim() || null
        }
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!upserts.length) {
    return;
  }

  await withTimeout(
    Promise.resolve(
      admin.from("instruments").upsert(upserts, {
        onConflict: "provider,symbol"
      })
    ),
    2500
  );
}

async function fetchEodhdFallback(args: {
  query: string;
  type?: InstrumentTypeFilter;
  locale?: string;
  limit: number;
}): Promise<SmartSuggestion[]> {
  const fallback = await resolveInstrumentsBySearch({
    query: args.query,
    locale: args.locale,
    dataProvider: "EODHD"
  });

  const candidates = [fallback.primary, ...fallback.alternatives].filter(
    (item): item is NonNullable<typeof item> => Boolean(item)
  );

  const filtered = candidates.filter((item) => {
    if (!args.type) {
      return true;
    }

    const providerType = normalizeType(item.type);
    return providerType ? providerType === args.type : true;
  });

  return filtered.slice(0, args.limit).map((item, index) => ({
    instrumentId: item.instrumentId ?? item.providerInstrumentId,
    symbol: item.symbol,
    name: item.name,
    isin: item.isin ?? null,
    type: normalizeType(item.type) ?? "stock",
    exchange: item.exchange,
    currency: item.currency,
    indexName: null,
    domicile: null,
    score: Math.max(1, 40 - index),
    source: "eodhd"
  }));
}

async function createQueryEmbedding(query: string): Promise<number[] | null> {
  const { openAiApiKey } = getServerSecrets();
  const client = new OpenAI({ apiKey: openAiApiKey });

  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    });

    return response.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

async function translateQueryToEnglish(query: string): Promise<string> {
  const fallback = expandQueryVariants(query).find((item) => item.toLowerCase() !== query.toLowerCase()) ?? query;
  const { openAiApiKey } = getServerSecrets();
  const client = new OpenAI({ apiKey: openAiApiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: TRANSLATION_PROMPT
        },
        {
          role: "user",
          content: query
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { query_en?: string };
    const translated = sanitizeText(parsed.query_en ?? "");

    return translated || fallback;
  } catch {
    return fallback;
  }
}

async function extractFiltersFromQuery(args: {
  query: string;
  requestedType?: InstrumentTypeFilter;
}): Promise<AiExtractedFilters> {
  const { openAiApiKey } = getServerSecrets();
  const client = new OpenAI({ apiKey: openAiApiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: FILTER_EXTRACTION_PROMPT
        },
        {
          role: "user",
          content: args.query
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = aiExtractedFiltersSchema.parse(JSON.parse(raw));

    return {
      ...parsed,
      type: parsed.type ?? args.requestedType ?? null
    };
  } catch {
    return {
      type: args.requestedType ?? null,
      keywords: [args.query],
      index_contains: null,
      country_exposure: [],
      domicile: null,
      currency: null,
      accumulation: null
    };
  }
}

async function fetchStructuredCandidates(args: {
  terms: string[];
  type?: InstrumentTypeFilter;
  limit: number;
}) {
  const admin = createServiceRoleClient();
  const normalizedTerms = args.terms.map(normalizeLikeTerm).filter((item) => item.length >= 3).slice(0, 6);

  let query = admin
    .from("instrument_search_view")
    .select("instrument_id,symbol,name,isin,type,exchange,currency,index_name,domicile,category,description")
    .limit(clampLimit(args.limit, 200));

  if (args.type) {
    query = query.eq("type", args.type);
  }

  if (normalizedTerms.length) {
    const filters = normalizedTerms.flatMap((term) => [
      `index_name.ilike.%${term}%`,
      `description.ilike.%${term}%`,
      `name.ilike.%${term}%`
    ]);

    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Structured instrument search failed: ${error.message}`);
  }

  return ((data ?? []) as SearchViewRow[]).map((row) => {
    const haystack = `${row.symbol} ${row.name} ${row.index_name ?? ""} ${row.description ?? ""}`.toLowerCase();
    const hits = normalizedTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);

    return {
      instrumentId: row.instrument_id,
      symbol: row.symbol,
      name: row.name,
      isin: row.isin,
      type: row.type,
      exchange: row.exchange,
      currency: row.currency,
      indexName: row.index_name,
      domicile: row.domicile,
      description: row.description,
      score: 30 + hits * 12,
      source: "db" as const
    };
  });
}

function buildInterpretedQuery(filters: AiExtractedFilters, queryEn: string) {
  const chunks = [
    filters.country_exposure[0]?.country ?? null,
    filters.index_contains ?? null,
    filters.keywords.find((item) => item.trim().length > 0) ?? null,
    queryEn
  ]
    .filter((item): item is string => Boolean(item && item.trim().length > 0))
    .map((item) => normalizeLikeTerm(item));

  const uniqueTokens = new Set<string>();
  chunks
    .join(" ")
    .split(" ")
    .filter((item) => item.length > 1)
    .forEach((token) => {
      uniqueTokens.add(token);
    });

  return sanitizeText([...uniqueTokens].slice(0, 4).join(" "));
}

function extractFallbackQueries(args: {
  queryIt: string;
  queryEn: string;
  filters: AiExtractedFilters;
}) {
  const bucket = new Set<string>();

  [args.queryIt, args.queryEn, args.filters.index_contains ?? ""].forEach((query) => {
    expandQueryVariants(query).forEach((variant) => {
      if (variant.length >= 2) {
        bucket.add(variant);
      }
    });
  });

  args.filters.keywords.forEach((keyword) => {
    expandQueryVariants(keyword).forEach((variant) => {
      if (variant.length >= 2) {
        bucket.add(variant);
      }
    });
  });

  args.filters.country_exposure.forEach((entry) => {
    const country = sanitizeText(entry.country);
    if (!country) {
      return;
    }
    bucket.add(country);
    bucket.add(`${country} etf`);
  });

  return [...bucket].slice(0, 12);
}

function prefersEuListing(query: string) {
  const normalized = normalizeLikeTerm(query);
  return (
    normalized.includes("europa") ||
    normalized.includes("europe") ||
    normalized.includes("european") ||
    normalized.includes("ue")
  );
}

function applyEuListingBoost(items: SmartSuggestion[], shouldBoost: boolean) {
  if (!shouldBoost) {
    return items;
  }

  return items
    .map((item) => ({
      ...item,
      score: item.score + (item.exchange && EU_EXCHANGES.has(item.exchange.toUpperCase()) ? 12 : 0)
    }))
    .sort((a, b) => b.score - a.score);
}

async function rerankWithEmbeddings(args: {
  base: SmartSuggestion[];
  queries: string[];
  type?: InstrumentTypeFilter;
  limit: number;
}) {
  const admin = createServiceRoleClient();
  const semanticScores = new Map<string, number>();

  for (const query of args.queries) {
    if (!query || isTickerLike(query)) {
      continue;
    }

    const embedding = await createQueryEmbedding(query);
    if (!embedding) {
      continue;
    }

    const { data } = await admin.rpc("match_instruments", {
      query_embedding: embedding,
      match_count: clampLimit(args.limit * 4, 100),
      filter_type: args.type ?? null
    });

    ((data ?? []) as RpcMatchRow[]).forEach((row) => {
      const score = Number(row.similarity ?? 0) * 100;
      const previous = semanticScores.get(row.instrument_id) ?? 0;
      semanticScores.set(row.instrument_id, Math.max(previous, score));
    });
  }

  return args.base
    .map((item) => {
      const semantic = semanticScores.get(item.instrumentId) ?? 0;
      return {
        ...item,
        score: item.score * 0.7 + semantic * 0.3
      };
    })
    .sort((a, b) => b.score - a.score);
}

export async function getInstrumentSuggestions(args: {
  query: string;
  type?: InstrumentTypeFilter;
  limit: number;
  locale?: string;
}): Promise<SmartSuggestion[]> {
  const queryVariants = expandQueryVariants(args.query);
  let dbResults = await fetchDbSuggestionsForQueries({
    queries: queryVariants,
    type: args.type,
    limit: clampLimit(args.limit * 3, 50)
  });

  if (dbResults.length < 5) {
    try {
      await indexEodhdCandidatesInline({
        query: queryVariants[0] ?? args.query,
        type: args.type,
        limit: 20
      });
      dbResults = await fetchDbSuggestionsForQueries({
        queries: queryVariants,
        type: args.type,
        limit: clampLimit(args.limit * 4, 60)
      });
    } catch {
      // Keep suggestions responsive even when provider indexing fails.
    }
  }

  let fallbackResults: SmartSuggestion[] = [];
  try {
    fallbackResults = await fetchEodhdFallback({
      ...args,
      query: queryVariants[0] ?? args.query
    });
  } catch {
    // Keep autocomplete operational even if provider fallback is temporarily unavailable.
  }

  return mergeSuggestions([...dbResults, ...fallbackResults], args.limit);
}

export async function runAiInstrumentSearch(args: {
  query: string;
  type?: InstrumentTypeFilter;
  limit: number;
}): Promise<SmartAiSearchResult> {
  const queryIt = sanitizeText(args.query);
  const queryEn = sanitizeText(await translateQueryToEnglish(queryIt));

  const filters = await extractFiltersFromQuery({
    query: `query_it: ${queryIt}\nquery_en: ${queryEn}`,
    requestedType: args.type
  });

  const queryVariants = [
    ...expandQueryVariants(queryIt),
    ...expandQueryVariants(queryEn),
    ...filters.keywords.flatMap((keyword) => expandQueryVariants(keyword))
  ];
  const dedupedQueries = [...new Set(queryVariants.filter((item) => item.length >= 2))];

  let initial = await fetchDbSuggestionsForQueries({
    queries: dedupedQueries,
    type: filters.type ?? args.type,
    limit: clampLimit(args.limit * 6, 100)
  });

  if (initial.length < 5) {
    try {
      await indexEodhdCandidatesInline({
        query: queryEn || queryIt,
        type: filters.type ?? args.type,
        limit: 20
      });
      const refreshed = await fetchDbSuggestionsForQueries({
        queries: dedupedQueries,
        type: filters.type ?? args.type,
        limit: clampLimit(args.limit * 7, 120)
      });
      initial = mergeSuggestions([...initial, ...refreshed], clampLimit(args.limit * 7, 200));
    } catch {
      // Continue with currently available candidates.
    }
  }

  const structuredCandidates = await fetchStructuredCandidates({
    terms: buildSearchTerms(dedupedQueries),
    type: filters.type ?? args.type,
    limit: clampLimit(args.limit * 6, 150)
  });

  let filtered = mergeSuggestions([...initial, ...structuredCandidates], clampLimit(args.limit * 8, 250));
  const explanations: string[] = [];
  const preFilterBaseline = [...filtered];

  if (filters.index_contains) {
    const needle = filters.index_contains.toLowerCase();
    filtered = filtered.filter((item) => {
      const indexName = (item.indexName ?? "").toLowerCase();
      const description = (item.description ?? "").toLowerCase();
      return indexName.includes(needle) || description.includes(needle);
    });
    explanations.push(`Filtro index_contains applicato: ${filters.index_contains}`);
  }

  if (filters.domicile) {
    const needle = filters.domicile.toLowerCase();
    filtered = filtered.filter((item) => (item.domicile ?? "").toLowerCase().includes(needle));
    explanations.push(`Filtro domicile applicato: ${filters.domicile}`);
  }

  if (filters.currency) {
    const target = filters.currency.toUpperCase();
    filtered = filtered.filter((item) => (item.currency ?? "").toUpperCase() === target);
    explanations.push(`Filtro currency applicato: ${target}`);
  }

  if (filters.country_exposure.length > 0) {
    const admin = createServiceRoleClient();
    let allowedIds: Set<string> | null = null;

    for (const exposure of filters.country_exposure) {
      const min = exposure.min ?? 0;
      const max = exposure.max ?? 1;

      const { data, error } = await admin
        .from("etf_country_weights")
        .select("instrument_id")
        .ilike("country", `%${exposure.country}%`)
        .gte("weight", min)
        .lte("weight", max)
        .limit(5000);

      if (error) {
        throw new Error(`Country exposure filter failed: ${error.message}`);
      }

      const currentIds = new Set<string>(
        (data ?? []).map((row: { instrument_id: string }) => row.instrument_id)
      );

      if (allowedIds === null) {
        allowedIds = currentIds;
      } else {
        const intersection = new Set<string>();
        allowedIds.forEach((id) => {
          if (currentIds.has(id)) {
            intersection.add(id);
          }
        });
        allowedIds = intersection;
      }
    }

    if (allowedIds) {
      const finalAllowedIds = allowedIds;
      filtered = filtered.filter((item) => finalAllowedIds.has(item.instrumentId));
    }

    explanations.push(`Filtro country_exposure applicato su ${filters.country_exposure.length} regole`);
  }

  if (!isTickerLike(queryIt) || !isTickerLike(queryEn)) {
    filtered = await rerankWithEmbeddings({
      base: filtered,
      queries: [queryIt, queryEn],
      type: filters.type ?? args.type,
      limit: args.limit
    });
    explanations.push("Rerank semantico applicato con embeddings");
  }

  if (filtered.length === 0) {
    try {
      const fallbackQueries = extractFallbackQueries({
        queryIt,
        queryEn,
        filters
      });

      const fallbackCandidates: SmartSuggestion[] = [];
      for (const query of fallbackQueries) {
        const entries = await fetchEodhdFallback({
          query,
          type: filters.type ?? args.type,
          limit: args.limit
        });
        fallbackCandidates.push(...entries);
      }

      filtered = mergeSuggestions([...filtered, ...fallbackCandidates], clampLimit(args.limit * 3, 120));
      explanations.push("Fallback provider EODHD applicato");
    } catch {
      // Keep empty results if provider fallback is unavailable.
    }
  }

  if (filtered.length === 0 && preFilterBaseline.length > 0) {
    filtered = preFilterBaseline.slice(0, args.limit);
    explanations.push("Fallback baseline applicato: filtri troppo restrittivi");
  }

  filtered = applyEuListingBoost(filtered, prefersEuListing(`${queryIt} ${queryEn}`));

  return {
    query_it: queryIt,
    query_en: queryEn,
    interpretedQuery: buildInterpretedQuery(filters, queryEn || queryIt),
    filters,
    results: filtered.slice(0, args.limit),
    explanation: explanations
  };
}
