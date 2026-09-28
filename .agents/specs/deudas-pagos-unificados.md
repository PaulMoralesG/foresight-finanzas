# Deudas — pagos unificados, tarjetas de pago variable y campos de estado de cuenta

Estado: diseño (2026-09-28). Continúa las fases 7 (`fase-7-pagos-de-deudas.md`)
y 8 (`fase-8-tarjetas-estado-de-cuenta.md`).

## 0. Punto de partida — LEER ANTES DE IMPLEMENTAR

**El `main` local está 6 commits por detrás de `origin/main`.** Lo desplegado
(`origin/main`, PR #21–#23) ya contiene buena parte de lo pedido:

| Pedido | Estado en `origin/main` |
|---|---|
| `Transaction.debtId` | Existe: `src/types/index.ts` (debtId?), `sync.ts` `expenseToRow` (`debt_id: t.debtId ?? null`) y `rowToExpense` (clave solo si hay valor). Commit `283b692`. |
| `expenses.debt_id` en BD | `supabase/migrations/0018_expenses_debt_id.sql` (aplicada 2026-09-26). |
| `cut_day`, `statement_balance`, `credit_limit` | Tipo (`cutDay?`, `statementBalance?`, `creditLimit?`), `DebtRow`, `debtToRow` (`?? null`), `rowToDebt` (clave solo con valor), `normalizarDeuda` (`src/lib/credit-card.ts`), UI `ResumenTarjeta` + hoja «Actualizar estado de cuenta». Commit `001dbbd`, migración `0019`. |
| Invariante saldo ↔ movimientos | `src/lib/debt-payments.ts` (`deltaDeSaldos`, `aplicarDeltas`) aplicado en add/update/delete/deleteMany/restore del store. |
| Historial por deuda | `historialDeuda()` + `HistorialPagos` en `DebtsPage`. |
| Store | `version: 15`, `migrateV15` (enlaza «Pago <deuda>» por nombre, sin tocar saldos). |

**Respuesta a la contradicción de `debtId`:** el informe previo leyó el `main`
local (sin esos commits): ahí `Transaction` no tiene `debtId` y
`expenseToRow`/`rowToExpense` (`src/lib/sync.ts` ~200–240 en `main`) no
mencionan `debt_id`. En `origin/main` sí existe todo. En BD hay **1** movimiento
enlazado (tarjeta Pichincha, 201,60, 2026-09-26, `type='expense'`,
`pago-tarjetas`, **sin `account_id`**) escrito por el cliente desplegado.

**Primer paso obligatorio:** basar la rama `feat/deudas-pagos-unificados` en
`origin/main` (`git merge --ff-only origin/main`). Hoy está bloqueado porque
`CLAUDE.md` tiene cambios sin commitear del usuario y `origin/main` también
lo modifica: el usuario decide (commit a una rama `wip/…`, nunca stash/descarte).
Todas las rutas y líneas de este spec se refieren a `origin/main`.

BD verificada (proyecto `sphmdtlvxbypckhavhgb`): `cut_day smallint CHECK 1–31`,
`statement_balance numeric(14,2) CHECK >= 0`, `credit_limit numeric(14,2)
CHECK >= 0`, todas nullable; `min_payment` nullable (0017) default 0 CHECK >= 0;
`expenses.debt_id text` nullable, sin FK. **No hace falta migración de Supabase.**

## 1. Decisiones

### D1 · Pago mínimo opcional: `0` = «pago variable»
- Se mantiene `minPayment: number` y `0` como centinela (sin cambio de tipo, BD
  ni sync). Helper `tieneMinimoFijo(d) = d.minPayment > 0` en `src/lib/debts.ts`.
- `projectDebts` **excluye** las deudas sin mínimo fijo y devuelve sus ids en
  un campo nuevo `DebtPlan.sinMinimo: string[]`. Con interés > 0 y sin extra,
  una deuda con mínimo 0 dejaba el plan `stalled` («no cierra») para todas.
- UI: en vez de «mínimo $0» → «pago variable»; en su fila de «Orden de pago»
  → «pago variable · sin proyección»; KPI «Pago mensual» sub → «mínimos fijos
  + $X extra · N con pago variable» cuando N > 0. Impresión (`DebtsPrintView`)
  y CSV: «Variable» en vez de 0,00.
- Descartadas: usar el pago de contado como mínimo (sobreestima el pago
  mensual); `null` en BD (cambio de tipo + migración sin beneficio).

### D2 · Campos de tarjeta: ya existen; blindar contra pisado con null
Riesgo real encontrado (no teórico): un dispositivo con la PWA **anterior** a
`001dbbd`/`283b692` tiene deudas/movimientos locales **sin** esas claves. Si
el cliente viejo edita la fila, su upsert no manda esas columnas (se
conservan en BD) pero la fila queda con el mismo `updated_at` que su copia
local. Al actualizarse a la versión nueva, el primer ciclo completo hace
merge con **empate** de `updated_at`; `mergeById` desempata por
`canonicalJson` y la copia local sin `cutDay` gana (`"id"` > `"cutDay"`;
en movimientos `"id"` > `"debtId"`). El push completo manda
`cut_day: null` / `debt_id: null` y `keep_newest` lo acepta (no es más viejo).
Lo mismo si el cliente viejo editó offline (local más nuevo).

Solución (pura y acotada):
- `src/lib/merge.ts`: `hidratarAusentes<T>(local, remotos, ids, claves)` —
  para cada item local cuyo id esté en `ids` y tenga fila remota, copia las
  `claves` **ausentes** en local y presentes en remoto. No toca `updated_at`.
- Store v16: `migrateV16` guarda `pendienteHidratar = { debts: string[];
  expenses: string[] }` con los ids de TODAS las deudas y de los movimientos
  sin `debtId` que existían al migrar (solo ellos pudieron perder claves).
- `sync.ts`: en un ciclo **completo**, antes de `mergeById` de debts
  (claves `cutDay`, `statementBalance`, `creditLimit`) y expenses (`debtId`),
  aplica `hidratarAusentes`; tras un ciclo completo confirmado vacía
  `pendienteHidratar`. Mientras no esté vacío, `schedule()` fuerza ciclo
  completo (nunca uno incremental que suba copias sin hidratar).
- Descartadas: desempate «remoto gana» en `mergeById` (cambia el contrato
  de todas las tablas); omitir claves en `debtToRow` (PostgREST rellena con
  NULL las columnas ausentes en upserts por lotes).
- Cliente viejo tras el cambio: pre-`001dbbd` no envía las columnas de
  tarjeta; pre-`283b692` no envía `debt_id` → el UPDATE del upsert no las
  toca. Correcto sin cambios.

### D3 · Tarjeta: dato principal «Pagar $X antes del día Y»
`ResumenTarjeta` sube a primera línea de la tarjeta (sobre los botones), en
`text-sm font-semibold`: «Pagar **$X** antes del 12 oct» + «(faltan N días)».
Prioridad de X: `statementBalance` > `minPayment` (con sufijo «mínimo») >
sin monto («Paga antes del 12 oct»). Debajo: «Corte: 24 sep · Pagar hasta: 12
oct» y barra de cupo (% y disponible) si hay `creditLimit`. El saldo total
sigue siendo `balance`, a la derecha como hoy. Lógica en `estadoTarjeta`
(añadir `montoAPagar` y `origenMonto: 'contado'|'minimo'|null`).

### D4 · Un pago de deuda NO es gasto: filtro central
- `src/lib/debt-payments.ts`:
  `esPagoDeDeuda(t) = !!t.debtId` y
  `cuentaComoGasto(t) = t.type === 'expense' && !t.debtId`.
- Todo lo que suma gastos pasa por `cuentaComoGasto` (lista en §2, tarea F).
  Así también quedan fuera los `expense`+`debtId` ya existentes (el de BD y
  los que creó el selector de `TransactionModal` o `migrateV15`), sin migrar
  datos.
- Los pagos **nuevos** se guardan siempre como `type: 'transfer'`,
  `toAccountId: null`, `category: TRANSFER_CATEGORY`, `debtId`: los clientes
  viejos también los excluyen de gastos y `accountBalance` ya los resta de la
  cuenta de origen. Patrimonio: cuenta −X y deuda −X → neutro.
- Se elimina la casilla «Contar como gasto del mes» y el parámetro
  `asExpense` de `registerDebtPayment`.
- Descartadas: `type: 'expense'` + filtro solo (clientes viejos seguirían
  sumándolos); tipo nuevo `'debt_payment'` (rompe CHECK de BD y clientes viejos).

### D5 · Cuenta de origen por defecto
«Registrar pago» preselecciona `cuentaSugeridaParaPago(debt, expenses,
accounts)`: la cuenta del último pago enlazado de esa deuda; si no hay, la
primera `Banco`; si no, la primera cuenta. Sigue existiendo «No descontar de
ninguna cuenta». Monto prellenado: `statementBalance` > `minPayment` > vacío,
con dos chips «Contado $X» / «Mínimo $Y» cuando existan.

### D6 · Movimientos: etiqueta y creación manual
- Etiqueta: `etiquetaPago(t, debts)` → «Pago de tarjeta · <nombre>» /
  «Pago de préstamo · <nombre>» / «Pago de deuda eliminada». Icono 💳/🏦,
  monto como salida en color neutro (no rojo de gasto), pill «Pago de deuda»
  (`typeLabel`/`typePillClasses` reciben el movimiento). No aparece con el
  filtro «Gastos»; sí en «Todos». CSV e informe: tipo «Pago de deuda».
- Gasto manual en `pago-tarjetas`/`prestamos` desde el modal: **vincular desde
  el modal** (recomendado; ya existe el selector). Cambios: si hay deudas, la
  opción por defecto pasa a ser la deuda cuyo tipo encaja (única tarjeta →
  preseleccionada); con deuda elegida el movimiento se guarda como pago
  (transfer + `debtId`, D4) y el modal lo explica («No cuenta como gasto;
  baja el saldo de X»). «Ninguna» sigue disponible con aviso: «Contará como
  gasto y no bajará ninguna deuda». El selector solo aparece al **crear** o
  al editar un movimiento **ya** enlazado (vincular uno viejo al editarlo
  bajaría el saldo otra vez: ver D7).
- Descartadas: bloquear la categoría (rompe gastos legítimos sin deuda
  registrada); redirigir a Deudas (dos caminos para lo mismo, más clics).

### D7 · Históricos en `pago-tarjetas`/`prestamos` sin `debtId`
- No se tocan: siguen contando como gasto (en BD hay 24 así). Nada de
  migración automática.
- Acción explícita nueva: en el historial de cada deuda, «Pagos anteriores
  sin vincular (N)» (gastos de su categoría sin `debtId`) con botón
  «Vincular (no cambia el saldo)» → `vincularPagoHistorico(txId, debtId)`:
  pone `debtId` **sin** delta de saldo (como `migrateV15`), por lo que deja de
  contar como gasto y entra al historial. Reversible: «Desvincular» (tampoco
  toca saldo).

### D8 · Editar/borrar un pago revierte el saldo — se mantiene
Ya es el invariante (`deltaDeSaldos`): borrar devuelve el monto a `balance` (y a
`statementBalance`), editar aplica la diferencia. Justificación: el historial
se deriva de los movimientos; si borrar no revirtiera, saldo e historial
divergen y no hay forma de corregir un pago mal tecleado. Cambios: el
`ConfirmDialog` de borrado en Movimientos dice «El saldo de <deuda> volverá a
subir $X»; si la deuda ya no existe, `aplicarDeltas` lo ignora (ya es así).
Excepción: `vincularPagoHistorico`/desvincular no mueven saldo (D7).

### D9 · Editar el saldo a mano y el patrimonio
Patrimonio = cuentas + activos − deudas. Editar `balance` (hoja de estado de
cuenta) es legítimo: refleja compras con tarjeta e intereses que la app no
ve. Riesgo: poner un total que ya descuenta un pago registrado después del
corte → doble baja. Mitigación solo de UI: la hoja muestra «Último pago
registrado: $X el <fecha>» y el aviso «Si tu estado de cuenta ya incluye ese
pago, el total nuevo lo refleja; si es posterior al corte, réstalo tú».
Los cierres mensuales de patrimonio son instantáneas: no se recalculan.

## 2. Archivos y cambios por archivo (sobre `origin/main`)

- `src/lib/debt-payments.ts`: `esPagoDeDeuda`, `cuentaComoGasto`,
  `etiquetaPago(t, debts)`, `cuentaSugeridaParaPago(debt, expenses, accounts)`,
  `gastosSinVincular(debt, expenses)` (categoría `categoriaDePago(kind)`, sin
  `debtId`, `type==='expense'`). `PagoDeDeuda.esGasto` se elimina (siempre
  falso ahora); el historial muestra la cuenta.
- `src/lib/debts.ts`: `tieneMinimoFijo`; `projectDebts` filtra y devuelve
  `sinMinimo`; `debtsToCsv` «Variable» si 0; `monthlyDebtPayment` sin cambio.
- `src/lib/credit-card.ts`: `estadoTarjeta` añade `montoAPagar`, `origenMonto`.
- `src/lib/merge.ts`: `hidratarAusentes` (D2).
- `src/lib/sync.ts`: hidratación en ciclo completo (junto a los
  `buildRemoteSet` de expenses ~810 y debts ~831), vaciado de
  `pendienteHidratar` tras ciclo completo OK, `schedule()` fuerza completo si
  hay pendientes. Sin cambios en `debtToRow`/`rowToDebt`/`DEBT_KINDS_VALIDOS`.
- `src/stores/financeStore.ts`: `version: 16`, `migrateV16` exportada y
  encadenada; estado `pendienteHidratar` (en `emptyState`, `partialize`,
  `reset`) y acción `limpiarPendienteHidratar()`; `registerDebtPayment(id,
  { amount, date, accountId })` siempre transfer (D4); `vincularPagoHistorico`
  y `desvincularPago` sin delta.
- `src/types/index.ts`: sin cambios (salvo que se prefiera tipar
  `PendienteHidratar` aquí).
- `src/pages/DebtsPage.tsx`: `#d-min` y `#e-min` sin `required`, etiqueta
  «Pago mínimo (opcional)» + ayuda «Déjalo vacío si cambia cada mes»; textos
  D1; `ResumenTarjeta` arriba (D3); modal de pago sin casilla, cuenta y monto
  por defecto (D5); sección «Pagos anteriores sin vincular» (D7); aviso D9.
- `src/components/features/report/DebtsPrintView.tsx`: «Variable» (D1).
- `src/components/features/movements/TransactionModal.tsx`: D6 (guardar como
  transfer+`debtId`, preselección, avisos, selector solo al crear o si ya
  estaba enlazado).
- Consumidores de gastos → `cuentaComoGasto`: `src/hooks/useFinance.ts:30`,
  `src/hooks/useStatsPeriod.ts:58,60,93,142,150,157,178`,
  `src/lib/budget-lines.ts:79,132,175` (en 79/132 excluir `debtId` además del
  tipo), `src/lib/report-model.ts:38,58`,
  `src/components/features/report/ReportModal.tsx:52`,
  `src/pages/MovementsPage.tsx:146,192` (+ render 457–487 y 615–657 con
  `etiquetaPago`), `src/lib/movements-csv.ts:49–52`,
  `src/lib/transaction-labels.ts`, `src/components/ui/TransactionBits.tsx:32`,
  `src/pages/AccountsPage.tsx:265` (bucket «Pagos de deudas» en vez de
  «Transferencias»). `src/lib/savings.ts:19` ya filtra por `ahorro`: sin cambio.
- `README.md`: nota breve en la sección de datos (pago de deuda ≠ gasto;
  hidratación v16). **No tocar `CLAUDE.md`** (cambios del usuario sin commitear).

## 3. Pruebas a escribir ANTES de implementar (TDD)

`src/__tests__/debts.test.ts` (tarea A)
- `projectDebts` con una deuda mínimo 0 + otra con mínimo: la de 0 va en
  `sinMinimo`, no en `payoff`/`order`, y el plan `ok` no queda `stalled`.
- Todas con mínimo 0 → `empty` (o `sinMinimo` completo) y `ok: true`.
- `debtsToCsv` escribe «Variable» con mínimo 0.

`src/__tests__/gastos-y-pagos.test.ts` (nuevo, tarea A)
- `cuentaComoGasto`: expense sin debtId → true; expense con debtId → false;
  transfer con debtId → false; income → false.
- `etiquetaPago`: tarjeta / préstamo / deuda borrada.
- `cuentaSugeridaParaPago`: último pago enlazado > primera Banco > primera > null.
- `gastosSinVincular`: solo su categoría, sin debtId, solo expense.

- `estadoTarjeta.montoAPagar`: contado > mínimo > null; contado 0 → cubierto
  (aquí y no en `credit-card.test.ts`, que es de la tarea C).

`src/__tests__/merge.test.ts` (tarea B)
- `hidratarAusentes` copia clave ausente; no pisa clave presente (ni valor
  distinto); ignora ids fuera de `ids` y sin fila remota; no cambia `updated_at`.

`src/__tests__/debt-payments-store.test.ts` (nuevo, tarea C)
- `registerDebtPayment` crea transfer, `toAccountId: null`, `debtId`,
  `TRANSFER_CATEGORY`, baja `balance` y `statementBalance`; con cuenta, el saldo
  de la cuenta baja (`accountBalance`).
- `vincularPagoHistorico`/`desvincularPago`: ponen/quitan `debtId`, saldo intacto.
- `migrateV16` desde un estado v15: `pendienteHidratar.debts` = todos los ids,
  `.expenses` = ids sin debtId; estado vacío → listas vacías; idempotente.
- Cadena completa `migrate` desde v14 llega a v16 sin lanzar; `reset()` vacía
  `pendienteHidratar`.
- Actualizar llamadas con `asExpense` en `credit-card.test.ts` y
  `debt-payments.test.ts`.

`src/__tests__/sync-hidratacion.test.ts` (nuevo, tarea D)
- Empate de `updated_at`, local sin `cutDay`, remoto con 24, id pendiente →
  el push completo envía `cut_day: 24` (no null) y `pendienteHidratar` queda vacío.
- Igual con local **más nuevo** (edición offline de cliente viejo).
- Mismo caso para `expenses.debt_id`.
- Id NO pendiente con clave ausente a propósito (usuario la borró) → sale null.
- Con pendientes, un `schedule()` corre ciclo completo.
(Mock de Supabase con `vi.hoisted()` + getter, según CLAUDE.md.)

`src/__tests__/stats-period.test.ts`, `budget-lines.test.ts`,
`report-model.test.ts`, `movements-csv.test.ts`, `accounts-page.test.tsx`
(tarea F)
- Un expense con `debtId` y un transfer con `debtId` no suman a gastos, KPI,
  plan vs real ni informe; sí restan de la cuenta. CSV: tipo «Pago de deuda».
  Resumen por cuenta: bucket «Pagos de deudas».

`src/__tests__/debts-page.test.tsx` (tarea E)
- Crear deuda sin mínimo: se guarda 0 y muestra «pago variable».
- Tarjeta con contado y payDay: primera línea «Pagar $X antes del …».
- Modal de pago: sin casilla «Contar como gasto»; cuenta preseleccionada;
  monto = contado.
- «Pagos anteriores sin vincular» → «Vincular» no cambia el saldo.

`src/__tests__/transaction-modal.test.tsx` (tarea G)
- Categoría «Pago de Tarjetas» con una tarjeta → preseleccionada; al guardar
  queda transfer + debtId y el saldo baja.
- «Ninguna» → expense sin debtId + aviso visible.
- Editar un gasto viejo de `pago-tarjetas` sin debtId → no aparece selector.

## 4. Riesgos
- **Base desactualizada** (§0): implementar sobre `main` local duplicaría y
  chocaría con 1 300 líneas ya desplegadas.
- **Cifras históricas cambian**: los `expense`+`debtId` existentes (1 en BD +
  los enlazados por `migrateV15` en cada dispositivo) dejan de sumar a gastos
  de su mes; septiembre baja 201,60. Es la semántica pedida; avisar al usuario.
- Líneas de presupuesto en `pago-tarjetas`: los pagos enlazados ya no suman a
  su «real»; la línea puede quedar en 0 → sugerir al usuario quitarla.
- Clientes viejos durante la transición: ven el pago como transferencia sin
  destino (correcto en saldos) y no aplican el invariante de saldo al
  editarlo/borrarlo. Mitiga el banner de nueva versión.
- Hidratación: si el usuario borra un campo de tarjeta en v16 antes del primer
  ciclo completo, volvería del remoto. Ventana mínima (el `attach` es completo).
- Datos del usuario: hay «Tarjeta Pacífico» (430) y «Tarjeta Crédito Banco
  Pacífico» (6 586,29): posible duplicado; no tocar, preguntar.
- Historial de migraciones remoto no coincide 1:1 con el repo (0013 con otro
  nombre; 0014–0016 no listadas): fuera de alcance, no bloquea.

## 5. Partición en tareas (subagentes Sonnet)

Paso 0 (orquestador + usuario): rama basada en `origin/main` (§0).

**Ola 1 — en paralelo (archivos disjuntos):**
- **A · Lógica pura de pagos y mínimos** — `src/lib/debt-payments.ts`,
  `src/lib/debts.ts`, `src/lib/credit-card.ts`; tests `debts.test.ts` y
  `gastos-y-pagos.test.ts` (nuevo, incluye `montoAPagar`).
- **B · Hidratación en merge** — `src/lib/merge.ts`, `merge.test.ts`.
- **C · Store v16** — `src/stores/financeStore.ts`,
  `debt-payments-store.test.ts` (nuevo), llamadas `asExpense` en
  `debt-payments.test.ts` y `credit-card.test.ts`; y la línea 144 de
  `DebtsPage.tsx` (quitar `asExpense`) para que `tsc` pase (E la reescribe
  después). Contrato fijo: `pendienteHidratar: { debts: string[]; expenses:
  string[] }`, `limpiarPendienteHidratar()`, `vincularPagoHistorico(txId,
  debtId)`, `desvincularPago(txId)`.

**Ola 2 — en paralelo, tras la ola 1:**
- **D · Sync** (depende de B y C) — `src/lib/sync.ts`,
  `sync-hidratacion.test.ts` (nuevo).
- **E · Página Deudas** (depende de A y C) — `src/pages/DebtsPage.tsx`,
  `DebtsPrintView.tsx`, `debts-page.test.tsx`, `print-debts.test.tsx`.
  Invocar la skill `frontend-design` antes del rediseño de la tarjeta (D3).
- **F · Consumidores de gastos** (depende de A) — `useFinance.ts`,
  `useStatsPeriod.ts`, `budget-lines.ts`, `report-model.ts`, `ReportModal.tsx`,
  `MovementsPage.tsx`, `movements-csv.ts`, `transaction-labels.ts`,
  `TransactionBits.tsx`, `AccountsPage.tsx` + sus tests.
- **G · Modal de movimientos** (depende de A y C) — `TransactionModal.tsx`,
  `transaction-modal.test.tsx`.

**Ola 3 — secuencial:**
- **H · Cierre** (Sonnet) — `README.md`; `npx tsc --noEmit`, `npx eslint .`,
  `npx vitest run`, `npx vite build` (borrar `dist/`).
- **I · Revisión** (Opus) — revisar invariantes D2/D4/D8 y el sync antes del PR.
  Commits en español (`feat(deudas): …`), PR contra `main`, sin merge sin OK.
