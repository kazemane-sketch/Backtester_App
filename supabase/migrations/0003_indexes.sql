create index if not exists instruments_symbol_idx on public.instruments (lower(symbol));
create index if not exists instruments_name_idx on public.instruments (lower(name));
create index if not exists instruments_exchange_idx on public.instruments (exchange);

create index if not exists portfolios_user_created_idx
on public.portfolios (user_id, created_at desc);

create index if not exists portfolio_assets_user_portfolio_idx
on public.portfolio_assets (user_id, portfolio_id);

create index if not exists backtest_runs_user_created_idx
on public.backtest_runs (user_id, created_at desc);

create index if not exists backtest_runs_status_idx
on public.backtest_runs (status);

create index if not exists backtest_results_summary_user_idx
on public.backtest_results_summary (user_id);

create index if not exists backtest_timeseries_run_t_idx
on public.backtest_timeseries (run_id, t);

create index if not exists backtest_timeseries_user_run_idx
on public.backtest_timeseries (user_id, run_id);

create index if not exists backtest_trades_run_trade_date_idx
on public.backtest_trades (run_id, trade_date);

create index if not exists backtest_trades_user_run_idx
on public.backtest_trades (user_id, run_id);
