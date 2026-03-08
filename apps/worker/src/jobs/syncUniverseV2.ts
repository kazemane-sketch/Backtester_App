import { createHash } from "node:crypto";

import type { Job } from "bullmq";

import { log } from "../config";
import { eodhdClient, type EodhdExchangeSymbol } from "../eodhd/client";
import { fundamentalsQueue, type IngestJobPayload } from "../queues";
import { finishJobRun, setSyncState, startJobRun, upsertInstruments } from "../supabase/upserts";

/**
 * Target exchanges for Phase 1 ETF universe building.
 *
 * Using the EODHD `/exchange-symbol-list/{EXCHANGE}` endpoint which returns
 * ALL listed instruments on an exchange, unlike the `/search` endpoint which
 * caps results at ~50 per query.
 *
 * Expected yield: 7,000–12,000 unique ETFs across all exchanges.
 */
const ETF_EXCHANGES = [
  "US",     // NYSE + NASDAQ + AMEX combined (~3000 ETFs)
  "LSE",    // London Stock Exchange (~2000 ETFs)
  "XETRA",  // Deutsche Boerse (~2000 ETFs)
  "PA",     // Euronext Paris (~800 ETFs)
  "MI",     // Borsa Italiana (~1200 ETFs)
  "AS",     // Euronext Amsterdam (~600 ETFs)
  "SW",     // SIX Swiss Exchange (~1500 ETFs)
  "MC",     // Bolsa de Madrid (~200 ETFs)
  "BR",     // Euronext Brussels (~300 ETFs)
  "F",      // Frankfurt (~500 ETFs)
  "TO",     // Toronto (~900 ETFs)
];

/**
 * Stock exchanges — smaller priority set.
 * Stocks are mainly discovered through search fallback, but we include
 * US + major EU exchanges for completeness.
 */
const STOCK_EXCHANGES = [
  "US",     // US combined
  "LSE",    // London
  "XETRA",  // German
  "PA",     // French
  "MI",     // Italian
];

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function hashSymbols(symbols: string[]) {
  return createHash("sha1").update(symbols.join("|")).digest("hex").slice(0, 12);
}

function normalizeExchangeSymbol(item: EodhdExchangeSymbol, exchange: string) {
  const code = item.Code?.trim();
  if (!code) return null;

  // EODHD exchange-symbol-list sometimes returns the exchange in the item,
  // sometimes not — we use the exchange we queried for.
  const itemExchange = item.Exchange?.trim() || exchange;
  const listingSymbol = `${code}.${itemExchange}`;

  const rawType = (item.Type || "").toLowerCase();
  const type: "etf" | "stock" = rawType === "etf" || rawType === "etf-fund" ? "etf" : "stock";

  return {
    symbol: listingSymbol,
    type,
    isin: item.Isin?.trim() || null,
    name: item.Name?.trim() || code,
    exchange: itemExchange,
    currency: item.Currency?.trim() || "USD",
    provider: "EODHD" as const,
    providerInstrumentId: listingSymbol,
    metadata: {
      countryCode: item.Country?.trim() || null,
      sourceExchange: exchange,
      sourceMethod: "exchange-symbol-list"
    }
  };
}

export async function processSyncUniverseV2(job: Job<IngestJobPayload>) {
  const runId = await startJobRun({
    jobName: "syncUniverseV2",
    status: "running",
    attempts: job.attemptsMade,
    meta: { jobId: job.id, payload: job.data }
  });

  try {
    const mode = job.data.mode ?? "delta";
    const syncEtfs = mode === "full" || !job.data.symbols;
    const syncStocks = mode === "full";

    const seen = new Map<string, ReturnType<typeof normalizeExchangeSymbol>>();

    // ── ETF Universe ──────────────────────────────────────
    if (syncEtfs) {
      for (const exchange of ETF_EXCHANGES) {
        try {
          log("info", `syncUniverseV2: fetching ETFs from ${exchange}`);
          const items = await eodhdClient.getExchangeSymbols(exchange, "etf");

          let added = 0;
          for (const item of items) {
            const normalized = normalizeExchangeSymbol(item, exchange);
            if (!normalized) continue;

            // Force type to etf since we queried with type=etf
            normalized.type = "etf";

            if (!seen.has(normalized.symbol)) {
              seen.set(normalized.symbol, normalized);
              added++;
            }
          }

          log("info", `syncUniverseV2: ${exchange} returned ${items.length} items, ${added} new ETFs`);
        } catch (error) {
          // Log and continue — don't let one exchange failure stop the whole job
          const msg = error instanceof Error ? error.message : String(error);
          log("warn", `syncUniverseV2: failed to fetch ETFs from ${exchange}`, { error: msg });
        }
      }
    }

    // ── Stock Universe (optional, full mode only) ─────────
    if (syncStocks) {
      for (const exchange of STOCK_EXCHANGES) {
        try {
          log("info", `syncUniverseV2: fetching stocks from ${exchange}`);
          const items = await eodhdClient.getExchangeSymbols(exchange, "stock");

          let added = 0;
          for (const item of items) {
            const normalized = normalizeExchangeSymbol(item, exchange);
            if (!normalized) continue;

            normalized.type = "stock";

            if (!seen.has(normalized.symbol)) {
              seen.set(normalized.symbol, normalized);
              added++;
            }
          }

          log("info", `syncUniverseV2: ${exchange} returned ${items.length} items, ${added} new stocks`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          log("warn", `syncUniverseV2: failed to fetch stocks from ${exchange}`, { error: msg });
        }
      }
    }

    // ── Upsert to DB ──────────────────────────────────────
    const instrumentRows = [...seen.values()].filter(
      (row): row is NonNullable<typeof row> => row !== null
    );

    log("info", `syncUniverseV2: upserting ${instrumentRows.length} instruments`);
    await upsertInstruments(instrumentRows);

    // ── Chain: queue fundamentals sync for ETFs ───────────
    const etfSymbols = instrumentRows
      .filter((item) => item.type === "etf")
      .map((item) => item.symbol);

    const etfChunks = chunkArray(etfSymbols, 200);

    for (const [index, symbols] of etfChunks.entries()) {
      const jobId = `fundamentals-v2:${new Date().toISOString().slice(0, 10)}:${index}:${hashSymbols(symbols)}`;
      await fundamentalsQueue.add(
        "sync-etf-fundamentals",
        {
          mode: "delta",
          symbols,
          chunkSize: 200,
          trigger: "universe-v2-sync"
        },
        { jobId }
      );
    }

    // ── Persist sync state ────────────────────────────────
    const etfCount = etfSymbols.length;
    const stockCount = instrumentRows.length - etfCount;

    await setSyncState("universe-v2:last_run", {
      mode,
      at: new Date().toISOString(),
      trigger: job.data.trigger ?? "worker",
      instrumentsUpserted: instrumentRows.length,
      etfCount,
      stockCount,
      etfQueued: etfCount,
      exchanges: syncEtfs ? ETF_EXCHANGES : []
    });

    await finishJobRun({
      id: runId,
      status: "success",
      meta: {
        instrumentsUpserted: instrumentRows.length,
        etfCount,
        stockCount,
        etfQueued: etfCount,
        fundamentalsJobs: etfChunks.length
      }
    });

    log("info", "syncUniverseV2 completed", {
      jobId: job.id,
      runId,
      instruments: instrumentRows.length,
      etfs: etfCount,
      stocks: stockCount,
      fundamentalsJobs: etfChunks.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await finishJobRun({
      id: runId,
      status: "failed",
      error: message
    });

    throw error;
  }
}
