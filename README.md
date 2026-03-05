# Portfolio Backtester

SaaS web app per creare, eseguire e analizzare backtest di portafogli multi-asset con:
- Next.js App Router + TypeScript
- Supabase (Auth + Postgres + RLS)
- Vercel deploy
- OpenAI API server-side per compilazione AI del `BacktestConfig`

## Features MVP (Fase 1)
- Magic link auth (Supabase)
- Dashboard privata con run recenti
- Wizard backtest (Assets -> Pesi -> Regole -> Benchmark -> Run)
- Search strumenti con provider abstraction (`MarketDataProvider`)
- Provider default EODHD, Yahoo predisposto come stub (non attivo in build MVP)
- Backtest engine server-side con:
  - equity curve
  - returns giornalieri
  - drawdown
  - trade log
  - fees
  - metriche (CAGR, vol ann., Sharpe rf=0, max DD, Calmar, total return)
- Persistenza run, summary, timeseries, trades in Supabase
- UI risultati con Recharts
- AI chat in-app che produce solo JSON `BacktestConfig` validato Zod

## Prerequisiti
- Node.js 20+
- npm 10+
- Account Supabase
- Account Vercel
- API key EODHD
- API key OpenAI

## Setup locale
1. Clona il repository:
```bash
git clone <YOUR_GITHUB_REPO_URL>
cd Backtester_App
```

2. Installa dipendenze:
```bash
npm install
```

3. Crea il file env:
```bash
cp .env.example .env.local
```

4. Compila `.env.local` con valori reali.

5. Avvia in locale:
```bash
npm run dev
```

App su `http://localhost:3000`.

## Configurazione Supabase

### 1) Crea progetto Supabase
- Da dashboard Supabase: New project
- Recupera da `Project Settings -> API`:
  - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` -> `SUPABASE_SERVICE_ROLE_KEY`

### 2) Applica migrations
Opzione consigliata con Supabase CLI:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Le migration sono in:
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_rls_policies.sql`
- `supabase/migrations/0003_indexes.sql`
- `supabase/migrations/0004_smart_instrument_search.sql` (pgvector + smart search index + RPC)

Se non usi CLI, esegui i file SQL in ordine nel SQL editor Supabase.

### 3) Configura Auth (Magic Link)
In Supabase `Authentication -> URL Configuration` imposta:
- Site URL locale: `http://localhost:3000`
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://<your-production-domain>/auth/callback`
  - `https://<your-vercel-project>.vercel.app/auth/callback`
  - `https://*-<your-vercel-project>.vercel.app/auth/callback` (preview)

## Environment variables
Usa queste variabili:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo server)
- `EODHD_API_KEY`
- `OPENAI_API_KEY`

## Script npm
- `npm run dev` -> sviluppo locale
- `npm run build` -> build produzione
- `npm run start` -> run produzione locale
- `npm run lint` -> lint
- `npm run typecheck` -> type check TypeScript
- `npm run test` -> test Vitest

## Test
Esegui:
```bash
npm run lint
npm run typecheck
npm run test
```

Suite minima inclusa:
- unit test schema `BacktestConfig`
- unit test motore backtest
- test API route base con mocking

## Deploy su Vercel (GitHub integration)
1. Pusha il repo su GitHub.
2. In Vercel: New Project -> Import repository.
3. Framework preset: Next.js.
4. Aggiungi env vars in `Project Settings -> Environment Variables`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EODHD_API_KEY`
- `OPENAI_API_KEY`
5. Deploy.

## Supabase redirect URLs per Vercel
Dopo il primo deploy, in Supabase aggiungi:
- Produzione: `https://<your-domain>/auth/callback`
- Vercel domain: `https://<project>.vercel.app/auth/callback`
- Preview wildcard: `https://*-<project>.vercel.app/auth/callback`

## API disponibili
- `GET /api/instruments/search?q=...&provider=EODHD|YAHOO`
- `GET /api/instruments/suggest?q=...&type=etf|stock&limit=10`
- `POST /api/instruments/ai-search`
- `POST /api/backtests/run`
- `GET /api/backtests/:id`
- `POST /api/chat/strategy`

## Smart Instrument Search (Step 1)
- Estensioni abilitate: `vector`, `pg_trgm`, `unaccent`.
- Tabelle nuove:
- `etf_fundamentals`
- `etf_country_weights`
- `etf_region_weights`
- `etf_sector_weights`
- `instrument_embeddings`
- RPC disponibili:
- `public.suggest_instruments(query_text, requested_type, limit_count)`
- `public.match_instruments(query_embedding, match_count, filter_type)`
- `instrument_embeddings` usa indice HNSW cosine su `vector(1536)`.
- Il client non legge tabelle strumenti direttamente: usa solo API `/api/instruments/*` server-side.

## BacktestConfig (single source of truth)
Definito in `lib/schemas/backtest-config.ts` (Zod + TypeScript).
Usato da:
- wizard UI
- endpoint run
- endpoint chat AI

## Missing data policy (MVP)
Nel motore daily:
- niente interpolazione lineare (anti-lookahead).
- forward-fill solo con dati passati (LOCF) fino a max `3` giorni.
- se un asset resta stale oltre soglia: quel giorno viene escluso dal calendario comune del run.
- il benchmark non decide il calendario del portafoglio: viene solo allineato passivamente alle date gia valide degli asset.

## Provider note (Yahoo)
- `YAHOO` è mantenuto nell'astrazione e nello schema.
- In questa build MVP è disabilitato runtime (`throw`) per evitare problemi di affidabilità/bundling.
- Usa `EODHD` come provider operativo.

## RLS
Tabelle utente-proprietario con policy `user_id = auth.uid()`:
- `portfolios`
- `portfolio_assets`
- `backtest_runs`
- `backtest_results_summary`
- `backtest_timeseries`
- `backtest_trades`

`instruments` e condivisa in lettura per utenti autenticati.

Tabelle smart-search (`etf_*`, `instrument_embeddings`) hanno RLS attivo e sono accessibili solo via service role nelle API server-side.

## Acceptance Criteria MVP
- [ ] Login magic link funzionante
- [ ] Area privata protetta via middleware
- [ ] Wizard completo validato Zod
- [ ] Search strumenti con cache DB + memory
- [ ] Backtest server-side con persistenza run/summary/timeseries/trades
- [ ] Risultati con equity vs benchmark, drawdown, metriche, trade log, config
- [ ] AI chat produce JSON `BacktestConfig` valido e auto-fill wizard
- [ ] RLS attivo e verificato
- [ ] `lint`, `typecheck`, `test` verdi
- [ ] Deploy Vercel + redirect Supabase prod/preview corretti

## Troubleshooting
- Login non completa:
  - verifica `SITE_URL` e Redirect URLs in Supabase
  - verifica route callback `/auth/callback`
- Errore 401 API:
  - utente non autenticato o cookie sessione mancante
- Errore provider market data:
  - verifica `EODHD_API_KEY`
  - controlla eventuali limiti/rate limit del provider
- Errore AI chat:
  - verifica `OPENAI_API_KEY`
  - controlla limiti account/model access
- Errore RLS in insert/select:
  - conferma migration applicate e policy attive
