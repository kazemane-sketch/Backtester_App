alter table public.instruments enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_assets enable row level security;
alter table public.backtest_runs enable row level security;
alter table public.backtest_results_summary enable row level security;
alter table public.backtest_timeseries enable row level security;
alter table public.backtest_trades enable row level security;

create policy "Authenticated users can read instruments"
on public.instruments
for select
using (auth.role() = 'authenticated');

create policy "Users manage own portfolios"
on public.portfolios
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own portfolio assets"
on public.portfolio_assets
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own backtest runs"
on public.backtest_runs
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own backtest summary"
on public.backtest_results_summary
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own backtest timeseries"
on public.backtest_timeseries
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own backtest trades"
on public.backtest_trades
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());
