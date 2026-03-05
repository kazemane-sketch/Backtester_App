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
  score: number;
  source: "db" | "eodhd";
};

export type SmartAiSearchResult = {
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
    score: Number(row.score ?? 0),
    source: "db"
  }));
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

export async function getInstrumentSuggestions(args: {
  query: string;
  type?: InstrumentTypeFilter;
  limit: number;
  locale?: string;
}): Promise<SmartSuggestion[]> {
  const dbResults = await fetchDbSuggestions(args);

  if (dbResults.length >= args.limit) {
    return dbResults.slice(0, args.limit);
  }

  let fallbackResults: SmartSuggestion[] = [];
  try {
    fallbackResults = await fetchEodhdFallback(args);
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
  const filters = await extractFiltersFromQuery({
    query: args.query,
    requestedType: args.type
  });

  const keywordQuery = filters.keywords.join(" ").trim() || args.query;
  const initial = await fetchDbSuggestions({
    query: keywordQuery,
    type: filters.type ?? args.type,
    limit: clampLimit(args.limit * 5, 100)
  });

  let filtered = initial;
  const explanations: string[] = [];

  if (filters.index_contains) {
    const needle = filters.index_contains.toLowerCase();
    filtered = filtered.filter((item) => (item.indexName ?? "").toLowerCase().includes(needle));
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

  if (!isTickerLike(args.query)) {
    const queryEmbedding = await createQueryEmbedding(args.query);

    if (queryEmbedding) {
      const admin = createServiceRoleClient();
      const { data } = await admin.rpc("match_instruments", {
        query_embedding: queryEmbedding,
        match_count: clampLimit(args.limit * 3, 100),
        filter_type: filters.type ?? args.type ?? null
      });

      const semanticScores = new Map<string, number>();
      ((data ?? []) as RpcMatchRow[]).forEach((row) => {
        semanticScores.set(row.instrument_id, Number(row.similarity ?? 0) * 100);
      });

      filtered = filtered
        .map((item) => {
          const semantic = semanticScores.get(item.instrumentId) ?? 0;
          return {
            ...item,
            score: item.score * 0.7 + semantic * 0.3
          };
        })
        .sort((a, b) => b.score - a.score);

      explanations.push("Rerank semantico applicato con embeddings");
    }
  }

  return {
    filters,
    results: filtered.slice(0, args.limit),
    explanation: explanations
  };
}
