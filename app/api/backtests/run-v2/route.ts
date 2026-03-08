/**
 * Unified Multi-Engine Backtest API (v2)
 *
 * Accepts a discriminated union payload:
 *   { engine: "A", config: BacktestConfig }
 *   { engine: "B", config: EngineBConfig }
 *   { engine: "C", config: EngineCConfig }
 *
 * The original /api/backtests/run route is preserved for backward compatibility.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { runBacktestEngine } from "@/lib/backtest/engine";
import { runEngineBBacktest } from "@/lib/backtest/engine-b";
import { runEngineCBacktest } from "@/lib/backtest/engine-c";
import { createBacktestRun, markRunFailed, saveBacktestResult } from "@/lib/backtest/persistence";
import { resolveInstrumentsBySearch } from "@/lib/instruments/resolve-instrument";
import { getMarketDataProvider } from "@/lib/market-data/provider-factory";
import type { DataProvider, ProviderInstrument } from "@/lib/market-data/types";
import { backtestConfigSchema } from "@/lib/schemas/backtest-config";
import { engineBConfigSchema } from "@/lib/schemas/engine-b-config";
import { engineCConfigSchema } from "@/lib/schemas/engine-c-config";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

// ─── Payload Schema ─────────────────────────────────────────────────────────

const runV2PayloadSchema = z.discriminatedUnion("engine", [
  z.object({ engine: z.literal("A"), config: backtestConfigSchema }),
  z.object({ engine: z.literal("B"), config: engineBConfigSchema }),
  z.object({ engine: z.literal("C"), config: engineCConfigSchema })
]);

// ─── Instrument Resolution Helpers ──────────────────────────────────────────

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

function toProviderInstrument(db: DbInstrument): ProviderInstrument {
  return {
    instrumentId: db.id,
    provider: db.provider,
    providerInstrumentId: db.provider_instrument_id,
    symbol: db.symbol,
    name: db.name,
    exchange: db.exchange,
    currency: db.currency,
    isin: db.isin ?? undefined,
    countryCode: undefined
  };
}

function makeResolver(admin: ReturnType<typeof createServiceRoleClient>, locale: string) {
  async function getById(instrumentId: string): Promise<DbInstrument | null> {
    const { data } = await admin
      .from("instruments")
      .select("id,symbol,name,exchange,currency,provider,provider_instrument_id,isin,metadata")
      .eq("id", instrumentId)
      .single();
    return data ?? null;
  }

  async function upsertFromProvider(instrument: ProviderInstrument): Promise<DbInstrument | null> {
    const type = (instrument.type?.toLowerCase() === "etf" ? "etf" : "stock") as string;
    await admin.from("instruments").upsert(
      {
        provider: instrument.provider,
        provider_instrument_id: instrument.providerInstrumentId,
        symbol: instrument.providerInstrumentId,
        type,
        isin: instrument.isin ?? null,
        name: instrument.name,
        exchange: instrument.exchange,
        currency: instrument.currency,
        metadata: { countryCode: instrument.countryCode ?? null, type: instrument.type ?? null }
      },
      { onConflict: "provider,provider_instrument_id" }
    );

    const { data } = await admin
      .from("instruments")
      .select("id,symbol,name,exchange,currency,provider,provider_instrument_id,isin,metadata")
      .eq("provider", instrument.provider)
      .eq("provider_instrument_id", instrument.providerInstrumentId)
      .single();
    return data ?? null;
  }

  async function resolveAsset(
    asset: { query?: string; instrumentId?: string; resolvedInstrumentId?: string },
    dataProvider: DataProvider
  ): Promise<{ db: DbInstrument; provider: ProviderInstrument }> {
    const explicitId = asset.instrumentId ?? asset.resolvedInstrumentId;
    let db: DbInstrument | null = null;

    if (explicitId) {
      db = await getById(explicitId);
    }

    if (!db) {
      if (!asset.query) throw new Error("Asset query missing and instrumentId not resolvable");
      const search = await resolveInstrumentsBySearch({ query: asset.query, locale, dataProvider });
      if (!search.primary) throw new Error(`Unable to resolve instrument: ${asset.query}`);
      db = await upsertFromProvider(search.primary);
    }

    if (!db) throw new Error("Instrument could not be resolved");
    return { db, provider: toProviderInstrument(db) };
  }

  async function resolveBenchmark(
    benchmark: { query?: string; instrumentId?: string } | undefined,
    dataProvider: DataProvider
  ): Promise<ProviderInstrument | null> {
    if (!benchmark) return null;
    if (benchmark.instrumentId) {
      const db = await getById(benchmark.instrumentId);
      return db ? toProviderInstrument(db) : null;
    }
    if (!benchmark.query) return null;
    const search = await resolveInstrumentsBySearch({ query: benchmark.query, locale, dataProvider });
    return search.primary;
  }

  return { resolveAsset, resolveBenchmark };
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = runV2PayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { engine, config } = parsed.data;
  const admin = createServiceRoleClient();
  const locale = request.headers.get("accept-language") || "en-US";
  const { resolveAsset, resolveBenchmark } = makeResolver(admin, locale);
  let runId: string | null = null;

  /* Dev bypass: use a deterministic UUID when no user session */
  const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";

  try {
    // Create run record (persistence accepts any config as JSON)
    runId = await createBacktestRun({ userId, config: config as Record<string, unknown> });
    if (!runId) throw new Error("Failed to initialize backtest run");

    let resultPayload: {
      id: string;
      engine: string;
      summary: unknown;
      extendedMetrics?: unknown;
      allocationHistory?: unknown;
      tradeRecords?: unknown;
      diagnostics?: unknown;
    };

    // ── Engine A ──────────────────────────────────────────────────────────
    if (engine === "A") {
      const provider = getMarketDataProvider(config.dataProvider);
      const assets = await Promise.all(
        config.assets.map(async (asset) => {
          const resolved = await resolveAsset(asset, config.dataProvider);
          return { ...resolved, weight: asset.weight };
        })
      );
      const benchmarkInstrument = await resolveBenchmark(config.benchmark, config.dataProvider);

      const assetSeries = await provider.getDailyPrices({
        instruments: assets.map((a) => a.provider),
        startDate: config.startDate,
        endDate: config.endDate
      });
      const benchmarkSeries = benchmarkInstrument
        ? (await provider.getDailyPrices({ instruments: [benchmarkInstrument], startDate: config.startDate, endDate: config.endDate }))[0]
        : null;

      const result = runBacktestEngine({
        config,
        assets: assets.map((a) => ({ instrumentId: a.db.id, symbol: a.db.symbol, weight: a.weight })),
        assetSeries,
        benchmarkSeries
      });

      await saveBacktestResult({ userId, runId, result });
      resultPayload = { id: runId, engine: "A", summary: result.summary, diagnostics: result.diagnostics };
    }

    // ── Engine B ──────────────────────────────────────────────────────────
    else if (engine === "B") {
      const provider = getMarketDataProvider(config.dataProvider);
      const universeResolved = await Promise.all(
        config.universe.map((asset) => resolveAsset(asset, config.dataProvider))
      );
      const benchmarkInstrument = await resolveBenchmark(config.benchmark, config.dataProvider);

      const assetSeries = await provider.getDailyPrices({
        instruments: universeResolved.map((a) => a.provider),
        startDate: config.startDate,
        endDate: config.endDate
      });
      const benchmarkSeries = benchmarkInstrument
        ? (await provider.getDailyPrices({ instruments: [benchmarkInstrument], startDate: config.startDate, endDate: config.endDate }))[0]
        : null;

      const result = runEngineBBacktest({
        config,
        assets: universeResolved.map((a) => ({ instrumentId: a.db.id, symbol: a.db.symbol })),
        assetSeries,
        benchmarkSeries
      });

      // Save using Engine A's persistence (compatible timeseries/trades format)
      await saveBacktestResult({
        userId,
        runId,
        result: {
          summary: result.summary,
          timeseries: result.timeseries,
          trades: result.trades,
          diagnostics: result.diagnostics
        }
      });

      resultPayload = {
        id: runId,
        engine: "B",
        summary: result.summary,
        allocationHistory: result.allocationHistory,
        diagnostics: result.diagnostics
      };
    }

    // ── Engine C ──────────────────────────────────────────────────────────
    else {
      const provider = getMarketDataProvider(config.dataProvider);
      const resolved = await resolveAsset(config.asset, config.dataProvider);
      const benchmarkInstrument = await resolveBenchmark(config.benchmark, config.dataProvider);

      const [assetSeries] = await provider.getDailyPrices({
        instruments: [resolved.provider],
        startDate: config.startDate,
        endDate: config.endDate
      });
      const benchmarkSeries = benchmarkInstrument
        ? (await provider.getDailyPrices({ instruments: [benchmarkInstrument], startDate: config.startDate, endDate: config.endDate }))[0]
        : null;

      const result = runEngineCBacktest({
        config,
        asset: { instrumentId: resolved.db.id, symbol: resolved.db.symbol },
        assetSeries,
        benchmarkSeries
      });

      // Save using Engine A's persistence
      await saveBacktestResult({
        userId,
        runId,
        result: {
          summary: result.summary,
          timeseries: result.timeseries,
          trades: result.trades,
          diagnostics: result.diagnostics
        }
      });

      resultPayload = {
        id: runId,
        engine: "C",
        summary: result.summary,
        extendedMetrics: result.extendedMetrics,
        tradeRecords: result.tradeRecords,
        diagnostics: result.diagnostics
      };
    }

    return NextResponse.json(resultPayload);
  } catch (error) {
    if (runId) {
      await markRunFailed({ runId, message: error instanceof Error ? error.message : "Unknown failure" });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backtest execution failed" },
      { status: 500 }
    );
  }
}
