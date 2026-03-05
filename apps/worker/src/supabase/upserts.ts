import { supabaseAdmin } from "./adminClient";

type JobStatus = "queued" | "running" | "success" | "failed";

type InstrumentRow = {
  id: string;
  symbol: string;
  type: "etf" | "stock";
  isin: string | null;
  name: string;
  exchange: string;
  currency: string;
  provider: "EODHD" | "YAHOO";
  provider_instrument_id: string;
};

type NameWeight = {
  name: string;
  value: number;
};

type PriceBar = {
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  adjClose?: number | null;
  volume?: number | null;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function startJobRun(args: {
  jobName: string;
  status: JobStatus;
  attempts: number;
  meta?: Record<string, unknown>;
}) {
  const payload = {
    job_name: args.jobName,
    status: args.status,
    attempts: args.attempts,
    started_at: new Date().toISOString(),
    meta: args.meta ?? {}
  };

  const { data, error } = await supabaseAdmin
    .from("ingest_job_runs")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to start ingest_job_run: ${error.message}`);
  }

  return data.id as string;
}

export async function finishJobRun(args: {
  id: string;
  status: Exclude<JobStatus, "queued" | "running">;
  error?: string;
  meta?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin
    .from("ingest_job_runs")
    .update({
      status: args.status,
      finished_at: new Date().toISOString(),
      error: args.error ?? null,
      meta: args.meta ?? {}
    })
    .eq("id", args.id);

  if (error) {
    throw new Error(`Failed to finish ingest_job_run: ${error.message}`);
  }
}

export async function setSyncState(key: string, value: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("ingest_sync_state").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "key"
    }
  );

  if (error) {
    throw new Error(`Failed to set ingest_sync_state (${key}): ${error.message}`);
  }
}

export async function getSyncState(key: string): Promise<{ key: string; value: Record<string, unknown> } | null> {
  const { data, error } = await supabaseAdmin
    .from("ingest_sync_state")
    .select("key,value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get ingest_sync_state (${key}): ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    key: data.key as string,
    value: (data.value as Record<string, unknown>) ?? {}
  };
}

export async function upsertInstruments(rows: Array<{
  symbol: string;
  type: "etf" | "stock";
  isin: string | null;
  name: string;
  exchange: string;
  currency: string;
  provider: "EODHD" | "YAHOO";
  providerInstrumentId: string;
  metadata?: Record<string, unknown>;
}>) {
  if (rows.length === 0) {
    return;
  }

  const chunks = chunkArray(rows, 500);

  for (const chunk of chunks) {
    const payload = chunk.map((row) => ({
      symbol: row.symbol,
      type: row.type,
      isin: row.isin,
      name: row.name,
      exchange: row.exchange,
      currency: row.currency,
      provider: row.provider,
      provider_instrument_id: row.providerInstrumentId,
      metadata: row.metadata ?? {}
    }));

    const { error } = await supabaseAdmin.from("instruments").upsert(payload, {
      onConflict: "provider,symbol"
    });

    if (error) {
      throw new Error(`Failed to upsert instruments: ${error.message}`);
    }
  }
}

export async function getInstrumentsBySymbols(symbols: string[]): Promise<InstrumentRow[]> {
  if (symbols.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("instruments")
    .select("id,symbol,type,isin,name,exchange,currency,provider,provider_instrument_id")
    .in("symbol", symbols);

  if (error) {
    throw new Error(`Failed to fetch instruments by symbols: ${error.message}`);
  }

  return (data ?? []) as InstrumentRow[];
}

export async function listInstruments(args: {
  type?: "etf" | "stock";
  provider?: "EODHD" | "YAHOO";
  limit: number;
  offset?: number;
}) {
  let query = supabaseAdmin
    .from("instruments")
    .select("id,symbol,type,isin,name,exchange,currency,provider,provider_instrument_id")
    .order("updated_at", { ascending: true })
    .limit(args.limit);

  if (args.type) {
    query = query.eq("type", args.type);
  }

  if (args.provider) {
    query = query.eq("provider", args.provider);
  }

  if (args.offset && args.offset > 0) {
    query = query.range(args.offset, args.offset + args.limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list instruments: ${error.message}`);
  }

  return (data ?? []) as InstrumentRow[];
}

export async function getEtfFundamentalsByInstrumentIds(instrumentIds: string[]) {
  if (instrumentIds.length === 0) {
    return [] as Array<{ instrument_id: string; updated_at_provider: string | null }>;
  }

  const { data, error } = await supabaseAdmin
    .from("etf_fundamentals")
    .select("instrument_id,updated_at_provider")
    .in("instrument_id", instrumentIds);

  if (error) {
    throw new Error(`Failed to fetch etf fundamentals metadata: ${error.message}`);
  }

  return data ?? [];
}

