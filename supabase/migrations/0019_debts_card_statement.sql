-- ============================================================
-- Foresight Finanzas — Migración 0019
--   Estado de cuenta de tarjetas: día de corte, pago de contado y cupo.
--
--   Solo tienen sentido en deudas «Tarjeta de crédito» y son opcionales:
--     cut_day            día de corte del mes (1–31)
--     statement_balance  pago de contado del corte actual (lo que evita intereses)
--     credit_limit       cupo total (→ cupo disponible y % de uso)
--
--   Nullable y sin default, como el resto de columnas de negocio (0017): el
--   upsert de un borrado solo manda identidad + timestamps.
--
--   ORDEN: aplicar ANTES de desplegar el cliente que las manda (sin ellas,
--   PostgREST responde 42703 y el cliente desactiva el sync).
--
--   Verificación: 3 filas, todas nullable.
--     select column_name, data_type, is_nullable from information_schema.columns
--     where table_schema = 'public' and table_name = 'debts'
--       and column_name in ('cut_day', 'statement_balance', 'credit_limit');
-- ============================================================

alter table public.debts
  add column if not exists cut_day smallint check (cut_day between 1 and 31),
  add column if not exists statement_balance numeric(14,2) check (statement_balance >= 0),
  add column if not exists credit_limit numeric(14,2) check (credit_limit >= 0);
