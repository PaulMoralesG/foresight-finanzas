-- ============================================================
-- Foresight Finanzas — Migración 0013
--   Metas de ahorro con el modelo de Balance Dual (fase 3.8).
--
--   Antes el progreso de una meta se derivaba en el cliente buscando
--   gastos de categoría 'ahorro' cuyo concepto de texto coincidiera con
--   el nombre de la meta. Desde la 3.8 la propia fila lleva `saved`
--   (el total acumulado) y, si tiene fecha objetivo, el cliente calcula
--   cuántos meses quedan y cuánto guardar cada mes (src/lib/goals.ts).
--
--   `saved_from_accounts` es la parte de `saved` que realmente salió de
--   una cuenta (un aporte "solo para registrar avance" no resta de
--   ningún saldo): lib/networth.ts la usa para no contar ese dinero dos
--   veces al calcular el patrimonio.
--
-- Aplicar ANTES de desplegar el cliente que la usa. Columnas nuevas
-- nullable (excepto los numéricos, con default 0): el cliente ya
-- normaliza tag/target_date/saved/saved_from_accounts ausentes al leer
-- (rowToGoal en src/lib/sync.ts), igual que en el resto de entidades.
-- ============================================================

alter table public.savings_goals add column if not exists tag text
  check (tag is null or tag in ('personal','business'));
alter table public.savings_goals add column if not exists target_date text
  check (target_date is null or target_date ~ '^\d{4}-\d{2}$');
alter table public.savings_goals add column if not exists saved numeric(14,2) not null default 0;
alter table public.savings_goals add column if not exists saved_from_accounts numeric(14,2) not null default 0;

-- Verificación:
--   select column_name from information_schema.columns
--     where table_name = 'savings_goals'
--       and column_name in ('tag','target_date','saved','saved_from_accounts');
