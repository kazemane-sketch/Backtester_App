drop function if exists public.suggest_instruments(text, text, int);

create or replace function public.suggest_instruments(
  limit_count int,
  query_text text,
  requested_type text
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
      nullif(trim(requested_type), '') as req_type
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

revoke all on function public.suggest_instruments(int, text, text) from public;
grant execute on function public.suggest_instruments(int, text, text) to service_role;
