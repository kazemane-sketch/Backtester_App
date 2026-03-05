import OpenAI from "openai";
import type { Job } from "bullmq";

import { log, workerEnv } from "../config";
import { embeddingsQueue, type IngestJobPayload } from "../queues";
import { buildEmbeddingText, hasEmbeddingTextChanged } from "../supabase/parsers";
import {
  finishJobRun,
  getEmbeddingRow,
  getEtfFundamentalsByInstrumentId,
  getEtfWeightsByInstrumentId,
  getInstrumentsBySymbols,
  listInstruments,
  setSyncState,
  startJobRun,
  upsertEmbedding
} from "../supabase/upserts";

const EMBEDDING_MODEL = "text-embedding-3-small";
const client = new OpenAI({ apiKey: workerEnv.OPENAI_API_KEY });

function parseCursor(cursor: string | undefined) {
  const value = Number(cursor ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedTextWithRetry(text: string, maxRetries = 3): Promise<number[]> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding || embedding.length === 0) {
        throw new Error("OpenAI returned empty embedding");
      }

      return embedding;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      const delay = Math.min(20_000, 500 * 2 ** attempt);
      await sleep(delay);
      attempt += 1;
    }
  }

  throw new Error("Embedding retry exhausted");
}

function chunkJobId(mode: IngestJobPayload["mode"], nextCursor: number) {
  const bucket = new Date().toISOString().slice(0, 13);
  return `embeddings:cursor:${mode ?? "delta"}:${bucket}:${nextCursor}`;
}

export async function processRefreshEmbeddings(job: Job<IngestJobPayload>) {
  const runId = await startJobRun({
    jobName: "refreshEmbeddings",
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
          refreshedEmbeddings: 0,
          reason: "No instruments available"
        }
      });

      return;
    }

    let refreshedEmbeddings = 0;
    let skippedEmbeddings = 0;

    for (const instrument of targetInstruments) {
      const [existingEmbedding, fundamentals, weights] = await Promise.all([
        getEmbeddingRow(instrument.id),
        instrument.type === "etf" ? getEtfFundamentalsByInstrumentId(instrument.id) : Promise.resolve(null),
        instrument.type === "etf"
          ? getEtfWeightsByInstrumentId(instrument.id)
          : Promise.resolve({ countryWeights: [], regionWeights: [], sectorWeights: [] })
      ]);

      const embeddingText = buildEmbeddingText({
        type: instrument.type,
        symbol: instrument.symbol,
        isin: instrument.isin,
        name: instrument.name,
        indexName: fundamentals?.index_name ?? null,
        category: fundamentals?.category ?? null,
        domicile: fundamentals?.domicile ?? null,
        description: fundamentals?.description ?? null,
        countryWeights: weights.countryWeights,
        regionWeights: weights.regionWeights,
        sectorWeights: weights.sectorWeights
      });

      if (!hasEmbeddingTextChanged(existingEmbedding?.embedding_text ?? null, embeddingText)) {
        skippedEmbeddings += 1;
        continue;
      }

      const embedding = await embedTextWithRetry(embeddingText, 3);
      await upsertEmbedding({
        instrumentId: instrument.id,
        embedding,
        embeddingText,
        model: EMBEDDING_MODEL
      });

      refreshedEmbeddings += 1;
    }

    let nextCursor: number | null = null;
    if (!job.data.symbols?.length && targetInstruments.length === chunkSize) {
      nextCursor = cursor + chunkSize;

      await embeddingsQueue.add(
        "refresh-embeddings",
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

    await setSyncState("embeddings:last_run", {
      mode: job.data.mode ?? "delta",
      at: new Date().toISOString(),
      trigger: job.data.trigger ?? "worker",
      refreshedEmbeddings,
      skippedEmbeddings,
      cursor,
      nextCursor
    });

    await finishJobRun({
      id: runId,
      status: "success",
      meta: {
        refreshedEmbeddings,
        skippedEmbeddings,
        sourceCount: targetInstruments.length,
        nextCursor
      }
    });

    log("info", "refreshEmbeddings completed", {
      jobId: job.id,
      runId,
      refreshedEmbeddings,
      skippedEmbeddings
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
