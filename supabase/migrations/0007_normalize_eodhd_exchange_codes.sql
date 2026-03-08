-- Normalize EODHD exchange codes: "NYSE ARCA"/"NASDAQ"/"BATS"/etc. → "US"
--
-- The EODHD search API sometimes returns full exchange names
-- (e.g. "NYSE ARCA", "NASDAQ", "BATS") but the price API (/eod/)
-- expects short codes ("US" for all US exchanges).
--
-- Strategy:
-- 1. Delete "wrong" duplicates where a "correct" .US version already exists
-- 2. Update the remaining wrong entries to use .US

DO $$
DECLARE
  us_exchanges text[] := ARRAY['NYSE ARCA', 'NYSE', 'NASDAQ', 'BATS', 'AMEX', 'NYSE MKT', 'PINK', 'OTC', 'NMFQS'];
BEGIN
  -- Step 1: Delete wrong-exchange entries where a correct .US version already exists
  DELETE FROM instruments
  WHERE provider = 'EODHD'
    AND exchange = ANY(us_exchanges)
    AND EXISTS (
      SELECT 1 FROM instruments AS correct
      WHERE correct.provider = 'EODHD'
        AND correct.provider_instrument_id = split_part(instruments.provider_instrument_id, '.', 1) || '.US'
    );

  -- Step 2: Update remaining wrong entries to .US
  UPDATE instruments
  SET
    exchange = 'US',
    symbol = split_part(symbol, '.', 1) || '.US',
    provider_instrument_id = split_part(provider_instrument_id, '.', 1) || '.US'
  WHERE provider = 'EODHD'
    AND exchange = ANY(us_exchanges);
END $$;
