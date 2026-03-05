create schema if not exists extensions;

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

alter table public.instruments
  add column if not exists type text not null default 'stock',
  add column if not exists search_document tsvector not null default ''::tsvector;

alter table public.instruments
  alter column provider set default 'EODHD';

update public.instruments
set symbol = provider_instrument_id
where provider_instrument_id is not null
  and symbol is distinct from provider_instrument_id;

update public.instruments
set type = case
  when lower(coalesce(metadata->>'type', '')) = 'etf' then 'etf'
  when lower(coalesce(type, '')) = 'etf' then 'etf'
  else 'stock'
end
where true;

alter table public.instruments
  drop constraint if exists instruments_type_check;

alter table public.instruments
  add constraint instruments_type_check
  check (type in ('stock', 'etf'));

create unique index if not exists instruments_provider_symbol_uidx
on public.instruments (provider, symbol);

create index if not exists instruments_symbol_plain_idx
on public.instruments (symbol);

create index if not exists instruments_isin_idx
on public.instruments (isin);

create index if not exists instruments_type_idx
on public.instruments (type);

create table if not exists public.etf_fundamentals (
  instrument_id uuid primary key references public.instruments(id) on delete cascade,
  index_name text,
  domicile text,
  category text,
  description text,
  updated_at_provider timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists etf_fundamentals_set_updated_at on public.etf_fundamentals;
create trigger etf_fundamentals_set_updated_at
before update on public.etf_fundamentals
for each row
execute function public.set_updated_at();

create table if not exists public.etf_country_weights (
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  country text not null,
  weight numeric(12,8) not null check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  primary key (instrument_id, country)
);

create table if not exists public.etf_region_weights (
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  region text not null,
  equity_pct numeric(12,8) not null check (equity_pct >= 0 and equity_pct <= 1),
  created_at timestamptz not null default now(),
  primary key (instrument_id, region)
);

create table if not exists public.etf_sector_weights (
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  sector text not null,
  equity_pct numeric(12,8) not null check (equity_pct >= 0 and equity_pct <= 1),
  created_at timestamptz not null default now(),
  primary key (instrument_id, sector)
);

create index if not exists etf_country_weights_country_weight_idx
on public.etf_country_weights (country, weight);

create index if not exists etf_region_weights_region_equity_idx
on public.etf_region_weights (region, equity_pct);

create index if not exists etf_sector_weights_sector_equity_idx
on public.etf_sector_weights (sector, equity_pct);

create table if not exists public.instrument_embeddings (
  instrument_id uuid primary key references public.instruments(id) on delete cascade,
  embedding extensions.vector(1536) not null,
  embedding_text text not null,
  model text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists instrument_embeddings_set_updated_at on public.instrument_embeddings;
create trigger instrument_embeddings_set_updated_at
before update on public.instrument_embeddings
for each row
execute function public.set_updated_at();

create index if not exists instrument_embeddings_hnsw
on public.instrument_embeddings
using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.refresh_instrument_search_document(p_instrument_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_symbol text;
  v_isin text;
  v_name text;
  v_type text;
  v_index_name text;
  v_category text;
  v_description text;
begin
  select i.symbol,
         i.isin,
         i.name,
         i.type,
         ef.index_name,
         ef.category,
         ef.description
    into v_symbol,
         v_isin,
         v_name,
         v_type,
         v_index_name,
         v_category,
         v_description
  from public.instruments i
  left join public.etf_fundamentals ef on ef.instrument_id = i.id
  where i.id = p_instrument_id;

  if not found then
    return;
  end if;

  update public.instruments i
  set search_document =
      setweight(to_tsvector('simple', coalesce(unaccent(v_symbol), '')), 'A')
      || setweight(to_tsvector('simple', coalesce(unaccent(v_isin), '')), 'A')
      || setweight(to_tsvector('simple', coalesce(unaccent(v_name), '')), 'B')
      || setweight(to_tsvector('simple', coalesce(unaccent(v_type), '')), 'C')
      || setweight(to_tsvector('simple', coalesce(unaccent(v_index_name), '')), 'A')
      || setweight(to_tsvector('simple', coalesce(unaccent(v_category), '')), 'B')
      || setweight(to_tsvector('simple', coalesce(unaccent(v_description), '')), 'C')
  where i.id = p_instrument_id;
end;
$$;

create or replace function public.instruments_refresh_search_document_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_instrument_search_document(new.id);
  return new;
end;
$$;

create or replace function public.etf_fundamentals_refresh_search_document_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_instrument_search_document(old.instrument_id);
    return old;
  end if;

  perform public.refresh_instrument_search_document(new.instrument_id);
  return new;
end;
$$;

drop trigger if exists instruments_refresh_search_document on public.instruments;
create trigger instruments_refresh_search_document
after insert or update of symbol, isin, name, type on public.instruments
for each row
execute function public.instruments_refresh_search_document_trigger();

drop trigger if exists etf_fundamentals_refresh_search_document on public.etf_fundamentals;
create trigger etf_fundamentals_refresh_search_document
after insert or update of index_name, category, description or delete on public.etf_fundamentals
for each row
execute function public.etf_fundamentals_refresh_search_document_trigger();

do $$
declare
  r record;
begin
  for r in select id from public.instruments loop
    perform public.refresh_instrument_search_document(r.id);
  end loop;
end;
$$;

create index if not exists instruments_search_document_gin_idx
on public.instruments
using gin (search_document);

create index if not exists instruments_name_trgm_idx
on public.instruments
using gin (lower(name) gin_trgm_ops);

create index if not exists etf_fundamentals_index_name_trgm_idx
on public.etf_fundamentals
using gin (lower(index_name) gin_trgm_ops);

create or replace view public.instrument_search_view as
select
  i.id as instrument_id,
  i.symbol,
  i.name,
  i.isin,
  i.type,
  i.exchange,
  i.currency,
  i.provider,
  ef.index_name,
  ef.domicile,
  ef.category,
  ef.description,
  i.search_document
from public.instruments i
left join public.etf_fundamentals ef on ef.instrument_id = i.id;

create or replace function public.match_instruments(
  query_embedding extensions.vector(1536),
  match_count int default 20,
  filter_type text default null
)
returns table(
  instrument_id uuid,
  symbol text,
  name text,
  isin text,
  type text,
  index_name text,
  domicile text,
  category text,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    i.id as instrument_id,
    i.symbol,
    i.name,
    i.isin,
    i.type,
    ef.index_name,
    ef.domicile,
    ef.category,
    (1 - (ie.embedding <=> query_embedding))::float as similarity
  from public.instrument_embeddings ie
  join public.instruments i on i.id = ie.instrument_id
  left join public.etf_fundamentals ef on ef.instrument_id = i.id
  where (filter_type is null or i.type = filter_type)
  order by ie.embedding <=> query_embedding asc
  limit greatest(1, least(match_count, 100));
$$;

create or replace function public.suggest_instruments(
  query_text text,
  requested_type text default null,
  limit_count int default 10
)
returns table(
  instrument_id uuid,
  symbol text,
  name text,
  isin text,
  type text,
  exchange text,
  currency text,
  index_name text,
  domicile text,
  category text,
  score float
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      nullif(trim(query_text), '') as q,
      lower(nullif(trim(query_text), '')) as q_lower,
      greatest(1, least(coalesce(limit_count, 10), 50)) as lim,
      requested_type as req_type
  ),
  candidates as (
    select
      i.id as instrument_id,
      i.symbol,
      i.name,
      i.isin,
      i.type,
      i.exchange,
      i.currency,
      ef.index_name,
      ef.domicile,
      ef.category,
      (
        case
          when lower(i.symbol) = p.q_lower then 120
          when lower(coalesce(i.isin, '')) = p.q_lower then 110
          when lower(i.symbol) like p.q_lower || '%' then 90
          when lower(coalesce(i.name, '')) like '%' || p.q_lower || '%' then 70
          when lower(coalesce(ef.index_name, '')) like '%' || p.q_lower || '%' then 75
          else 0
        end
      )
      + (
        ts_rank(
          i.search_document,
          websearch_to_tsquery('simple', unaccent(p.q))
        ) * 20
      )
      + (
        greatest(
          similarity(lower(i.symbol), p.q_lower),
          similarity(lower(coalesce(i.name, '')), p.q_lower),
          similarity(lower(coalesce(ef.index_name, '')), p.q_lower)
        ) * 10
      ) as score
    from params p
    join public.instruments i on true
    left join public.etf_fundamentals ef on ef.instrument_id = i.id
    where p.q is not null
      and (p.req_type is null or i.type = p.req_type)
      and (
        i.search_document @@ websearch_to_tsquery('simple', unaccent(p.q))
        or lower(i.symbol) like p.q_lower || '%'
        or lower(coalesce(i.name, '')) like '%' || p.q_lower || '%'
        or lower(coalesce(ef.index_name, '')) like '%' || p.q_lower || '%'
        or lower(coalesce(i.isin, '')) like p.q_lower || '%'
        or similarity(lower(coalesce(i.name, '')), p.q_lower) >= 0.2
        or similarity(lower(coalesce(ef.index_name, '')), p.q_lower) >= 0.2
      )
  )
  select
    c.instrument_id,
    c.symbol,
    c.name,
    c.isin,
    c.type,
    c.exchange,
    c.currency,
    c.index_name,
    c.domicile,
    c.category,
    c.score::float
  from candidates c
  order by c.score desc, c.symbol asc
  limit (select lim from params);
$$;

alter table public.etf_fundamentals enable row level security;
alter table public.etf_country_weights enable row level security;
alter table public.etf_region_weights enable row level security;
alter table public.etf_sector_weights enable row level security;
alter table public.instrument_embeddings enable row level security;

revoke all on function public.match_instruments(extensions.vector, int, text) from public;
revoke all on function public.suggest_instruments(text, text, int) from public;

grant execute on function public.match_instruments(extensions.vector, int, text) to service_role;
grant execute on function public.suggest_instruments(text, text, int) to service_role;
