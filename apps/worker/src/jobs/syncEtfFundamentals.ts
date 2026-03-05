import { createHash } from "node:crypto";

import type { Job } from "bullmq";

import { log } from "../config";
import { eodhdClient } from "../eodhd/client";
import { embeddingsQueue, fundamentalsQueue, type IngestJobPayload } from "../queues";
import {
  buildEmbeddingText,
  hasEmbeddingTextChanged,
  parseFundamentalsPayload,
  sha256Hex
} from "../supabase/parsers";
import {
  finishJobRun,
  getEmbeddingRow,
  getEtfFundamentalsByInstrumentIds,
  getInstrumentsBySymbols,
  listInstruments,
  replaceEtfWeights,
  setSyncState,
  startJobRun,
  upsertEtfFundamentals
} from "../supabase/upserts";

const STALE_DAYS = 7;

function parseCursor(cursor: string | undefined) {
  const value = Number(cursor ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function isStale(updatedAtProvider: string | null) {
  if (!updatedAtProvider) {
    return true;
  }

  const threshold = new Date();
  threshold.setUTCDate(threshold.getUTCDate() - STALE_DAYS);

  const updatedAt = new Date(updatedAtProvider);
  if (Number.isNaN(updatedAt.valueOf())) {
    return true;
  }

  return updatedAt < threshold;
}

function hashForJob(input: string) {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function chunkJobId(mode: IngestJobPayload["mode"], nextCursor: number) {
  const bucket = new Date().toISOString().slice(0, 10);
  return `fundamentals:cursor:${mode ?? "delta"}:${bucket}:${nextCursor}`;
}

export async function processSyncEtfFundamentals(job: Job<IngestJobPayload>) {
  const runId = await startJobRun({
    jobName: "syncEtfFundamentals",
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
      ? (await getInstrumentsBySymbols(job.data.symbols)).filter((item) => item.type === "etf")
      : await listInstruments({
          type: "etf",
          provider: "EODHD",
          limit: chunkSize,
          offset: cursor
        });

    if (targetInstruments.length === 0) {
      await finishJobRun({
        id: runId,
        status: "success",
        meta: {
          processedEtfs: 0,
          reason: "No ETF instruments found for sync"
        }
      });

      return;
    }

    const currentState = await getEtfFundamentalsByInstrumentIds(targetInstruments.map((item) => item.id));
    const updatedByInstrumentId = new Map(currentState.map((row) => [row.instrument_id, row.updated_at_provider]));

    const etfsToSync =
      job.data.mode === "full"
        ? targetInstruments
        : targetInstruments.filter((instrument) => isStale(updatedByInstrumentId.get(instrument.id) ?? null));

    let processedEtfs = 0;
    let embeddingsEnqueued = 0;

    for (const instrument of etfsToSync) {
      const fundamentalsPayload = await eodhdClient.getFundamentals(instrument.symbol);
      const parsed = parseFundamentalsPayload(fundamentalsPayload);

      await upsertEtfFundamentals({
        instrumentId: instrument.id,
        indexName: parsed.indexName,
        domicile: parsed.domicile,
        category: parsed.category,
        description: parsed.description,
        updatedAtProvider: parsed.updatedAtProvider,
        raw: parsed.raw
      });

      await replaceEtfWeights({
        instrumentId: instrument.id,
        countryWeights: parsed.countryWeights,
        regionWeights: parsed.regionWeights,
        sectorWeights: parsed.sectorWeights
      });

      const embeddingText = buildEmbeddingText({
        type: instrument.type,
        symbol: instrument.symbol,
        isin: instrument.isin,
        name: instrument.name,
        indexName: parsed.indexName,
        category: parsed.category,
        domicile: parsed.domicile,
        description: parsed.description,
        regionWeights: parsed.regionWeights,
        sectorWeights: parsed.sectorWeights,
        countryWeights: parsed.countryWeights
      });

      const existingEmbedding = await getEmbeddingRow(instrument.id);
      if (hasEmbeddingTextChanged(existingEmbedding?.embedding_text ?? null, embeddingText)) {
        const signature = sha256Hex(embeddingText);
        const jobId = `emb:${instrument.id}:${hashForJob(signature)}`;

        await embeddingsQueue.add(
          "refresh-embeddings",
          {
            mode: "delta",
            symbols: [instrument.symbol],
            trigger: "fundamentals-sync"
          },
          {
            jobId
          }
        );

        embeddingsEnqueued += 1;
      }

      processedEtfs += 1;
    }

    let nextCursor: number | null = null;
    if (!job.data.symbols?.length && targetInstruments.length === chunkSize) {
      nextCursor = cursor + chunkSize;

      await fundamentalsQueue.add(
        "sync-etf-fundamentals",
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

    await setSyncState("fundamentals:last_run", {
      mode: job.data.mode ?? "delta",
      at: new Date().toISOString(),
      trigger: job.data.trigger ?? "worker",
      processedEtfs,
      embeddingsEnqueued,
      cursor,
      nextCursor
    });

    await finishJobRun({
      id: runId,
      status: "success",
      meta: {
        processedEtfs,
        embeddingsEnqueued,
        sourceCount: targetInstruments.length,
        nextCursor
      }
    });

    log("info", "syncEtfFundamentals completed", {
      jobId: job.id,
      runId,
      processedEtfs,
      embeddingsEnqueued
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
