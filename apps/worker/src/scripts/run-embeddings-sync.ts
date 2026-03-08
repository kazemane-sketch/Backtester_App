/**
 * Driver script that calls the generate-embeddings Edge Function
 * in batches to create vector embeddings for all instruments with fundamentals.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx src/scripts/run-embeddings-sync.ts
 *
 * Optional env:
 *   BATCH_SIZE=10       Number of instruments per Edge Function call (default: 10)
 *   CONCURRENCY=2       Number of parallel Edge Function calls (default: 2)
 *   START_OFFSET=0      Skip first N instruments (for resuming)
 *   FORCE_REFRESH=true  Re-generate ALL embeddings even if they already exist
 */

const SUPABASE_URL = "https://zhsndrwsxtlqeygmermr.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoc25kcndzeHRscWV5Z21lcm1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDU2NzAsImV4cCI6MjA4ODI4MTY3MH0.8hZNO36cjPiN5j0Q_Qi8G1Cl84Coqq5ip0HcqtLFfs0";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "10");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? "2");
const START_OFFSET = Number(process.env.START_OFFSET ?? "0");
const FORCE_REFRESH = process.env.FORCE_REFRESH === "true";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch all instrument IDs that have fundamentals */
async function fetchAllFundamentalIds(): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/etf_fundamentals`);
    url.searchParams.set("select", "instrument_id");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order", "instrument_id.asc");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
    });

    if (!res.ok) throw new Error(`Failed to fetch fundamentals: ${res.status}`);
    const data = (await res.json()) as Array<{ instrument_id: string }>;
    for (const d of data) ids.push(d.instrument_id);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

/** Fetch instrument IDs that already have embeddings */
async function fetchExistingEmbeddingIds(): Promise<Set<string>> {
  const PAGE_SIZE = 1000;
  const ids = new Set<string>();
  let offset = 0;

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/instrument_embeddings`);
    url.searchParams.set("select", "instrument_id");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
    });

    if (!res.ok) {
      console.warn("Could not fetch existing embeddings, will re-process all");
      break;
    }
    const data = (await res.json()) as Array<{ instrument_id: string }>;
    for (const d of data) ids.add(d.instrument_id);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
}

/** Fetch instrument IDs that need embedding generation */
async function fetchInstrumentIdsNeedingEmbeddings(): Promise<string[]> {
  const fundIds = await fetchAllFundamentalIds();

  if (FORCE_REFRESH) {
    console.log(`   FORCE_REFRESH mode: will re-generate all ${fundIds.length} embeddings`);
    return fundIds;
  }

  const existingIds = await fetchExistingEmbeddingIds();
  const needsEmbed = fundIds.filter((id) => !existingIds.has(id));
  return needsEmbed;
}

async function callEmbeddingFunction(instrumentIds: string[]): Promise<{
  success: number;
  failed: number;
  errors: Array<{ instrument_id: string; error?: string }>;
}> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ instrument_ids: instrumentIds, openai_key: OPENAI_KEY }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Function failed: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function main() {
  console.log("🚀 Embeddings Sync Driver");
  console.log(`   Batch size: ${BATCH_SIZE}, Concurrency: ${CONCURRENCY}, Force refresh: ${FORCE_REFRESH}`);

  console.log("\n📋 Fetching instruments needing embeddings...");
  const allIds = await fetchInstrumentIdsNeedingEmbeddings();
  const toProcess = allIds.slice(START_OFFSET);
  console.log(`   Total with fundamentals & no embeddings: ${allIds.length}`);
  console.log(`   To process (after offset ${START_OFFSET}): ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log("\n✅ All embeddings already generated!");
    return;
  }

  // Create batches
  const batches: string[][] = [];
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    batches.push(toProcess.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n⚙️  Processing ${batches.length} batches...\n`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalProcessed = 0;
  const startTime = Date.now();

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);

    const promises = group.map(async (batch, j) => {
      const batchNum = i + j + 1;
      try {
        const result = await callEmbeddingFunction(batch);
        return { batchNum, ...result, batch };
      } catch (err) {
        return {
          batchNum,
          success: 0,
          failed: batch.length,
          errors: [{ instrument_id: "BATCH_ERROR", error: String(err).slice(0, 200) }],
          batch,
        };
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      totalSuccess += result.success;
      totalFailed += result.failed;
      totalProcessed += result.batch.length;

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (totalProcessed / ((Date.now() - startTime) / 1000)).toFixed(1);
      const eta = ((toProcess.length - totalProcessed) / Number(rate) / 60).toFixed(1);

      process.stdout.write(
        `  Batch ${String(result.batchNum).padStart(4)}/${batches.length} | ` +
          `✅ ${result.success} ❌ ${result.failed} | ` +
          `Total: ${totalProcessed}/${toProcess.length} | ` +
          `${rate}/s | ETA: ${eta}min | ${elapsed}s elapsed\n`
      );

      if (result.errors.length > 0 && result.errors[0].instrument_id !== "BATCH_ERROR") {
        const first = result.errors[0];
        console.log(`     ⚠ ${first.instrument_id}: ${first.error}`);
      }
    }

    // Small delay between groups to respect OpenAI rate limits
    if (i + CONCURRENCY < batches.length) {
      await sleep(200);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Embeddings sync complete!`);
  console.log(`   Processed: ${totalProcessed}`);
  console.log(`   Success: ${totalSuccess}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`   Time: ${totalTime} minutes`);
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
});
