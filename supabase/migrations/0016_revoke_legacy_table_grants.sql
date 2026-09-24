-- ============================================================
-- Foresight Finanzas — Migración 0016
--   Quitar a `anon` los privilegios heredados en las tablas originales.
--
--   Las cinco tablas creadas antes de la 0004 (`expenses`, `profiles`,
--   `categories`, `budgets`, `savings_goals`) conservan los privilegios por
--   defecto de Supabase: `anon` y `authenticated` tienen ALL, incluidos
--   TRUNCATE, TRIGGER y REFERENCES. La 0004 solo cambió los privilegios por
--   defecto de las tablas FUTURAS; las que ya existían no se tocaron.
--
--   RLS impide hoy cualquier lectura o escritura de `anon` (su auth.uid() es
--   null y ninguna política casa), así que no hay fuga. Pero TRUNCATE no pasa
--   por RLS: la única barrera es que PostgREST no expone ese comando. Esto
--   deja las cinco tablas con el mismo contrato que las de la 0009 en
--   adelante: sin nada para `anon` y solo CRUD para `authenticated`.
--
--   No toca datos ni políticas. La app no usa `anon` contra estas tablas:
--   toda consulta ocurre con sesión iniciada, y el alta de perfil la hace el
--   trigger `handle_new_user` (security definer, corre como su dueño).
--
--   Verificación (debe devolver 0 filas para anon y solo
--   DELETE/INSERT/SELECT/UPDATE para authenticated):
--     select table_name, grantee, string_agg(privilege_type, ',')
--     from information_schema.role_table_grants
--     where table_schema = 'public' and grantee in ('anon', 'authenticated')
--     group by 1, 2 order by 1, 2;
-- ============================================================

revoke all on table
  public.expenses,
  public.profiles,
  public.categories,
  public.budgets,
  public.savings_goals
from anon;

revoke truncate, trigger, references on table
  public.expenses,
  public.profiles,
  public.categories,
  public.budgets,
  public.savings_goals
from authenticated;
