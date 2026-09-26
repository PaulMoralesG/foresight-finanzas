-- ============================================================
-- Foresight Finanzas — Migración 0017
--   Columnas de negocio NULLABLE en las tablas de la 0009–0014
--   (hotfix de incidente: la sincronización quedaba bloqueada).
--
--   La convención de todas las tablas de entidades (ver el comentario de
--   `expenses` en 0001 y el de `sync.ts`) es que las columnas de negocio son
--   NULLABLE: el upsert de un borrado solo manda identidad + timestamps
--   —{id, user_id, updated_at, deleted_at}—. La 0015 lo corrigió en tres
--   columnas de `budget_lines`, pero `accounts`, `assets`, `debts`,
--   `recurrences`, `savings_goals` y el resto de `budget_lines` siguieron con
--   NOT NULL.
--
--   Postgres comprueba el NOT NULL de la fila propuesta ANTES de resolver el
--   ON CONFLICT, así que borrar una regla recurrente, una deuda o una cuenta
--   hacía fallar el push entero con 23502 ("null value in column \"type\" of
--   relation \"recurrences\""). El cliente reintentaba hasta agotarse y
--   ningún cambio posterior salía del dispositivo. error_log lo registra en
--   iPhone, Windows y Android desde el 22-sep-2026.
--
--   El cliente ya lo esquiva (marca los borrados con UPDATE si el upsert
--   choca con NOT NULL), pero esta migración deja el esquema como el código
--   lo asume y desbloquea también a los clientes que aún no se actualizaron.
--
--   Solo quita restricciones: no toca datos, defaults, políticas ni grants.
--   Se puede aplicar en cualquier momento.
--
--   Verificación (debe devolver 0 filas):
--     select table_name, column_name
--     from information_schema.columns
--     where table_schema = 'public' and is_nullable = 'NO'
--       and table_name in ('accounts','assets','budget_lines','debts','recurrences','savings_goals')
--       and column_name not in ('id','user_id','updated_at','created_at');
-- ============================================================

alter table public.accounts
  alter column name drop not null,
  alter column kind drop not null,
  alter column initial_balance drop not null;

alter table public.assets
  alter column name drop not null,
  alter column tag drop not null,
  alter column "group" drop not null,
  alter column value drop not null;

alter table public.budget_lines
  alter column "limit" drop not null,
  alter column plan drop not null;

alter table public.debts
  alter column name drop not null,
  alter column tag drop not null,
  alter column kind drop not null,
  alter column balance drop not null,
  alter column annual_rate drop not null,
  alter column min_payment drop not null;

alter table public.recurrences
  alter column type drop not null,
  alter column amount drop not null,
  alter column concept drop not null,
  alter column category drop not null,
  alter column method drop not null,
  alter column business_type drop not null,
  alter column frecuencia drop not null,
  alter column intervalo drop not null,
  alter column desde drop not null,
  alter column activa drop not null;

alter table public.savings_goals
  alter column saved drop not null,
  alter column saved_from_accounts drop not null;
