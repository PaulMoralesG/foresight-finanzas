-- ============================================================
-- Foresight Finanzas — Migración 0005
--   (a) Claves primarias compuestas (user_id, id) — aislamiento multi-tenant
--   (b) Índice por fecha — prepara la paginación por mes
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede correr
-- dos veces sin efecto adicional.
-- ============================================================


-- ── (a) CLAVES PRIMARIAS COMPUESTAS ─────────────────────────
--
-- Contexto (auditoría SEC-03): `categories` ya usa PK compuesta desde la
-- migración 0002, pero `expenses`, `reminders` y `savings_goals` seguían con
-- `id` a secas. RLS impide leer o escribir filas ajenas, así que NO había
-- fuga de datos — el problema es de disponibilidad:
--
--   Los ids los genera el cliente (crypto.randomUUID, o Math.random en el
--   fallback de src/lib/ids.ts, que es bastante más débil). Si un id colisiona
--   entre dos cuentas, el upsert del segundo usuario choca contra una fila
--   que RLS le oculta: la política USING no le deja actualizarla y la
--   restricción de unicidad no le deja insertarla. Su movimiento no se guarda
--   y ni el cliente ni el usuario reciben ningún aviso.
--
-- Con la PK compuesta, dos usuarios pueden tener el mismo `id` sin interferir:
-- el espacio de claves pasa a estar particionado por cuenta, igual que en
-- `categories`.
--
-- ⚠️ Requiere que el cliente use onConflict 'user_id,id' en los upserts
--    (ya actualizado en src/lib/sync.ts).

-- expenses
alter table public.expenses drop constraint if exists expenses_pkey;
alter table public.expenses add primary key (user_id, id);

-- reminders
alter table public.reminders drop constraint if exists reminders_pkey;
alter table public.reminders add primary key (user_id, id);

-- savings_goals
alter table public.savings_goals drop constraint if exists savings_goals_pkey;
alter table public.savings_goals add primary key (user_id, id);


-- ── (b) ÍNDICE POR FECHA ────────────────────────────────────
--
-- Hasta ahora el único índice era (user_id, updated_at), pensado para el
-- pull del sync. Toda vista por mes filtra en el cliente sobre el conjunto
-- completo, lo cual es coherente con el modelo offline-first pero deja sin
-- salida al día que el historial no quepa en memoria.
--
-- Este índice permite acotar el pull por rango de fechas
-- (select ... where date >= ? and date < ?) sin escaneo secuencial.

create index if not exists expenses_user_date_idx
  on public.expenses (user_id, date desc);

create index if not exists reminders_user_due_idx
  on public.reminders (user_id, due_date);
