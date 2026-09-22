-- ============================================================
-- Foresight Finanzas — Migración 0015
--   budget_lines: columnas de negocio nullable (hotfix de incidente).
--
--   Todas las tablas de entidades siguen la misma convención (ver el
--   comentario de `expenses` en 0001_entities_and_rls.sql): las columnas
--   de negocio son NULLABLE porque el upsert de un tombstone solo manda
--   identidad + timestamps —{id, user_id, updated_at, deleted_at}—, sin el
--   resto de campos. La 0012 rompió esa convención al declarar `tag`,
--   `kind` y `category_id` NOT NULL en `budget_lines`.
--
--   Mientras esas columnas solo se llenaban en altas/ediciones explícitas
--   del usuario, el problema no se veía. El 22-sep-2026 el commit 21120f9
--   añadió una deduplicación automática de líneas de presupuesto durante
--   el merge (sync.ts), que genera tombstones por su cuenta en cada ciclo
--   de sync cuando detecta duplicados. Cada tombstone así generado hacía
--   fallar el upsert completo de `budget_lines` con:
--     "null value in column tag of relation budget_lines violates
--      not-null constraint"
--   —visible en los logs de Postgres en bucle (reintentos de sync) desde
--   que el commit llegó a producción.
--
--   Los `check` existentes (tag in (...), kind in (...)) siguen intactos:
--   en Postgres un CHECK se satisface también cuando la columna es NULL,
--   así que relajar el NOT NULL no abre la puerta a valores inválidos en
--   filas vivas, solo permite que una fila-tombstone los deje vacíos.
-- ============================================================

alter table public.budget_lines alter column tag drop not null;
alter table public.budget_lines alter column kind drop not null;
alter table public.budget_lines alter column category_id drop not null;

-- Verificación:
--   select column_name, is_nullable from information_schema.columns
--   where table_name = 'budget_lines' and column_name in ('tag','kind','category_id');
