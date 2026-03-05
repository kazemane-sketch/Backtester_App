# Fix RPC `suggest_instruments` on Remote Supabase

Esegui questi comandi dalla root del repo.

## 1) Login CLI

```bash
supabase login
```

## 2) Link al progetto corretto

```bash
supabase link --project-ref <PROJECT_REF>
```

`<PROJECT_REF>` deve corrispondere al progetto usato in produzione dall'app (`NEXT_PUBLIC_SUPABASE_URL`).

## 3) Applica migrations sul DB remoto

```bash
supabase db push
```

## 4) Refresh schema cache PostgREST

```sql
NOTIFY pgrst, 'reload schema';
```

Puoi eseguirlo con SQL Editor Supabase oppure via `psql` se hai una connection string:

```bash
psql "$SUPABASE_DB_URL" -f scripts/reload_schema.sql
```

## 5) Verifica che la funzione esista con firma corretta

```bash
psql "$SUPABASE_DB_URL" -f scripts/verify_rpc.sql
```

Devi vedere `public.suggest_instruments` con identity args:

```text
limit_count integer, query_text text, requested_type text
```
