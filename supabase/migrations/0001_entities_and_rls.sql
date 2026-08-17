-- ============================================================
-- Foresight Finanzas — Tablas por entidad + RLS + profiles por auth.uid
-- Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase, en orden.
-- La migración de DATOS (blobs JSON de profiles) la hace el cliente
-- automáticamente en el primer login post-migración (import idempotente).
-- ============================================================

-- ⚠️ Si el nombre real de la PK vieja de profiles difiere de `profiles_pkey`,
-- verificarlo antes con:
--   select conname from pg_constraint where conrelid = 'public.profiles'::regclass;
-- y ajustar el `drop constraint` más abajo.

-- ── 1) PROFILES: id uuid = auth.uid(), backfill por email ──

alter table public.profiles add column if not exists id uuid;

update public.profiles p
set id = u.id
from auth.users u
where lower(p.email) = lower(u.email)
  and p.id is null;

-- Filas huérfanas (sin usuario en auth.users): no las adopta nadie, se eliminan
delete from public.profiles where id is null;

-- Reemplazar PK vieja (email) por id
alter table public.profiles
  drop constraint if exists profiles_pkey,
  drop constraint if exists profiles_email_key;

alter table public.profiles add column if not exists legacy_imported boolean not null default false;

-- Las columnas legacy quedan para el import client-side; relajamos NOT NULL
-- para que el trigger de abajo pueda insertar solo (id, email).
alter table public.profiles alter column first_name drop not null;
alter table public.profiles alter column last_name  drop not null;
alter table public.profiles alter column budgets    drop not null;
alter table public.profiles alter column expenses   drop not null;
alter table public.profiles alter column reminders  drop not null;
alter table public.profiles alter column savings_goal drop not null;
alter table public.profiles alter column custom_expense_categories drop not null;
alter table public.profiles alter column custom_income_categories drop not null;
alter table public.profiles alter column last_synced_at drop not null;

alter table public.profiles alter column id set not null;
alter table public.profiles add primary key (id);
-- email queda como columna normal (el cliente viejo la usa durante la transición)

-- Trigger: perfil automático al crear usuario (security definer → RLS no lo bloquea)
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do update set
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name  = coalesce(public.profiles.last_name, excluded.last_name);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2) EXPENSES ──
-- Columnas de negocio NULLABLE: los upserts de tombstone solo llevan
-- identidad + timestamps (id, user_id, updated_at, deleted_at).
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  type          text check (type in ('income','expense')),
  amount        numeric(14,2),
  concept       text,
  date          date,
  category      text,
  method        text check (method in ('cash','card','transfer')),
  business_type text check (business_type in ('business','personal')),
  created_at    timestamptz,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists expenses_user_updated_idx on public.expenses (user_id, updated_at desc);

-- ── 3) REMINDERS ──
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  concept       text,
  amount        numeric(14,2),
  due_date      date,
  category      text,
  business_type text check (business_type in ('business','personal')),
  method        text check (method in ('cash','card','transfer')),
  is_paid       boolean not null default false,
  notes         text,
  created_at    timestamptz,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists reminders_user_updated_idx on public.reminders (user_id, updated_at desc);

-- ── 4) CATEGORIES (id text = slug del cliente; PK compuesta con user_id) ──
create table if not exists public.categories (
  id         text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text check (kind in ('expense','income')),
  label      text,
  icon       text,
  color      text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at desc);

-- ── 5) SAVINGS_GOALS ──
create table if not exists public.savings_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  concept    text,
  target     numeric(14,2),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists savings_goals_user_updated_idx on public.savings_goals (user_id, updated_at desc);

-- ── 6) BUDGETS (sin tombstones: no hay delete de presupuestos, solo set) ──
create table if not exists public.budgets (
  user_id    uuid not null references auth.users (id) on delete cascade,
  month      text not null,   -- 'YYYY-MM'
  amount     numeric(14,2) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

-- ── 7) RLS ──
alter table public.profiles      enable row level security;
alter table public.expenses      enable row level security;
alter table public.reminders     enable row level security;
alter table public.categories    enable row level security;
alter table public.savings_goals enable row level security;
alter table public.budgets       enable row level security;

create policy profiles_owner_all on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy expenses_owner_all on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy reminders_owner_all on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy categories_owner_all on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy savings_goals_owner_all on public.savings_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy budgets_owner_all on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
