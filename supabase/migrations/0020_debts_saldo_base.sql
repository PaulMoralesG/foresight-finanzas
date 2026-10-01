-- ============================================================
-- Foresight Finanzas — Migración 0020
--   Saldo de deudas derivado de sus pagos (spec sync-saldo-deudas).
--
--   `debts.balance` se modificaba sumando y restando en cada dispositivo pero
--   se sincronizaba como valor absoluto (gana el `updated_at` más nuevo): dos
--   pagos concurrentes perdían uno, y editar la tasa con una copia vieja
--   devolvía a la deuda un pago ya hecho. Con estas columnas, una deuda
--   ANCLADA guarda un saldo base y el cliente calcula
--   saldo = max(0, saldo_base − Σ pagos):
--     saldo_base      saldo fijado por el usuario (crear, estado de cuenta, confirmar)
--     contado_base    lo mismo para el pago de contado de las tarjetas
--     saldo_base_at   = updated_at de la escritura que fijó la base. Un cliente
--                     viejo que reescribe la fila cambia updated_at sin tocar
--                     esta columna: dejan de coincidir y los clientes nuevos
--                     leen la deuda como NO anclada (rowToDebt en sync.ts)
--     expenses.debt_historico  pago histórico vinculado a mano: aparece en el
--                     historial de la deuda pero no descuenta de su saldo
--
--   Solo añade columnas nullable y sin default (convención 0017): no toca
--   datos, políticas ni grants; la RLS por user_id ya cubre las columnas
--   nuevas. `balance` se conserva como caché para clientes viejos y consultas
--   SQL (solo se refresca cuando la fila se sube por otro motivo). Los
--   `check` se cumplen por construcción (el cliente aplica max(0, …)).
--
--   ORDEN: aplicar ANTES de desplegar el cliente que las manda (sin ellas,
--   PostgREST responde 42703 y el cliente pasa a local-only). Después,
--   actualizar todos los dispositivos.
--
--   Verificación: 4 filas, todas con is_nullable = YES.
--     select table_name, column_name, data_type, is_nullable
--     from information_schema.columns
--     where table_schema = 'public'
--       and ((table_name = 'debts' and column_name in ('saldo_base', 'contado_base', 'saldo_base_at'))
--         or (table_name = 'expenses' and column_name = 'debt_historico'));
-- ============================================================

alter table public.debts
  add column if not exists saldo_base    numeric(14,2) check (saldo_base >= 0),
  add column if not exists contado_base  numeric(14,2) check (contado_base >= 0),
  add column if not exists saldo_base_at timestamptz;

alter table public.expenses
  add column if not exists debt_historico boolean;
