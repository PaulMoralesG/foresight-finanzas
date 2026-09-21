-- ============================================================
-- Foresight Finanzas — Migración 0012
--   Presupuesto por categoría (fase 3.4, referencia: Balance Dual `budgets`).
--
--   `budget_lines`: una línea por (ámbito, tipo, categoría) con un límite
--   base mensual y un plan por mes ('YYYY-MM' → monto) en jsonb, que es
--   lo que edita la vista "Plan 12 meses".
--
--   La tabla `budgets` (presupuesto global por mes) se CONSERVA: el
--   cliente la sigue sincronizando para no romper a un cliente viejo, y
--   la migración de estado v12 del cliente reparte ese presupuesto global
--   entre categorías (en proporción al gasto real) al arrancar. Retirarla
--   es una decisión aparte, cuando todos los clientes estén en la 3.4.
--
--   Además, `categories` gana la columna `group` (nullable): el grupo de
--   una categoría personalizada. Las categorías por defecto tienen el suyo
--   en el cliente (src/config/categories.ts).
--
-- Aplicar ANTES de desplegar. Mismo patrón que la 0009–0011.
-- ============================================================

alter table public.categories add column if not exists "group" text
  check ("group" is null or length("group") between 1 and 60);

create table if not exists public.budget_lines (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null,
  tag          text not null check (tag in ('personal','business')),
  kind         text not null check (kind in ('income','expense')),
  category_id  text not null check (length(category_id) between 1 and 80),
  "limit"      numeric(14,2) not null default 0 check ("limit" >= 0),
  plan         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);
comment on table public.budget_lines is
  'Presupuesto por categoría: límite base mensual y plan por mes (jsonb). Sustituye en la UI al presupuesto global de `budgets`.';
alter table public.budget_lines enable row level security;
drop policy if exists budget_lines_owner_all on public.budget_lines;
create policy budget_lines_owner_all on public.budget_lines
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.budget_lines to authenticated;
drop trigger if exists budget_lines_keep_newest on public.budget_lines;
create trigger budget_lines_keep_newest before update on public.budget_lines
  for each row execute function public.keep_newest();
