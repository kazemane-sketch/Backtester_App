import type { Job } from "bullmq";

import { log } from "../config";
import { eodhdClient } from "../eodhd/client";
import { pricesQueue, type IngestJobPayload } from "../queues";
import {
  finishJobRun,
  getInstrumentsBySymbols,
  getLatestPriceDate,
  listInstruments,
  setSyncState,
  startJobRun,
  upsertPricesDaily
} from "../supabase/upserts";

function parseCursor(cursor: string | undefined) {
  const value = Number(cursor ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function defaultStartDate(mode: "full" | "delta" | undefined) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (mode === "full" ? 365 * 25 : 365 * 2));
  return formatDate(start);
}

function chunkJobId(mode: IngestJobPayload["mode"], nextCursor: number) {
  const bucket = new Date().toISOString().slice(0, 10);
  return `prices:cursor:${mode ?? "delta"}:${bucket}:${nextCursor}`;
}

export async function processSyncPricesDaily(job: Job<IngestJobPayload>) {
  const runId = await startJobRun({
    jobName: "syncPricesDaily",
    status: "running",
    attempts: job.attemptsMade,
    meta: {
      jobId: job.id,
      payload: job.data
    }
  });

  try {
    const chunkSize = Math.max(1, Math.min(job.data.chunkSize ?? 200, 500));
    const cursor = parseCursor(job.data.cursor);

    const targetInstruments = job.data.symbols?.length
      ? await getInstrumentsBySymbols(job.data.symbols)
      : await listInstruments({
          provider: "EODHD",
          limit: chunkSize,
          offset: cursor
        });

    if (targetInstruments.length === 0) {
      await finishJobRun({
        id: runId,
        status: "success",
        meta: {
          processedInstruments: 0,
          reason: "No instruments available"
        }
      });

      return;
    }

    const today = formatDate(new Date());
    let processedInstruments = 0;
    let insertedBars = 0;

    for (const instrument of targetInstruments) {
      const latestDate = await getLatestPriceDate(instrument.id);
      const fromDate = latestDate ? addDays(latestDate, 1) : defaultStartDate(job.data.mode);

      if (fromDate > today) {
        continue;
      }

      const bars = await eodhdClient.getDailyHistory(instrument.symbol, fromDate, today);
      const normalizedBars = bars
        .filter((bar) => typeof bar.date === "string" && bar.date.length >= 10)
        .map((bar) => ({
          date: bar.date,
          open: bar.open ?? null,
          high: bar.high ?? null,
          low: bar.low ?? null,
          close: bar.close ?? null,
          adjClose: bar.adjusted_close ?? bar.close ?? null,
          volume: typeof bar.volume === "number" ? Math.trunc(bar.volume) : null
        }))
        .filter((bar) => bar.close !== null || bar.adjClose !== null);

      await upsertPricesDaily({
        instrumentId: instrument.id,
        provider: instrument.provider,
        bars: normalizedBars
      });

      processedInstruments += 1;
      insertedBars += normalizedBars.length;
    }

    let nextCursor: number | null = null;
    if (!job.data.symbols?.length && targetInstruments.length === chunkSize) {
      nextCursor = cursor + chunkSize;

      await pricesQueue.add(
        "sync-prices-daily",
        {
          mode: job.data.mode ?? "delta",
          chunkSize,
          cursor: String(nextCursor),
          trigger: job.data.trigger ?? "cursor-chain"
        },
        {
          jobId: chunkJobId(job.data.mode, nextCursor)
        }
      );
    }

    await setSyncState("prices:last_run", {
      mode: job.data.mode ?? "delta",
      at: new Date().toISOString(),
      trigger: job.data.trigger ?? "worker",
      processedInstruments,
      insertedBars,
      cursor,
      nextCursor
    });

    await finishJobRun({
      id: runId,
      status: "success",
      meta: {
        processedInstruments,
        insertedBars,
        sourceCount: targetInstruments.length,
        nextCursor
      }
    });

    log("info", "syncPricesDaily completed", {
      jobId: job.id,
      runId,
      processedInstruments,
      insertedBars
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
