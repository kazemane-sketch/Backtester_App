import { createHash } from "node:crypto";

import type { Job } from "bullmq";

import { log } from "../config";
import { eodhdClient } from "../eodhd/client";
import { fundamentalsQueue, type IngestJobPayload } from "../queues";
import { finishJobRun, setSyncState, startJobRun, upsertInstruments } from "../supabase/upserts";

const MAJOR_EXCHANGES = new Set([
  "US",
  "NASDAQ",
  "NYSE",
  "NYSE ARCA",
  "AMEX",
  "LSE",
  "XETRA",
  "F",
  "PA",
  "MI",
  "AS",
  "BR",
  "SW",
  "MC",
  "TO"
]);

function seedQueries() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return [...letters, "WORLD", "MSCI", "S&P", "NASDAQ", "BOND"];
}

function normalizeType(type: string | undefined, fallback: "etf" | "stock") {
  if (!type) {
    return fallback;
  }

  return type.toLowerCase() === "etf" ? "etf" : "stock";
}

function hashSymbols(symbols: string[]) {
  return createHash("sha1").update(symbols.join("|")).digest("hex").slice(0, 12);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function processSyncUniverse(job: Job<IngestJobPayload>) {
  const runId = await startJobRun({
    jobName: "syncUniverse",
    status: "running",
    attempts: job.attemptsMade,
    meta: {
      jobId: job.id,
      payload: job.data
    }
  });

  try {
    const seen = new Map<
      string,
      {
        symbol: string;
        type: "etf" | "stock";
        isin: string | null;
        name: string;
        exchange: string;
        currency: string;
        provider: "EODHD";
        providerInstrumentId: string;
        metadata: Record<string, unknown>;
      }
    >();

    const queries = seedQueries();
    const searchTypes: Array<"etf" | "stock"> = ["etf", "stock"];

    for (const type of searchTypes) {
      for (const query of queries) {
        const results = await eodhdClient.searchInstruments(query, type);

        results.forEach((item) => {
          const code = item.Code?.trim();
          const exchange = item.Exchange?.trim();
          if (!code || !exchange) {
            return;
          }

          if (!MAJOR_EXCHANGES.has(exchange.toUpperCase())) {
            return;
          }

          const listingSymbol = `${code}.${exchange}`;

          seen.set(listingSymbol, {
            symbol: listingSymbol,
            type: normalizeType(item.Type, type),
            isin: item.ISIN?.trim() || null,
            name: item.Name?.trim() || code,
            exchange,
            currency: item.Currency?.trim() || "USD",
            provider: "EODHD",
            providerInstrumentId: listingSymbol,
            metadata: {
              countryCode: item.Country?.trim() || null,
              sourceQuery: query,
              sourceType: type
            }
          });
        });
      }
    }

    const instrumentRows = [...seen.values()];
    await upsertInstruments(instrumentRows);

    const etfSymbols = instrumentRows.filter((item) => item.type === "etf").map((item) => item.symbol);
    const etfChunks = chunkArray(etfSymbols, 200);

    for (const [index, symbols] of etfChunks.entries()) {
      const jobId = `fundamentals:${new Date().toISOString().slice(0, 10)}:${index}:${hashSymbols(symbols)}`;
      await fundamentalsQueue.add(
        "sync-etf-fundamentals",
        {
          mode: "delta",
          symbols,
          chunkSize: 200,
          trigger: "universe-sync"
        },
        {
          jobId
        }
      );
    }

    await setSyncState("universe:last_run", {
      mode: job.data.mode ?? "delta",
      at: new Date().toISOString(),
      trigger: job.data.trigger ?? "worker",
      instrumentsUpserted: instrumentRows.length,
      etfQueued: etfSymbols.length
    });

    await finishJobRun({
      id: runId,
      status: "success",
      meta: {
        instrumentsUpserted: instrumentRows.length,
        etfQueued: etfSymbols.length,
        fundamentalsJobs: etfChunks.length
      }
    });

    log("info", "syncUniverse completed", {
      jobId: job.id,
      runId,
      instrumentsUpserted: instrumentRows.length,
      etfQueued: etfSymbols.length
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
