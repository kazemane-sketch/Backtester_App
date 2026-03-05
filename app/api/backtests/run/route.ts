import { NextResponse } from "next/server";

import { createBacktestRun, markRunFailed, saveBacktestResult } from "@/lib/backtest/persistence";
import { runBacktestEngine } from "@/lib/backtest/engine";
import { resolveInstrumentsBySearch } from "@/lib/instruments/resolve-instrument";
import { getMarketDataProvider } from "@/lib/market-data/provider-factory";
import type { ProviderInstrument } from "@/lib/market-data/types";
import { runBacktestPayloadSchema } from "@/lib/schemas/backtest-config";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
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

  async function resolveAssetInstruments(): Promise<
    { instrumentId: string; symbol: string; weight: number; providerInstrument: ProviderInstrument }[]
  > {
    const resolved = [] as {
      instrumentId: string;
      symbol: string;
      weight: number;
      providerInstrument: ProviderInstrument;
    }[];

    for (const asset of config.assets) {
      let dbInstrument:
        | {
            id: string;
            symbol: string;
            name: string;
            exchange: string;
            currency: string;
            provider: "EODHD" | "YAHOO";
            provider_instrument_id: string;
            isin: string | null;
            metadata: unknown;
          }
        | null
        | undefined = null;

      if (asset.resolvedInstrumentId) {
        const { data } = await admin
          .from("instruments")
          .select("id,symbol,name,exchange,currency,provider,provider_instrument_id,isin,metadata")
          .eq("id", asset.resolvedInstrumentId)
          .single();
        dbInstrument = data;
      } else {
        const locale = request.headers.get("accept-language") || "en-US";
        const search = await resolveInstrumentsBySearch({
          query: asset.query,
          locale,
          dataProvider: config.dataProvider
        });

        if (!search.primary) {
          throw new Error(`Unable to resolve instrument for asset query: ${asset.query}`);
        }

        const upsertPayload = {
          provider: search.primary.provider,
          provider_instrument_id: search.primary.providerInstrumentId,
          symbol: search.primary.symbol,
          isin: search.primary.isin ?? null,
          name: search.primary.name,
          exchange: search.primary.exchange,
          currency: search.primary.currency,
          metadata: {
            countryCode: search.primary.countryCode ?? null,
            type: search.primary.type ?? null
          }
        };

        await admin.from("instruments").upsert(upsertPayload, { onConflict: "provider,provider_instrument_id" });

        const { data } = await admin
          .from("instruments")
          .select("id,symbol,name,exchange,currency,provider,provider_instrument_id,isin,metadata")
          .eq("provider", search.primary.provider)
          .eq("provider_instrument_id", search.primary.providerInstrumentId)
          .single();

        dbInstrument = data;
      }

      if (!dbInstrument) {
        throw new Error(`Instrument not found for asset query: ${asset.query}`);
      }

      resolved.push({
        instrumentId: dbInstrument.id,
        symbol: dbInstrument.symbol,
        weight: asset.weight,
        providerInstrument: {
          provider: dbInstrument.provider,
          providerInstrumentId: dbInstrument.provider_instrument_id,
          symbol: dbInstrument.symbol,
          name: dbInstrument.name,
          exchange: dbInstrument.exchange,
          currency: dbInstrument.currency,
          isin: dbInstrument.isin ?? undefined,
          countryCode: undefined
        }
      });
    }

    return resolved;
  }

  async function resolveBenchmarkInstrument() {
    if (!config.benchmark?.query) {
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
      userId: user.id,
      config
    });
    if (!runId) {
      throw new Error("Failed to initialize run");
    }

    const [assets, benchmarkInstrument] = await Promise.all([
      resolveAssetInstruments(),
      resolveBenchmarkInstrument()
    ]);

    const assetSeries = await provider.getDailyAdjustedClose({
      instruments: assets.map((asset) => asset.providerInstrument),
      startDate: config.startDate,
      endDate: config.endDate
    });

    const benchmarkSeries = benchmarkInstrument
      ? (
          await provider.getDailyAdjustedClose({
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
      userId: user.id,
      runId: runId,
      result
    });

    return NextResponse.json({
      id: runId,
      summary: result.summary
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