export async function upsertEtfFundamentals(args: {
  instrumentId: string;
  indexName: string | null;
  domicile: string | null;
  category: string | null;
  description: string | null;
  updatedAtProvider: string | null;
  raw: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("etf_fundamentals").upsert(
    {
      instrument_id: args.instrumentId,
      index_name: args.indexName,
      domicile: args.domicile,
      category: args.category,
      description: args.description,
      updated_at_provider: args.updatedAtProvider,
      raw: args.raw
    },
    {
      onConflict: "instrument_id"
    }
  );

  if (error) {
    throw new Error(`Failed to upsert etf_fundamentals: ${error.message}`);
  }
}

async function replaceWeights(args: {
  table: "etf_country_weights" | "etf_region_weights" | "etf_sector_weights";
  instrumentId: string;
  rows: NameWeight[];
}) {
  const { error: deleteError } = await supabaseAdmin
    .from(args.table)
    .delete()
    .eq("instrument_id", args.instrumentId);

  if (deleteError) {
    throw new Error(`Failed to clear ${args.table}: ${deleteError.message}`);
  }

  if (args.rows.length === 0) {
    return;
  }

  const payload = args.rows.map((row) => {
    if (args.table === "etf_country_weights") {
      return {
        instrument_id: args.instrumentId,
        country: row.name,
        weight: row.value
      };
    }

    if (args.table === "etf_region_weights") {
      return {
        instrument_id: args.instrumentId,
        region: row.name,
        equity_pct: row.value
      };
    }

    return {
      instrument_id: args.instrumentId,
      sector: row.name,
      equity_pct: row.value
    };
  });

  const { error: insertError } = await supabaseAdmin.from(args.table).insert(payload);
  if (insertError) {
    throw new Error(`Failed to insert ${args.table}: ${insertError.message}`);
  }
}

export async function replaceEtfWeights(args: {
  instrumentId: string;
  countryWeights: NameWeight[];
  regionWeights: NameWeight[];
  sectorWeights: NameWeight[];
}) {
  await replaceWeights({
    table: "etf_country_weights",
    instrumentId: args.instrumentId,
    rows: args.countryWeights
  });

  await replaceWeights({
    table: "etf_region_weights",
    instrumentId: args.instrumentId,
    rows: args.regionWeights
  });

  await replaceWeights({
    table: "etf_sector_weights",
    instrumentId: args.instrumentId,
    rows: args.sectorWeights
  });
}

export async function getEmbeddingRow(instrumentId: string) {
  const { data, error } = await supabaseAdmin
    .from("instrument_embeddings")
    .select("embedding_text,updated_at")
    .eq("instrument_id", instrumentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch embedding row: ${error.message}`);
  }

  return data;
}

export async function getEtfFundamentalsByInstrumentId(instrumentId: string) {
  const { data, error } = await supabaseAdmin
    .from("etf_fundamentals")
    .select("index_name,domicile,category,description")
    .eq("instrument_id", instrumentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch etf fundamentals row: ${error.message}`);
  }

  return data;
}

export async function getEtfWeightsByInstrumentId(instrumentId: string) {
  const [countries, regions, sectors] = await Promise.all([
    supabaseAdmin.from("etf_country_weights").select("country,weight").eq("instrument_id", instrumentId).limit(20),
    supabaseAdmin.from("etf_region_weights").select("region,equity_pct").eq("instrument_id", instrumentId).limit(20),
    supabaseAdmin.from("etf_sector_weights").select("sector,equity_pct").eq("instrument_id", instrumentId).limit(20)
  ]);

  if (countries.error) {
    throw new Error(`Failed to fetch country weights: ${countries.error.message}`);
  }

  if (regions.error) {
    throw new Error(`Failed to fetch region weights: ${regions.error.message}`);
  }

  if (sectors.error) {
    throw new Error(`Failed to fetch sector weights: ${sectors.error.message}`);
  }

  return {
    countryWeights: (countries.data ?? []).map((row) => ({
      name: row.country as string,
      value: Number(row.weight ?? 0)
    })),
    regionWeights: (regions.data ?? []).map((row) => ({
      name: row.region as string,
      value: Number(row.equity_pct ?? 0)
    })),
    sectorWeights: (sectors.data ?? []).map((row) => ({
      name: row.sector as string,
      value: Number(row.equity_pct ?? 0)
    }))
  };
}

export async function upsertEmbedding(args: {
  instrumentId: string;
  embedding: number[];
  embeddingText: string;
  model: string;
}) {
  const vectorLiteral = `[${args.embedding.join(",")}]`;

  const { error } = await supabaseAdmin.from("instrument_embeddings").upsert(
    {
      instrument_id: args.instrumentId,
      embedding: vectorLiteral,
      embedding_text: args.embeddingText,
      model: args.model,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "instrument_id"
    }
  );

  if (error) {
    throw new Error(`Failed to upsert instrument embedding: ${error.message}`);
  }
}

export async function getLatestPriceDate(instrumentId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("prices_daily")
    .select("date")
    .eq("instrument_id", instrumentId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch latest prices_daily date: ${error.message}`);
  }

  return data?.date ?? null;
}

export async function upsertPricesDaily(args: {
  instrumentId: string;
  provider: "EODHD" | "YAHOO";
  bars: PriceBar[];
}) {
  if (args.bars.length === 0) {
    return;
  }

  const chunks = chunkArray(args.bars, 1000);

  for (const chunk of chunks) {
    const payload = chunk.map((bar) => ({
      instrument_id: args.instrumentId,
      provider: args.provider,
      date: bar.date,
      open: bar.open ?? null,
      high: bar.high ?? null,
      low: bar.low ?? null,
      close: bar.close ?? null,
      adj_close: bar.adjClose ?? null,
      volume: bar.volume ?? null
    }));

    const { error } = await supabaseAdmin.from("prices_daily").upsert(payload, {
      onConflict: "instrument_id,date"
    });

    if (error) {
      throw new Error(`Failed to upsert prices_daily: ${error.message}`);
    }
  }
}
