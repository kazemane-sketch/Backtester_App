create extension if not exists pgcrypto;

create table if not exists public.ingest_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('queued', 'running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  meta jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ingest_job_runs_job_name_started_idx
on public.ingest_job_runs (job_name, started_at desc);

create table if not exists public.ingest_sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.prices_daily (
  id bigserial primary key,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  provider text not null default 'EODHD' check (provider in ('EODHD', 'YAHOO')),
  date date not null,
  open numeric(20,8),
  high numeric(20,8),
  low numeric(20,8),
  close numeric(20,8),
  adj_close numeric(20,8),
  volume bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instrument_id, date)
);

drop trigger if exists prices_daily_set_updated_at on public.prices_daily;
create trigger prices_daily_set_updated_at
before update on public.prices_daily
for each row
execute function public.set_updated_at();

create index if not exists prices_daily_instrument_date_idx
on public.prices_daily (instrument_id, date desc);

create index if not exists prices_daily_date_idx
on public.prices_daily (date);

alter table public.ingest_job_runs enable row level security;
alter table public.ingest_sync_state enable row level security;
alter table public.prices_daily enable row level security;
