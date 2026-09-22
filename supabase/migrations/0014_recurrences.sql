-- ============================================================
-- Foresight Finanzas — Migración 0014
--   Movimientos recurrentes (fase 4).
--
--   `recurrences`: la plantilla de un movimiento que se repite (la renta,
--   el sueldo, una suscripción) más la regla que dice cuándo toca. El
--   cliente la materializa en filas de `expenses` con un id determinista
--   —UUID v5 de (regla, fecha)—, así que dos dispositivos que generen la
--   misma ocurrencia producen la misma fila y el merge las colapsa en vez
--   de duplicarlas.
--
--   `ultima_generada` es la marca de agua de la regla: la última fecha ya
--   materializada. Viaja con la regla para que un segundo dispositivo no
--   repita el trabajo.
--
--   `expenses` gana `recurrence_id` (nullable): de qué regla salió cada
--   movimiento. Sin referencia a `recurrences` a propósito — borrar la
--   regla no debe borrar el historial ya registrado.
--
-- Aplicar ANTES de desplegar el cliente que la usa: el pull consulta
-- `recurrences` y, si la tabla no existe, el sync entero cae a modo local.
-- Mismo patrón que la 0009–0012.
-- ============================================================

alter table public.expenses add column if not exists recurrence_id text
  check (recurrence_id is null or length(recurrence_id) between 1 and 80);

create table if not exists public.recurrences (
  user_id         uuid not null references auth.users (id) on delete cascade,
  id              text not null,
  -- Plantilla del movimiento
  type            text not null check (type in ('income','expense','transfer')),
  amount          numeric(14,2) not null default 0 check (amount >= 0),
  concept         text not null default '' check (length(concept) <= 120),
  category        text not null default 'general' check (length(category) between 1 and 80),
  method          text not null check (method in ('cash','card','transfer')),
  business_type   text not null check (business_type in ('personal','business')),
  account_id      text,
  to_account_id   text,
  -- Regla
  frecuencia      text not null check (frecuencia in ('daily','weekly','monthly')),
  intervalo       integer not null default 1 check (intervalo between 1 and 365),
  dia_mes         integer check (dia_mes is null or dia_mes between 1 and 31),
  desde           date not null,
  hasta           date,
  activa          boolean not null default true,
  ultima_generada date,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  primary key (user_id, id)
);
comment on table public.recurrences is
  'Plantillas de movimientos que se repiten (diario/semanal/mensual). El cliente las materializa en expenses con ids deterministas.';

create index if not exists recurrences_user_updated_idx
  on public.recurrences (user_id, updated_at desc);

alter table public.recurrences enable row level security;
drop policy if exists recurrences_owner_all on public.recurrences;
create policy recurrences_owner_all on public.recurrences
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- La 0004 revocó los privilegios por defecto: sin este grant, PostgREST
-- responde 42501 aunque la política exista.
grant select, insert, update, delete on public.recurrences to authenticated;
drop trigger if exists recurrences_keep_newest on public.recurrences;
create trigger recurrences_keep_newest before update on public.recurrences
  for each row execute function public.keep_newest();

-- Verificación:
--   select tablename, policyname, cmd from pg_policies where tablename = 'recurrences';
--   select column_name, data_type from information_schema.columns where table_name = 'recurrences';
