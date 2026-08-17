-- ============================================================
-- Foresight Finanzas — Migración 0002: PK compuesta en categories y metadata en trigger
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- 1) CATEGORIES: Clave primaria compuesta (user_id, id)
-- Permite que múltiples usuarios creen categorías con el mismo slug (ej. 'custom_comida') sin colisión multi-tenant.
alter table public.categories drop constraint if exists categories_pkey;
alter table public.categories add primary key (user_id, id);

-- 2) TRIGGER handle_new_user: Copiar nombres y apellidos de auth.users.raw_user_meta_data
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
