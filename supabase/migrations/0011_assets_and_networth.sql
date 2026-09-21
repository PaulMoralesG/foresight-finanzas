-- ============================================================
-- Foresight Finanzas — Migración 0011
--   Patrimonio (fase 3.3, referencia: Balance Dual `assets` y `networth`).
--
--   (a) `assets`: activos registrados a mano (vehículos, inversiones,
--       propiedades), agrupados en Inversiones / Propiedades / Otros activos.
--   (b) `networth`: cierre mensual del patrimonio (activos, pasivos, neto),
--       una fila por mes y usuario. El cliente lo guarda solo cuando cambia
--       (src/hooks/useNetWorthSnapshot.ts); así la curva histórica se arma
--       sin copiar saldos a mano.
--
-- Aplicar ANTES de desplegar el cliente que la usa. Mismo patrón que la
-- 0009/0010: RLS con (select auth.uid()), grant explícito y keep_newest.
-- ============================================================

-- ── (a) assets ──
create table if not exists public.assets (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  name        text not null check (length(name) between 1 and 80),
  tag         text not null check (tag in ('personal','business')),
  "group"     text not null check ("group" in ('Inversiones','Propiedades','Otros activos')),
  value       numeric(14,2) not null default 0 check (value >= 0),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);
comment on table public.assets is 'Activos manuales del usuario: lo que la app no ve en las cuentas.';
alter table public.assets enable row level security;
drop policy if exists assets_owner_all on public.assets;
create policy assets_owner_all on public.assets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.assets to authenticated;
drop trigger if exists assets_keep_newest on public.assets;
create trigger assets_keep_newest before update on public.assets
  for each row execute function public.keep_newest();

-- ── (b) networth ──
create table if not exists public.networth (
  user_id      uuid not null references auth.users (id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  assets       numeric(14,2) not null default 0,
  liabilities  numeric(14,2) not null default 0,
  net          numeric(14,2) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, month)
);
comment on table public.networth is 'Cierre mensual del patrimonio (activos, pasivos, neto), calculado por el cliente.';
alter table public.networth enable row level security;
drop policy if exists networth_owner_all on public.networth;
create policy networth_owner_all on public.networth
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.networth to authenticated;
drop trigger if exists networth_keep_newest on public.networth;
create trigger networth_keep_newest before update on public.networth
  for each row execute function public.keep_newest();

-- Verificación:
--   select tablename, policyname, cmd from pg_policies where tablename in ('assets','networth');
