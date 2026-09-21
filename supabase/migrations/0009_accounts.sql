-- ============================================================
-- Foresight Finanzas — Migración 0009
--   Cuentas (fase 3.1, referencia: Balance Dual `accounts`).
--
--   (a) Tabla `accounts`: nombre, tipo y saldo inicial. El saldo actual se
--       deriva en el cliente (saldo inicial + movimientos), no se guarda.
--   (b) `expenses`: dos columnas nuevas, `account_id` y `to_account_id`, y
--       el tipo `transfer` en el CHECK de `type`. Una transferencia mueve
--       dinero entre dos cuentas sin contar como gasto ni ingreso.
--
-- Aplicar ANTES de desplegar el cliente que la usa: el cliente nuevo hace
-- pull de `accounts` en cada ciclo y, sin la tabla, cae a modo local-only
-- (42P01) hasta que exista.
--
-- Sin FK de expenses.account_id hacia accounts: el push sube las tablas
-- en orden fijo (expenses antes que accounts) y una FK rechazaría el
-- movimiento cuya cuenta aún no llegó. La coherencia la garantiza el
-- cliente (no deja borrar una cuenta con movimientos).
-- ============================================================

-- ── (a) accounts ──
create table if not exists public.accounts (
  user_id          uuid not null references auth.users (id) on delete cascade,
  id               text not null,
  name             text not null check (length(name) between 1 and 80),
  kind             text not null check (kind in ('Efectivo','Banco','Tarjeta','Ahorros')),
  initial_balance  numeric(14,2) not null default 0,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  primary key (user_id, id)
);

comment on table public.accounts is
  'Cuentas del usuario (Efectivo, Banco, Tarjeta, Ahorros). Saldo = initial_balance + movimientos; se calcula en el cliente.';

alter table public.accounts enable row level security;

drop policy if exists accounts_owner_all on public.accounts;
create policy accounts_owner_all on public.accounts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- La 0004 revocó los privilegios por defecto a anon/authenticated en tablas
-- nuevas: sin este grant PostgREST responde 42501 aunque la política exista.
grant select, insert, update, delete on public.accounts to authenticated;

-- Mismo trigger que el resto de entidades: el servidor descarta escrituras
-- más viejas que la fila actual (keep_newest, migración 0004/0007).
drop trigger if exists accounts_keep_newest on public.accounts;
create trigger accounts_keep_newest before update on public.accounts
  for each row execute function public.keep_newest();

-- ── (b) expenses: cuenta y transferencias ──
alter table public.expenses add column if not exists account_id    text;
alter table public.expenses add column if not exists to_account_id text;

alter table public.expenses drop constraint if exists expenses_type_check;
alter table public.expenses add constraint expenses_type_check
  check (type in ('income','expense','transfer'));

-- Verificación:
--   select policyname, cmd from pg_policies where tablename = 'accounts';
--   select column_name from information_schema.columns
--     where table_name = 'expenses' and column_name in ('account_id','to_account_id');
