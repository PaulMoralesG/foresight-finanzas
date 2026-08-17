-- ============================================================
-- Foresight Finanzas — Migración 0003: eliminar blobs legacy de profiles
-- Ejecutar SOLO después de validar que no hay usuarios con import pendiente:
--   select * from public.profiles
--   where legacy_imported = false
--     and ( expenses is not null or reminders is not null or budgets is not null
--        or savings_goal is not null or custom_expense_categories is not null
--        or custom_income_categories is not null );
-- Si devuelve 0 filas → seguro ejecutar. profiles_backup_20260813 queda como respaldo.
-- ============================================================

alter table public.profiles
  drop column if exists expenses,
  drop column if exists reminders,
  drop column if exists budgets,
  drop column if exists savings_goal,
  drop column if exists custom_expense_categories,
  drop column if exists custom_income_categories,
  drop column if exists last_synced_at;
