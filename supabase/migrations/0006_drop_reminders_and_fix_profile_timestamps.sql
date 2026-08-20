-- ============================================================
-- Foresight Finanzas — Migración 0006
--   (a) Eliminar la tabla `reminders` (función retirada)
--   (b) Unificar profiles.created_at / updated_at a timestamptz
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de desplegar el código que
-- la acompaña: el cliente nuevo ya no consulta `reminders`, así que el orden
-- inverso dejaría al cliente viejo pidiendo una tabla inexistente.
-- ============================================================


-- ── (a) RETIRAR LOS RECORDATORIOS DE PAGO ───────────────────
--
-- La función estaba a medias: el store tenía addReminder / updateReminder /
-- deleteReminder / toggleReminderPaid, pero NINGUNA pantalla las llamaba.
-- Solo estaba cableado el lado de lectura (el badge del TabBar y un aviso en
-- Inicio), de modo que un usuario no podía crear un recordatorio ni una sola
-- vez. Los que hubiera venían del import de la versión antigua.
--
-- Mientras tanto costaba lo mismo que una función real: tabla, RLS, índice,
-- tombstones y un viaje de ida y vuelta en CADA sincronización.
--
-- Verificado antes de ejecutar (19/08/2026): 0 filas, 0 vivas.
--   select count(*) as total,
--          count(*) filter (where deleted_at is null) as vivos
--   from public.reminders;
--
-- ⚠️ Si en TU entorno esa consulta no devuelve 0, respalda antes:
--   create table public.reminders_backup_20260819 as
--     select * from public.reminders;
--
-- La decisión no es que los recordatorios sobren en una app de finanzas —son
-- estándar en la categoría (Monarch, Simplifi, QuickBooks)—, sino que una
-- versión inalcanzable no vale lo que cuesta. Si se retoman, se rediseñan
-- como gastos recurrentes con aviso real.

drop table if exists public.reminders;


-- ── (b) profiles: timestamp → timestamptz ───────────────────
--
-- Las seis tablas creadas por las migraciones usan `timestamptz`, pero
-- profiles.created_at y updated_at quedaron como `timestamp without time
-- zone` porque son anteriores a la migración 0001.
--
-- Sin huso horario, Postgres interpreta el valor según la zona de la sesión:
-- la misma fila puede leerse como instantes distintos según quién consulte.
-- Hoy no rompe nada porque el cliente no lee esas columnas, y precisamente
-- por eso es el momento barato de arreglarlo: cuando exista un "miembro
-- desde", una auditoría o el vencimiento de un periodo de prueba, ya estarán
-- bien.
--
-- `at time zone 'UTC'` interpreta los valores existentes como UTC, que es lo
-- que escribió `now()` en su momento.

alter table public.profiles
  alter column created_at type timestamptz using created_at at time zone 'UTC',
  alter column updated_at type timestamptz using updated_at at time zone 'UTC';
