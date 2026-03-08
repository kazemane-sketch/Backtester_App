/**
 * Standalone bootstrap script for populating the ETF universe.
 *
 * This script bypasses BullMQ/Redis entirely and directly:
 *   1. Fetches all ETFs from target exchanges via EODHD exchange-symbol-list
 *   2. Upserts them into the instruments table
 *
 * Usage:
 *   cd apps/worker
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... EODHD_API_KEY=... npx tsx src/scripts/bootstrap-universe.ts
 *
 * Optional flags (via env):
 *   BOOTSTRAP_STOCKS=true    — Also sync stocks (default: ETFs only)
 *   BOOTSTRAP_EXCHANGES=US,LSE,XETRA — Comma-separated list of exchanges to sync
 */

import { createClient } from "@supabase/supabase-js";

/* ── Minimal env validation ─────────────────────────── */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EODHD_API_KEY = process.env.EODHD_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EODHD_API_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EODHD_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/* ── Config ─────────────────────────────────────────── */

const DEFAULT_ETF_EXCHANGES = [
  "US", "LSE", "XETRA", "PA", "MI", "AS", "SW", "MC", "BR", "F", "TO"
];

const DEFAULT_STOCK_EXCHANGES = ["US", "LSE", "XETRA", "PA", "MI"];

const RATE_LIMIT_MS = 300;
const UPSERT_BATCH_SIZE = 500;

const syncStocks = process.env.BOOTSTRAP_STOCKS === "true";
const customExchanges = process.env.BOOTSTRAP_EXCHANGES?.split(",").map((e) => e.trim()).filter(Boolean);

/* ── EODHD API ──────────────────────────────────────── */

type ExchangeSymbol = {
  Code?: string;
  Name?: string;
  Country?: string;
  Exchange?: string;
  Currency?: string;
  Type?: string;
  Isin?: string;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchExchangeSymbols(exchange: string, type?: "etf" | "stock"): Promise<ExchangeSymbol[]> {
  const url = new URL(`https://eodhd.com/api/exchange-symbol-list/${encodeURIComponent(exchange)}`);
  url.searchParams.set("api_token", EODHD_API_KEY!);
  url.searchParams.set("fmt", "json");
  if (type) url.searchParams.set("type", type);

  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EODHD ${res.status} for ${exchange}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    console.warn(`  ⚠ ${exchange} returned non-array, skipping`);
    return [];
  }

  return data as ExchangeSymbol[];
}

/* ── Data normalization ─────────────────────────────── */

type InstrumentRow = {
  symbol: string;
  type: "etf" | "stock";
  isin: string | null;
  name: string;
  exchange: string;
  currency: string;
  provider: "EODHD";
  provider_instrument_id: string;
  metadata: Record<string, unknown>;
};

function normalizeSymbol(item: ExchangeSymbol, exchange: string, forceType: "etf" | "stock"): InstrumentRow | null {
  const code = item.Code?.trim();
  if (!code) return null;

  const itemExchange = item.Exchange?.trim() || exchange;
  const listingSymbol = `${code}.${itemExchange}`;

  return {
    symbol: listingSymbol,
    type: forceType,
    isin: item.Isin?.trim() || null,
    name: item.Name?.trim() || code,
    exchange: itemExchange,
    currency: item.Currency?.trim() || "USD",
    provider: "EODHD",
    provider_instrument_id: listingSymbol,
    metadata: {
      countryCode: item.Country?.trim() || null,
      sourceExchange: exchange,
      sourceMethod: "bootstrap-universe-script"
    }
  };
}

/* ── Supabase upsert ────────────────────────────────── */

async function upsertBatch(rows: InstrumentRow[]) {
  if (rows.length === 0) return;

  const payload = rows.map((r) => ({
    symbol: r.symbol,
    type: r.type,
    isin: r.isin,
    name: r.name,
    exchange: r.exchange,
    currency: r.currency,
    provider: r.provider,
    provider_instrument_id: r.provider_instrument_id,
    metadata: r.metadata
  }));

  const { error } = await supabase.from("instruments").upsert(payload, {
    onConflict: "provider,symbol"
  });

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`);
  }
}

/* ── Main ───────────────────────────────────────────── */

async function main() {
  console.log("🚀 Bootstrap Universe Script");
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log(`   Sync stocks: ${syncStocks}`);

  const seen = new Map<string, InstrumentRow>();

  // ── ETFs ────────────────────────────────────────────
  const etfExchanges = customExchanges || DEFAULT_ETF_EXCHANGES;
  console.log(`\n📦 Fetching ETFs from ${etfExchanges.length} exchanges: ${etfExchanges.join(", ")}`);

  for (const exchange of etfExchanges) {
    try {
      process.stdout.write(`   ${exchange.padEnd(8)} → `);
      const items = await fetchExchangeSymbols(exchange, "etf");

      let added = 0;
      for (const item of items) {
        const row = normalizeSymbol(item, exchange, "etf");
        if (row && !seen.has(row.symbol)) {
          seen.set(row.symbol, row);
          added++;
        }
      }

      console.log(`${items.length} returned, ${added} new (total: ${seen.size})`);
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Stocks (optional) ──────────────────────────────
  if (syncStocks) {
    const stockExchanges = customExchanges || DEFAULT_STOCK_EXCHANGES;
    console.log(`\n📦 Fetching stocks from ${stockExchanges.length} exchanges: ${stockExchanges.join(", ")}`);

    for (const exchange of stockExchanges) {
      try {
        process.stdout.write(`   ${exchange.padEnd(8)} → `);
        const items = await fetchExchangeSymbols(exchange, "stock");

        let added = 0;
        for (const item of items) {
          const row = normalizeSymbol(item, exchange, "stock");
          if (row && !seen.has(row.symbol)) {
            seen.set(row.symbol, row);
            added++;
          }
        }

        console.log(`${items.length} returned, ${added} new (total: ${seen.size})`);
        await sleep(RATE_LIMIT_MS);
      } catch (err) {
        console.log(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Upsert to Supabase ─────────────────────────────
  const allRows = [...seen.values()];
  const etfCount = allRows.filter((r) => r.type === "etf").length;
  const stockCount = allRows.filter((r) => r.type === "stock").length;

  console.log(`\n💾 Upserting ${allRows.length} instruments (${etfCount} ETFs, ${stockCount} stocks)...`);

  const chunks: InstrumentRow[][] = [];
  for (let i = 0; i < allRows.length; i += UPSERT_BATCH_SIZE) {
    chunks.push(allRows.slice(i, i + UPSERT_BATCH_SIZE));
  }

  for (const [index, chunk] of chunks.entries()) {
    await upsertBatch(chunk);
    process.stdout.write(`   Batch ${index + 1}/${chunks.length} (${chunk.length} rows) ✓\n`);
  }

  // ── Summary ────────────────────────────────────────
  console.log("\n✅ Bootstrap complete!");
  console.log(`   Total instruments: ${allRows.length}`);
  console.log(`   ETFs: ${etfCount}`);
  console.log(`   Stocks: ${stockCount}`);
  console.log("\nNext step: run fundamentals sync to populate ETF metadata.");
  console.log("  npx tsx src/scripts/bootstrap-fundamentals.ts");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
