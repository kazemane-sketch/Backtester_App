create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.instruments (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  isin text,
  name text not null,
  exchange text not null,
  currency text not null,
  provider text not null check (provider in ('EODHD', 'YAHOO')),
  provider_instrument_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_instrument_id)
);

create trigger instruments_set_updated_at
before update on public.instruments
for each row
execute function public.set_updated_at();

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger portfolios_set_updated_at
before update on public.portfolios
for each row
execute function public.set_updated_at();

create table if not exists public.portfolio_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id),
  weight numeric(9,4) not null check (weight >= 0 and weight <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, instrument_id)
);

create trigger portfolio_assets_set_updated_at
before update on public.portfolio_assets
for each row
execute function public.set_updated_at();

create table if not exists public.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  name text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  config jsonb not null,
  data_provider text not null check (data_provider in ('EODHD', 'YAHOO')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create trigger backtest_runs_set_updated_at
before update on public.backtest_runs
for each row
execute function public.set_updated_at();

create table if not exists public.backtest_results_summary (
  run_id uuid primary key references public.backtest_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_return numeric(20,8) not null,
  cagr numeric(20,8) not null,
  volatility_ann numeric(20,8) not null,
  sharpe numeric(20,8) not null,
  max_drawdown numeric(20,8) not null,
  calmar numeric(20,8) not null,
  total_fees numeric(20,8) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger backtest_results_summary_set_updated_at
before update on public.backtest_results_summary
for each row
execute function public.set_updated_at();

create table if not exists public.backtest_timeseries (
  id bigserial primary key,
  run_id uuid not null references public.backtest_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  t date not null,
  portfolio_value numeric(20,8) not null,
  benchmark_value numeric(20,8),
  daily_return numeric(20,8) not null,
  drawdown numeric(20,8) not null,
  created_at timestamptz not null default now(),
  unique (run_id, t)
);

create table if not exists public.backtest_trades (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backtest_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_date date not null,
  instrument_id uuid references public.instruments(id),
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(20,8) not null,
  price numeric(20,8) not null,
  gross_amount numeric(20,8) not null,
  fee_amount numeric(20,8) not null,
  created_at timestamptz not null default now()
);
