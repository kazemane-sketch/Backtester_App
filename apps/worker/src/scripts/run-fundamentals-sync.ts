/**
 * Driver script that calls the sync-etf-fundamentals Edge Function
 * in batches to populate ETF metadata for all instruments.
 *
 * Usage:
 *   EODHD_API_KEY=... npx tsx src/scripts/run-fundamentals-sync.ts
 *
 * Optional env:
 *   BATCH_SIZE=25          Number of symbols per Edge Function call (default: 25)
 *   CONCURRENCY=2          Number of parallel Edge Function calls (default: 2)
 *   START_OFFSET=0         Skip first N symbols (for resuming)
 *   EXCHANGE_FILTER=XETRA  Only sync ETFs from this exchange
 */

const SUPABASE_URL = "https://zhsndrwsxtlqeygmermr.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoc25kcndzeHRscWV5Z21lcm1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDU2NzAsImV4cCI6MjA4ODI4MTY3MH0.8hZNO36cjPiN5j0Q_Qi8G1Cl84Coqq5ip0HcqtLFfs0";

const EODHD_KEY = process.env.EODHD_API_KEY;
if (!EODHD_KEY) {
  console.error("Missing EODHD_API_KEY");
  process.exit(1);
}

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "25");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? "2");
const START_OFFSET = Number(process.env.START_OFFSET ?? "0");
const EXCHANGE_FILTER = process.env.EXCHANGE_FILTER ?? "";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSymbolsFromDb(): Promise<string[]> {
  // Paginate through all ETF symbols (Supabase REST default max is 1000 per request)
  const PAGE_SIZE = 1000;
  const allSymbols: string[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/instruments`);
    url.searchParams.set("select", "symbol");
    url.searchParams.set("type", "eq.etf");
    url.searchParams.set("order", "symbol.asc");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    if (EXCHANGE_FILTER) {
      url.searchParams.set("exchange", `eq.${EXCHANGE_FILTER}`);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
        Prefer: "count=exact",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch symbols: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as Array<{ symbol: string }>;
    allSymbols.push(...data.map((r) => r.symbol));

    if (data.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
  }

  return allSymbols;
}

async function fetchExistingFundamentals(): Promise<Set<string>> {
  const PAGE_SIZE = 1000;
  const allSymbols: string[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/etf_fundamentals`);
    url.searchParams.set("select", "instrument_id,instruments(symbol)");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
    });

    if (!response.ok) {
      console.warn("Could not fetch existing fundamentals, will re-process all");
      return new Set();
    }

    const data = (await response.json()) as Array<{ instruments: { symbol: string } | null }>;
    allSymbols.push(...data.filter((d) => d.instruments).map((d) => d.instruments!.symbol));

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return new Set(allSymbols);
}

async function callSyncFunction(symbols: string[]): Promise<{
  success: number;
  failed: number;
  errors: Array<{ symbol: string; error?: string }>;
}> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-etf-fundamentals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ symbols, eodhd_key: EODHD_KEY }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Function failed: ${res.status} ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function main() {
  console.log("🚀 ETF Fundamentals Sync Driver");
  console.log(`   Batch size: ${BATCH_SIZE}, Concurrency: ${CONCURRENCY}`);
  console.log(`   Exchange filter: ${EXCHANGE_FILTER || "ALL"}`);

  // Get all ETF symbols
  console.log("\n📋 Fetching ETF symbol list...");
  const allSymbols = await fetchSymbolsFromDb();
  console.log(`   Total ETFs in DB: ${allSymbols.length}`);

  // Get existing fundamentals to skip
  console.log("📋 Checking existing fundamentals...");
  const existing = await fetchExistingFundamentals();
  console.log(`   Already have fundamentals: ${existing.size}`);

  // Filter to only missing
  const missing = allSymbols.filter((s) => !existing.has(s));
  const toProcess = missing.slice(START_OFFSET);
  console.log(`   Need to process: ${toProcess.length} (offset: ${START_OFFSET})`);

  if (toProcess.length === 0) {
    console.log("\n✅ All fundamentals already synced!");
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

  // Process in parallel groups
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);
    const batchNums = group.map((_, j) => i + j + 1);

    const promises = group.map(async (batch, j) => {
      const batchNum = i + j + 1;
      try {
        const result = await callSyncFunction(batch);
        return { batchNum, ...result, batch };
      } catch (err) {
        return {
          batchNum,
          success: 0,
          failed: batch.length,
          errors: [{ symbol: "BATCH_ERROR", error: String(err).slice(0, 200) }],
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

      if (result.errors.length > 0 && result.errors[0].symbol !== "BATCH_ERROR") {
        // Only log first error per batch to avoid spam
        const first = result.errors[0];
        if (first.error && !first.error.includes("HTTP 404")) {
          console.log(`     ⚠ ${first.symbol}: ${first.error}`);
        }
      }
    }

    // Small delay between groups to be gentle on the EODHD API
    if (i + CONCURRENCY < batches.length) {
      await sleep(500);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Fundamentals sync complete!`);
  console.log(`   Processed: ${totalProcessed}`);
  console.log(`   Success: ${totalSuccess}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`   Time: ${totalTime} minutes`);
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
});
