import { NextResponse } from "next/server";

import { createBacktestRun, markRunFailed, saveBacktestResult } from "@/lib/backtest/persistence";
import { runBacktestEngine } from "@/lib/backtest/engine";
import { resolveInstrumentsBySearch } from "@/lib/instruments/resolve-instrument";
import { getMarketDataProvider } from "@/lib/market-data/provider-factory";
import type { ProviderInstrument } from "@/lib/market-data/types";
import { runBacktestPayloadSchema } from "@/lib/schemas/backtest-config";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

type DbInstrument = {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  provider: "EODHD" | "YAHOO";
  provider_instrument_id: string;
  isin: string | null;
  metadata: unknown;
};

function normalizeInstrumentType(type: string | undefined) {
  if (!type) {
    return "stock";
  }

  return type.toLowerCase() === "etf" ? "etf" : "stock";
}

function dbInstrumentToProviderInstrument(instrument: DbInstrument): ProviderInstrument {
  return {
    instrumentId: instrument.id,
    provider: instrument.provider,
    providerInstrumentId: instrument.provider_instrument_id,
    symbol: instrument.symbol,
    name: instrument.name,
    exchange: instrument.exchange,
    currency: instrument.currency,
    isin: instrument.isin ?? undefined,
    countryCode: undefined
  };
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = runBacktestPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { config } = parsed.data;
  const provider = getMarketDataProvider(config.dataProvider);
  const admin = createServiceRoleClient();
  let runId: string | null = null;

  /* Dev bypass: use a deterministic UUID when no user session */
  const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

  async function getDbInstrumentById(instrumentId: string): Promise<DbInstrument | null> {
    const { data } = await admin
      .from("instruments")
      .select("id,symbol,name,exchange,currency,provider,provider_instrument_id,isin,metadata")
      .eq("id", instrumentId)
      .single();

    return data ?? null;
  }

  async function upsertAndFetchByProviderInstrument(instrument: ProviderInstrument): Promise<DbInstrument | null> {
    const upsertPayload = {
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
    };

    await admin.from("instruments").upsert(upsertPayload, { onConflict: "provider,provider_instrument_id" });

    const { data } = await admin
      .from("instruments")
      .select("id,symbol,name,exchange,currency,provider,provider_instrument_id,isin,metadata")
      .eq("provider", instrument.provider)
      .eq("provider_instrument_id", instrument.providerInstrumentId)
      .single();

    return data ?? null;
  }

  async function resolveAssetInstruments(): Promise<
    { instrumentId: string; symbol: string; weight: number; providerInstrument: ProviderInstrument }[]
  > {
    const resolved: {
      instrumentId: string;
      symbol: string;
      weight: number;
      providerInstrument: ProviderInstrument;
    }[] = [];

    for (const asset of config.assets) {
      const explicitInstrumentId = asset.instrumentId ?? asset.resolvedInstrumentId;
      let dbInstrument: DbInstrument | null = null;

      if (explicitInstrumentId) {
        dbInstrument = await getDbInstrumentById(explicitInstrumentId);
      }

      if (!dbInstrument) {
        if (!asset.query) {
          throw new Error("Asset query missing and instrumentId is not resolvable");
        }

        const locale = request.headers.get("accept-language") || "en-US";
        const search = await resolveInstrumentsBySearch({
          query: asset.query,
          locale,
          dataProvider: config.dataProvider
        });

        if (!search.primary) {
          throw new Error(`Unable to resolve instrument for asset query: ${asset.query}`);
        }

        dbInstrument = await upsertAndFetchByProviderInstrument(search.primary);
      }

      if (!dbInstrument) {
        throw new Error("Instrument could not be resolved");
      }

      resolved.push({
        instrumentId: dbInstrument.id,
        symbol: dbInstrument.symbol,
        weight: asset.weight,
        providerInstrument: dbInstrumentToProviderInstrument(dbInstrument)
      });
    }

    return resolved;
  }

  async function resolveBenchmarkInstrument() {
    if (!config.benchmark) {
      return null;
    }

    if (config.benchmark.instrumentId) {
      const dbInstrument = await getDbInstrumentById(config.benchmark.instrumentId);
      return dbInstrument ? dbInstrumentToProviderInstrument(dbInstrument) : null;
    }

    if (!config.benchmark.query) {
      return null;
    }

    const locale = request.headers.get("accept-language") || "en-US";
    const search = await resolveInstrumentsBySearch({
      query: config.benchmark.query,
      locale,
      dataProvider: config.dataProvider
    });

    return search.primary;
  }

  try {
    runId = await createBacktestRun({
      userId,
      config
    });
    if (!runId) {
      throw new Error("Failed to initialize backtest run");
    }

    const [assets, benchmarkInstrument] = await Promise.all([
      resolveAssetInstruments(),
      resolveBenchmarkInstrument()
    ]);

    const assetSeries = await provider.getDailyPrices({
      instruments: assets.map((asset) => asset.providerInstrument),
      startDate: config.startDate,
      endDate: config.endDate
    });

    const benchmarkSeries = benchmarkInstrument
      ? (
          await provider.getDailyPrices({
            instruments: [benchmarkInstrument],
            startDate: config.startDate,
            endDate: config.endDate
          })
        )[0]
      : null;

    const result = runBacktestEngine({
      config,
      assets: assets.map((asset) => ({
        instrumentId: asset.instrumentId,
        symbol: asset.symbol,
        weight: asset.weight
      })),
      assetSeries,
      benchmarkSeries
    });

    await saveBacktestResult({
      userId,
      runId,
      result
    });

    return NextResponse.json({
      id: runId,
      summary: result.summary,
      diagnostics: result.diagnostics
    });
  } catch (error) {
    if (runId) {
      await markRunFailed({
        runId,
        message: error instanceof Error ? error.message : "Unknown failure"
      });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Backtest execution failed"
      },
      { status: 500 }
    );
  }
}
