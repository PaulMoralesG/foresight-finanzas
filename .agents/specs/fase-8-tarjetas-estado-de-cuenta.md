# Fase 8 — Tarjetas: estado de cuenta (corte, pago de contado, cupo)

Origen: comparación con el detalle de tarjeta de un banco ecuatoriano. Lo que
decide si pagas intereses y cuándo pagar no estaba en la app.

## Campos nuevos (solo deudas «Tarjeta de crédito», todos opcionales)
- `cutDay` — día de corte (1–31). Junto al `payDay` existente («Pagar hasta»).
- `statementBalance` — pago de contado del corte actual: lo que hay que pagar
  antes de la fecha límite para no generar intereses.
- `creditLimit` — cupo total → cupo disponible (`creditLimit − balance`) y % de uso.

Se dejan fuera a propósito: sobregiro, millas y la separación rotativo/diferido
(más campos sin mejorar decisiones).

## Comportamiento
- Tarjeta con datos de corte: «Paga $X antes del 12 oct para no pagar intereses»;
  en 0 → «Pago de contado cubierto: este corte no genera intereses».
- Un pago enlazado a la tarjeta (Fase 7) también descuenta del pago de contado
  (mismo `set()`, nunca por debajo de 0); borrarlo lo devuelve.
- «Actualizar estado de cuenta»: una hoja para, cada corte, poner deuda total,
  pago de contado y pago mínimo en un solo paso.
- Cupo: barra de uso con cupo disponible.

## Datos
- Supabase `0019_debts_card_statement.sql`: `cut_day int`, `statement_balance
  numeric(14,2)`, `credit_limit numeric(14,2)`, nullable. Antes del cliente.
- Las claves solo existen en el objeto local cuando tienen valor (igual que
  `debtId`/`created_at`): deudas anteriores no cambian de forma, sin migración
  de estado persistido.

## Tests
Lógica pura (próximas fechas, días restantes, cupo), invariante del pago de
contado, mapeo de sync, formulario y hoja de estado de cuenta.
