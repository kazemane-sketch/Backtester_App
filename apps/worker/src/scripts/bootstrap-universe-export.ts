/**
 * Fetches ETF universe from EODHD and writes to a JSON file.
 * Data will be inserted to Supabase separately via MCP SQL tools.
 *
 * Usage:
 *   EODHD_API_KEY=... npx tsx src/scripts/bootstrap-universe-export.ts
 */

import { writeFileSync } from "node:fs";

const EODHD_API_KEY = process.env.EODHD_API_KEY;
if (!EODHD_API_KEY) {
  console.error("Missing EODHD_API_KEY");
  process.exit(1);
}

const ETF_EXCHANGES = ["US", "LSE", "XETRA", "PA", "MI", "AS", "SW", "MC", "BR", "F", "TO"];
const RATE_LIMIT_MS = 300;

type ExchangeSymbol = {
  Code?: string;
  Name?: string;
  Country?: string;
  Exchange?: string;
  Currency?: string;
  Type?: string;
  Isin?: string;
};

type InstrumentRow = {
  symbol: string;
  type: "etf";
  isin: string | null;
  name: string;
  exchange: string;
  currency: string;
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchExchangeSymbols(exchange: string): Promise<ExchangeSymbol[]> {
  const url = new URL(`https://eodhd.com/api/exchange-symbol-list/${encodeURIComponent(exchange)}`);
  url.searchParams.set("api_token", EODHD_API_KEY!);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("type", "etf");

  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`EODHD ${res.status} for ${exchange}`);

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function main() {
  console.log("🚀 Fetching ETF universe from EODHD...\n");

  const seen = new Map<string, InstrumentRow>();

  for (const exchange of ETF_EXCHANGES) {
    try {
      process.stdout.write(`   ${exchange.padEnd(8)} → `);
      const items = await fetchExchangeSymbols(exchange);

      let added = 0;
      for (const item of items) {
        const code = item.Code?.trim();
        if (!code) continue;

        const itemExchange = item.Exchange?.trim() || exchange;
        const sym = `${code}.${itemExchange}`;

        if (!seen.has(sym)) {
          seen.set(sym, {
            symbol: sym,
            type: "etf",
            isin: item.Isin?.trim() || null,
            name: (item.Name?.trim() || code).replace(/'/g, "''"),
            exchange: itemExchange,
            currency: item.Currency?.trim() || "USD"
          });
          added++;
        }
      }

      console.log(`${items.length} fetched, ${added} new (total: ${seen.size})`);
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const all = [...seen.values()];
  const outPath = "/tmp/etf-universe.json";
  writeFileSync(outPath, JSON.stringify(all, null, 0));
  console.log(`\n✅ Exported ${all.length} ETFs to ${outPath}`);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
