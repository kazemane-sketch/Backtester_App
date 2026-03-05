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
- `supabase/migrations/0005_ingest_worker_infra.sql` (ingest job runs + sync state + prices_daily)

Se non usi CLI, esegui i file SQL in ordine nel SQL editor Supabase.

### Deploy DB migrations
Per deployare le migration sul progetto remoto usato dall'app:

```bash
supabase login
supabase link --project-ref <ref>
supabase db push
```

Dopo il push, ricarica la cache schema PostgREST:

```sql
NOTIFY pgrst, 'reload schema';
```

Oppure via script:

```bash
psql "$SUPABASE_DB_URL" -f scripts/reload_schema.sql
```

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
- `REDIS_URL` (Upstash redis:// per BullMQ)
- `UPSTASH_REDIS_REST_URL` (opzionale, health/ops)
- `UPSTASH_REDIS_REST_TOKEN` (opzionale, health/ops)
- `CRON_SECRET`

## Script npm
- `npm run dev` -> sviluppo locale
- `npm run build` -> build produzione
- `npm run start` -> run produzione locale
- `npm run lint` -> lint
- `npm run typecheck` -> type check TypeScript
- `npm run test` -> test Vitest
- `npm run worker:dev` -> avvia worker in sviluppo
- `npm run worker:build` -> build TypeScript worker
- `npm run worker:typecheck` -> typecheck worker

## Test
Esegui:
```bash
npm run lint
npm run typecheck
npm run test
npm run worker:typecheck
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
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL` (opzionale)
- `UPSTASH_REDIS_REST_TOKEN` (opzionale)
- `CRON_SECRET`
5. Deploy.

## Supabase redirect URLs per Vercel
Dopo il primo deploy, in Supabase aggiungi:
- Produzione: `https://<your-domain>/auth/callback`
- Vercel domain: `https://<project>.vercel.app/auth/callback`
- Preview wildcard: `https://*-<project>.vercel.app/auth/callback`

## Vercel Cron (Hobby)
- File: `vercel.json`
- Cron configurato: una chiamata **daily** a `GET /api/admin/enqueue` (`0 3 * * *` UTC).
- Protezione: Vercel invia `Authorization: Bearer ${CRON_SECRET}` automaticamente quando `CRON_SECRET` e impostato.
- Nota piano Hobby: frequenze > daily non sono supportate; per hourly passa a Vercel Pro o usa scheduler esterno.

## API disponibili
- `GET /api/instruments/search?q=...&provider=EODHD|YAHOO`
- `GET /api/instruments/suggest?q=...&type=etf|stock&limit=10`
- `POST /api/instruments/ai-search`
- `POST /api/backtests/run`
- `GET /api/backtests/:id`
- `POST /api/chat/strategy`
- `GET /api/health/rpc`

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

## Ingestion Worker Scaffold (Step 2.1)
- Nuovo servizio in `apps/worker` con:
- code BullMQ (`universeQueue`, `fundamentalsQueue`, `pricesQueue`, `embeddingsQueue`)
- client Supabase admin (`SUPABASE_SERVICE_ROLE_KEY`)
- client EODHD rate-limitato
- job scaffold con logging su `ingest_job_runs` e stato in `ingest_sync_state`
- supporto Upstash REST client per health ping, mentre BullMQ usa `REDIS_URL`.
- processing a chunk con `cursor` e auto-enqueue del chunk successivo fino a coprire l universo.

Setup locale worker:
```bash
cd apps/worker
npm install
npm run typecheck
npm run dev
```

## Operations (Worker + Queue)
### Bootstrap universe one-shot
```bash
curl -X POST "https://<your-domain>/api/admin/enqueue" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"job":"universe","mode":"full"}'
```

### Enqueue one-shot jobs
```bash
curl -X POST "https://<your-domain>/api/admin/enqueue" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"job":"fundamentals","mode":"delta"}'
```

```bash
curl -X POST "https://<your-domain>/api/admin/enqueue" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"job":"prices","mode":"delta"}'
```

```bash
curl -X POST "https://<your-domain>/api/admin/enqueue" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"job":"embeddings","mode":"delta"}'
```

### Run worker forever (local/VM)
```bash
npm run worker:dev
```

### Monitor ingest jobs
```sql
select id, job_name, status, started_at, finished_at, attempts, error
from public.ingest_job_runs
order by started_at desc
limit 100;
```

### Monitor sync state
```sql
select key, value, updated_at
from public.ingest_sync_state
order by updated_at desc;
```

### Rate-limit operations
- Worker usa throttling EODHD (min interval globale richieste) + retry/backoff BullMQ.
- Se ricevi 429/403 frequenti:
- riduci `WORKER_CONCURRENCY`
- aumenta cadenza scheduler per batch pesanti
- limita `chunkSize` nei job enqueue

## Deploy Worker (always-on)
### Docker build/run
```bash
cd apps/worker
docker build -t portfolio-backtester-worker .
docker run --rm \
  -e SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -e EODHD_API_KEY="$EODHD_API_KEY" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e REDIS_URL="$REDIS_URL" \
  -e UPSTASH_REDIS_REST_URL="$UPSTASH_REDIS_REST_URL" \
  -e UPSTASH_REDIS_REST_TOKEN="$UPSTASH_REDIS_REST_TOKEN" \
  -e WORKER_CONCURRENCY="5" \
  -e LOG_LEVEL="info" \
  portfolio-backtester-worker
```

### Fly.io / Render / VM
- Deploya `apps/worker/Dockerfile` come service separato always-on.
- Setta env runtime:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EODHD_API_KEY`
- `OPENAI_API_KEY`
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL` (opzionale)
- `UPSTASH_REDIS_REST_TOKEN` (opzionale)
- `WORKER_CONCURRENCY`
- `LOG_LEVEL`
- Healthcheck: usa heartbeat log del worker (1/min) o endpoint dedicato se vuoi aggiungerlo.

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
