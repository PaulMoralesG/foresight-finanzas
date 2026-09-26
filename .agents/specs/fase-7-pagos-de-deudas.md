# Fase 7 — Pagos de deudas enlazados e historial por deuda

## Problema
- Un pago registrado en Deudas bajaba el saldo pero no dejaba historial en la
  deuda; si se desmarcaba «Registrarlo también como gasto», no dejaba rastro.
- Un gasto registrado en Movimientos con categoría «Pago de tarjetas» no
  tocaba la deuda: el usuario esperaba que sí.

## Modelo (una sola fuente de verdad)
Un pago de deuda ES un movimiento con `debtId` (columna `expenses.debt_id`):
- «Cuenta como gasto del mes» → `type: 'expense'`, categoría `pago-tarjetas`
  (tarjeta) o `prestamos` (resto).
- No cuenta como gasto → `type: 'transfer'` sin cuenta destino: resta de la
  cuenta de origen (si hay) y no suma a gastos ni ingresos.

Invariante en el store (no en una página): el saldo de la deuda se ajusta en
las acciones de movimientos —alta, edición (monto o deuda), borrado, borrado
múltiple y deshacer—. `registerDebtPayment` crea el movimiento enlazado y pasa
por el mismo camino. El saldo no baja de 0.

## Migraciones
- Supabase `0018_expenses_debt_id.sql`: `expenses.debt_id text` nullable.
  Aplicar ANTES del cliente (un cliente que manda `debt_id` sin la columna
  desactivaría el sync con 42703). Clientes viejos no mandan la columna y el
  upsert no la toca.
- Store v15: enlaza los «Pago <nombre>» ya existentes a su deuda por nombre,
  SIN tocar saldos (ya estaban descontados).

## UI
- Deudas: por deuda, «Historial (n)» desplegable: total pagado, lista de
  pagos (fecha, monto, cuenta, gasto/no gasto) y saldo real reconstruido.
- Registrar pago: la casilla pasa a «Contar como gasto del mes»; el pago
  siempre queda en el historial.
- Movimientos: con categoría «Pago de tarjetas»/«Préstamos» y deudas
  registradas, selector «¿Qué deuda pagas?»; al guardar baja el saldo.

## Tests
Lógica pura del historial, invariantes del store (alta/edición/borrado/
deshacer), migración v15, mapeo de sync y UI (selector y registrar pago).
