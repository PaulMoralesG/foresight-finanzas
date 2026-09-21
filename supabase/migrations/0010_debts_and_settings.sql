-- ============================================================
-- Foresight Finanzas — Migración 0010
--   Deudas y ajustes (fase 3.2, referencia: Balance Dual `debts` y `meta/settings`).
--
--   (a) `debts`: nombre, ámbito (personal/negocio), tipo, saldo, interés
--       anual, pago mínimo y día de pago. El plan (bola de nieve /
--       avalancha) se calcula en el cliente (src/lib/debts.ts).
--   (b) `settings`: una fila por usuario con el método de deuda, el aporte
--       extra mensual y la meta de patrimonio (esta última la usa la 3.3).
--       El más nuevo gana (keep_newest + updated_at del cliente).
--
-- Aplicar ANTES de desplegar el cliente que la usa (hace pull de las dos).
-- Mismo patrón que la 0009: RLS con (select auth.uid()), grant explícito
-- por la 0004 y trigger keep_newest.
-- ============================================================

-- ── (a) debts ──
create table if not exists public.debts (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null,
  name         text not null check (length(name) between 1 and 80),
  tag          text not null check (tag in ('personal','business')),
  kind         text not null check (kind in ('Tarjeta de crédito','Préstamo','Hipoteca','Otro')),
  balance      numeric(14,2) not null default 0 check (balance >= 0),
  annual_rate  numeric(6,2)  not null default 0 check (annual_rate >= 0),
  min_payment  numeric(14,2) not null default 0 check (min_payment >= 0),
  pay_day      smallint check (pay_day is null or (pay_day between 1 and 31)),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

comment on table public.debts is
  'Deudas del usuario. La proyección (bola de nieve / avalancha) se calcula en el cliente.';

alter table public.debts enable row level security;
drop policy if exists debts_owner_all on public.debts;
create policy debts_owner_all on public.debts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.debts to authenticated;
drop trigger if exists debts_keep_newest on public.debts;
create trigger debts_keep_newest before update on public.debts
  for each row execute function public.keep_newest();

-- ── (b) settings ──
create table if not exists public.settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  debt_method     text not null default 'snowball' check (debt_method in ('snowball','avalanche')),
  extra_payment   numeric(14,2) not null default 0 check (extra_payment >= 0),
  net_worth_goal  numeric(14,2) not null default 0 check (net_worth_goal >= 0),
  updated_at      timestamptz not null default now()
);

comment on table public.settings is
  'Ajustes sincronizados (una fila por usuario): método de pago de deudas, aporte extra y meta de patrimonio.';

alter table public.settings enable row level security;
drop policy if exists settings_owner_all on public.settings;
create policy settings_owner_all on public.settings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.settings to authenticated;
drop trigger if exists settings_keep_newest on public.settings;
create trigger settings_keep_newest before update on public.settings
  for each row execute function public.keep_newest();

-- Verificación:
--   select tablename, policyname, cmd from pg_policies where tablename in ('debts','settings');
