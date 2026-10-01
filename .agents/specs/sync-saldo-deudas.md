# Saldo de deudas convergente entre dispositivos

Estado: diseño (2026-09-30), pendiente de revisión del usuario. Origen:
hallazgo [CRÍTICO] de la auditoría técnica (integridad de datos financieros)
y hallazgo relacionado sobre `descuentosDePago`. Continúa
`deudas-pagos-unificados.md` (D4, D7, D8, D9) y no reabre sus decisiones salvo
donde se dice explícitamente.

Nada de este spec toca datos existentes de forma automática: ver §5 y la
regla del proyecto «no hay correcciones automáticas sobre datos financieros
reales».

---

## 1. El problema

### 1.1 Un contador sincronizado como si fuera un valor

`Debt.balance` se **modifica localmente sumando y restando** (cada pago lo
baja, borrar un pago lo sube: `aplicarCambioDePagos` en
`src/lib/debt-payments.ts:139`, llamado por add/update/delete/deleteMany/restore
en `src/stores/financeStore.ts:471-530`), pero se **sincroniza como valor
absoluto** con la regla de todo el motor: gana la fila con `updated_at` más
nuevo (`mergeById` en `src/lib/merge.ts`, aplicado a deudas en
`src/lib/sync.ts:846-854`; en el servidor lo refuerza el trigger
`keep_newest` de la 0004/0010). Cada pago además pone
`updated_at = ahora` en la deuda (`debt-payments.ts:197`), así que **cada pago
es una escritura completa de la fila de la deuda**.

Last-writer-wins es correcto para campos que se *fijan* (nombre, tasa, día de
pago) y es incorrecto para un campo que se *acumula*: dos incrementos
concurrentes no son dos versiones de un mismo valor, son dos hechos que deben
sumarse.

**Caso 1 — pagos concurrentes.** Deuda de $1000 sincronizada en A y B. Ambos
offline. A registra un pago de $100 (A: `balance` 900, `updated_at` t1). B
registra uno de $200 (B: `balance` 800, `updated_at` t2 > t1). Al sincronizar:

- `expenses`: los dos movimientos-pago tienen ids distintos → sobreviven los dos.
- `debts`: la misma fila; gana t2 → `balance` 800.

Resultado: historial con $300 pagados, saldo $800. Debería ser $700. El merge
no re-aplica el pago de A porque el merge nunca ejecuta
`aplicarCambioDePagos`: un pago que llega por el pull entra al historial sin
tocar el saldo (por diseño: se confía en que la fila de la deuda ya lo trae).

**Caso 2 — edición de otro campo.** A registra un pago de $100 (900, t1). B,
que todavía no hizo pull, edita la tasa de interés (B: `balance` 1000 —su copia
vieja—, t2). Gana B: el saldo vuelve a $1000 con el pago de A visible en el
historial de Deudas. `historialDeuda` reconstruye los saldos hacia atrás desde
el `balance` actual, así que toda la columna «saldo después» queda corrida.

**Caso 3 — lo mismo en el servidor.** El incremental y `keep_newest` no lo
evitan: el trigger solo rechaza escrituras *más viejas*; aquí la escritura
perdedora es más vieja pero contiene información (el pago) que la ganadora no
tiene.

### 1.2 `descuentosDePago`: estado local que decide efectos sincronizados

`financeStore.descuentosDePago` (`debt-payments.ts:91-104`) guarda, por id de
movimiento, lo que ese pago descontó de verdad (el saldo no baja de 0) y la
marca `vinculado` (pago histórico enlazado a mano con
`vincularPagoHistorico`: ya estaba absorbido en el saldo, no debe moverlo
nunca). Se persiste pero **no se sincroniza**. Consecuencias:

- **Pago vinculado borrado/editado en otro dispositivo.** A vincula un gasto
  histórico de $250 a la tarjeta (saldo intacto; marca solo en A). En B el
  movimiento llega con `debtId` y sin registro local → B lo trata como un pago
  normal: si el usuario lo borra o le cambia el monto en B, B **devuelve $250 a
  la deuda** —dinero que nunca se descontó— y sube la fila con `updated_at`
  nuevo, que gana en todos los dispositivos.
- **Pago con tope borrado en otro dispositivo.** Deuda de $100, pago de $150:
  A registró descuento efectivo 100. En B no hay registro → borrarlo devuelve
  150 → saldo $150, $50 inventados.
- **UI inconsistente.** Qué pagos muestran «Desvincular» (`DebtsPage.tsx:752`)
  y el aviso «el saldo volverá a subir $X» (`montoQueRevierte`, usado en
  `MovementsPage.tsx:82` y `TransactionModal.tsx:229`) dependen del registro
  local: cada dispositivo muestra algo distinto para el mismo movimiento.

### 1.3 Metas de ahorro (mismo patrón, alcance aparte)

`contributeToGoal` (`financeStore.ts:615`) hace `saved += amount` sobre una
fila que se sincroniza por LWW: dos aportes concurrentes pierden uno, y
`updateSavingsGoal` desde otro dispositivo con copia vieja pisa aportes. Ver §9:
se deja para un spec propio porque la solución necesita un vínculo que hoy no
existe (el movimiento «Aporte a X» no lleva id de meta y un aporte sin cuenta
no crea movimiento).

---

## 2. Requisitos de la solución

1. Convergencia: tras sincronizar, todos los dispositivos muestran el mismo
   saldo, y ese saldo es **función determinista** del estado sincronizado (no
   de qué dispositivo escribió último ni de estado local).
2. Pagos concurrentes se suman; editar otros campos de la deuda no pierde pagos.
3. Borrar/editar un pago en cualquier dispositivo tiene el mismo efecto que en
   el dispositivo que lo creó (incluidos los vinculados a mano).
4. El resto del motor de sync (snapshot + `updated_at`, incremental, merge por
   fila, tombstones) **no cambia**. La solución es local a este campo.
5. Offline sin Supabase sigue siendo modo de primera clase.
6. Transición sin inventar ni perder dinero y sin correcciones automáticas de
   datos existentes.
7. Consumidores de `balance` (proyección snowball/avalanche en
   `src/lib/debts.ts`, patrimonio en `src/lib/networth.ts`, impresión, Resumen,
   `estadoTarjeta`) siguen leyendo `debt.balance` sin cambios.

---

## 3. Opciones consideradas

### Opción A — Saldo derivado: `balance = max(0, saldoBase − Σ pagos que descuentan)`

La deuda guarda un **saldo base** que solo cambia cuando el usuario *fija* el
saldo (crear la deuda, «Actualizar estado de cuenta», editar el saldo en el
formulario). El saldo mostrado se **calcula** a partir del base y de los
movimientos enlazados vivos. Los pagos **no escriben la fila de la deuda**.

- Caso 1: la fila de la deuda no cambia en ningún dispositivo; los dos pagos
  llegan como filas propias → 1000 − 300 = **700** en todos.
- Caso 2: B edita la tasa; su fila lleva el mismo `saldoBase` (1000) → 1000 −
  100 = **900**.
- Borrado en otro dispositivo: el movimiento desaparece (tombstone) → Σ baja →
  el saldo sube exactamente lo que el pago restaba, en todos.
- **Tope a 0 agregado, no por pago.** `max(0, base − Σ)` hace innecesario
  guardar el «descuento efectivo»: deuda 100, pago 150 → 0; borrar el pago →
  100. Diferencia con hoy (aceptable, arguablemente más correcta): con dos
  pagos 150 y 30 sobre 100, borrar el de 150 deja 70 (hoy dejaría 100, porque
  hoy el de 30 «descontó 0»). Es lo que haría el banco con saldo a favor.
- Rebase («el saldo real es X»): `saldoBase = X + Σ pagos que descuentan
  (locales)`. Así el saldo mostrado queda en X y los pagos posteriores siguen
  restando. `statementBalance` (pago de contado de tarjetas) sigue el mismo
  esquema con su propio `contadoBase`.

**Fallas y cómo se tratan:**

1. *Rebase concurrente con un pago.* B fija X sin haber visto el pago p de A.
   Tras sincronizar: `X − p`. Es determinista y coincide con la regla que ya
   muestra la UI (D9: «si el pago es posterior al estado de cuenta, réstalo
   tú»): un pago que el dispositivo que fijó el saldo no conocía se considera
   posterior. El caso inverso (A borra p mientras B rebasa contando p) da
   `X + p`. Ambos son ambiguos *en origen* (no hay forma de saber si el estado
   de cuenta del banco incluía ese pago); lo importante es que converge y que
   el usuario lo corrige con un rebase. Se documenta, no se intenta adivinar.
2. *Un rebase implícito en cada guardado del formulario.* El formulario de
   edición siempre manda `balance` (`DebtsPage.tsx:123`). Si `updateDebt`
   rebasara siempre, editar la tasa recalcularía el base con los pagos locales
   y reintroduciría el caso 2 cuando hay un pago concurrente. Regla: **solo se
   rebasa si el `balance` recibido difiere del saldo derivado actual** (ídem
   `statementBalance`). Editar la tasa no toca `saldoBase`.
3. *Pagos históricos vinculados.* Si el saldo se deriva de *todos* los
   movimientos con `debtId`, vincular un gasto histórico bajaría el saldo. Hay
   dos formas de evitarlo, ver §4: se elige una marca sincronizada en el
   movimiento.
4. *Clientes viejos.* Siguen escribiendo `balance` como contador y no conocen
   `saldo_base`. Hay que detectar sus escrituras (§5.3).
5. *Costo de cálculo.* Recalcular es O(movimientos) por acción; con miles de
   filas es despreciable, y se puede indexar por `debtId` una vez por llamada.

**Trade-offs:** + resuelve el caso 1, el 2 y el 1.2 con un modelo simple y
testeable en funciones puras; + no toca el motor de sync ni `mergeById`; + el
historial y el saldo no pueden divergir por construcción. − Cambia el sentido
del campo `balance` (pasa a caché); − necesita columnas nuevas y una
transición con clientes viejos; − los rebases concurrentes siguen siendo LWW
(correcto: fijar un valor *es* una escritura absoluta).

### Opción B — Sync por eventos/deltas para `balance`

Cada cambio de saldo es un evento (tabla nueva `debt_events`: `+delta` por
pago, `set` por estado de cuenta) y el saldo es el pliegue de los eventos, o
bien se sincroniza el contador como CRDT (PN-counter por dispositivo) con un
registro «set» encima.

- *Variante ledger (tabla de eventos).* Los pagos **ya son** eventos: son las
  filas de `expenses` con `debtId`. Una tabla aparte duplicaría esa fuente de
  verdad (y abriría la divergencia pago-en-expenses vs. evento-en-debt_events).
  Lo único que aporta sobre A es un registro auditable de los rebases; el costo
  es una entidad sincronizada nueva (tabla, RLS, `keep_newest`, convertidores,
  merge, tombstones, backup, legacy-import) y un orden causal entre `set` y
  `delta` que el snapshot por `updated_at` no provee (un `set` concurrente con
  un `delta` tiene exactamente la misma ambigüedad que en A, §3.A.1).
- *Variante CRDT.* Requiere identidad de dispositivo estable, un mapa de
  contadores por dispositivo en la fila (jsonb) y un merge por campo distinto
  del resto de tablas. Rompe el contrato «merge por fila» de `sync.ts` y
  complica `keep_newest` (una fila con más contadores puede tener `updated_at`
  menor).

**Descartada:** reinventa en paralelo lo que A obtiene gratis porque los
eventos ya existen como movimientos.

### Opción C — Autoridad en el servidor (RPC de incremento atómico)

`registrar_pago(debt_id, monto)` hace `balance = balance - monto` en Postgres.
**Descartada:** rompe offline-first (los pagos offline tendrían que encolarse
como operaciones, con idempotencia propia) y no existe en modo sin Supabase,
que es de primera clase. Además el cliente seguiría necesitando un contador
local optimista que reconciliar.

### Opción D — Mantener el contador y «re-aplicar lo que el ganador no vio»

La fila de la deuda lleva la lista de ids de pagos ya absorbidos
(`pagos_aplicados jsonb`). Al mergear, el saldo = saldo del ganador + efecto de
los pagos vivos que no están en su lista − efecto de los listados que ya no
existen. Es la opción de menor diff aparente, pero: la lista crece sin límite,
el efecto de un pago «que ya no existe» exige recordar su monto (otra vez
estado por pago), y es equivalente a A con más piezas móviles.
**Descartada.**

### Opción E — Solo detectar y avisar

Comparar `balance` con lo esperable por el historial y mostrar «el saldo y el
historial no cuadran». Barata, pero no arregla nada y el umbral es arbitrario
(ediciones manuales legítimas descuadran). Útil como red de seguridad, no como
solución. **No se incluye**; si se quisiera, iría en un spec aparte.

### Recomendación

**Opción A**, con la marca de histórico sincronizada en el movimiento (§4) y
anclaje confirmado por el usuario deuda por deuda (§5).

---

## 4. `descuentosDePago` con la opción A

Explícitamente:

- **El descuento efectivo (`DescuentoPago.balance` / `.statement`) deja de
  hacer falta** para deudas ancladas: el tope a 0 se aplica al agregado. No se
  sincroniza porque desaparece.
- **La marca `vinculado` NO desaparece sola.** Un pago histórico es
  información («este pago existió») que *no* debe restar: el saldo que el
  usuario tenía ya lo incluía. Derivar el saldo de los movimientos no dice nada
  sobre cuáles son informativos. Alternativas:
  - *(a) Absorber en el base al vincular* (`saldoBase += monto`, sin marca).
    No necesita sincronizar nada extra, pero entonces **borrar** ese movimiento
    en cualquier dispositivo sube el saldo, que es justo lo que D7/D8 dicen que
    no debe pasar con un pago vinculado; y cada vínculo sería una escritura de
    la fila de la deuda (LWW con rebases). **Descartada.**
  - *(b) Marca sincronizada en el propio movimiento* (recomendada):
    `Transaction.debtHistorico?: true` ↔ columna `expenses.debt_historico`.
    Viaja en la **misma fila** que `debtId`, así que `debtId` y la marca se
    resuelven juntos por LWW atómico de esa fila: no pueden quedar
    desincronizados entre sí. Un pago con la marca no entra en Σ; borrarlo,
    editarle el monto o cambiarle la deuda no mueve ningún saldo en ningún
    dispositivo.
- Con (b), `descuentosDePago` solo sigue existiendo para las deudas **no
  ancladas** durante la transición (§5) y se retira en una versión posterior
  cuando no quede ninguna (fuera de alcance; anotar en el README de specs).
- El camino legado (`aplicarCambioDePagos`) también debe respetar
  `debtHistorico` (tratarlo como `vinculado`). Eso **arregla el hallazgo 1.2
  incluso antes de anclar**, en todos los dispositivos actualizados.
- La UI deja de consultar `descuentosDePago`: «Desvincular» se muestra para
  movimientos `expense` con `debtHistorico` (o, en deudas no ancladas, con la
  regla actual); el aviso de borrado usa `efectoDeBorrar` (§6.1), que es el
  mismo en todos los dispositivos.

---

## 5. Modelo de datos, transición y migración

### 5.1 Tipos (`src/types/index.ts`)

```ts
interface Debt {
  // ...campos actuales; `balance` y `statementBalance` pasan a ser CACHÉ
  //    derivada en deudas ancladas (nunca se editan directamente)
  /** Presente ⇔ deuda anclada. Saldo = max(0, saldoBase − Σ pagos que descuentan). */
  saldoBase?: number;
  /** Solo tarjetas con pago de contado; mismo esquema que saldoBase. */
  contadoBase?: number;
}
interface Transaction {
  // ...
  /** Pago histórico enlazado a mano: aparece en el historial, no descuenta. */
  debtHistorico?: true;
}
```

Claves solo presentes con valor (como `cutDay`, `debtId`), por
`igualEstructural`.

### 5.2 Supabase — `supabase/migrations/0020_debts_saldo_base.sql`

```sql
alter table public.debts
  add column if not exists saldo_base    numeric(14,2) check (saldo_base >= 0),
  add column if not exists contado_base  numeric(14,2) check (contado_base >= 0),
  add column if not exists saldo_base_at timestamptz;
alter table public.expenses
  add column if not exists debt_historico boolean;
```

- Nullable y sin default (convención 0017). Solo añade columnas: **no toca
  datos**, políticas ni grants. RLS por `user_id` ya cubre las columnas nuevas.
- **ORDEN: aplicar ANTES de desplegar el cliente** (como la 0019: sin ellas
  PostgREST responde 42703 y el cliente pasa a `local-only`). Documentarlo en
  la sección «Migración de Supabase» del README.
- `balance` se conserva: los clientes nuevos escriben ahí la caché derivada
  (valor correcto en el momento de escribir) para clientes viejos y consultas
  SQL. El `check (balance >= 0)` de la 0010 se cumple por el `max(0, …)`.
- `saldo_base >= 0` se cumple por construcción: todo rebase es
  `X + Σ` con X ≥ 0 (ver desvincular en §6.2).

### 5.3 Conversión fila ↔ deuda y detección de escrituras de clientes viejos (`sync.ts`)

- `debtToRow`: `saldo_base: d.saldoBase ?? null`, `contado_base:
  d.contadoBase ?? null`, `saldo_base_at: d.saldoBase !== undefined ?
  d.updated_at : null`, `balance: d.balance` (caché).
- `rowToDebt`: la deuda es **anclada** solo si `saldo_base != null` **y**
  `saldo_base_at` representa el mismo instante que `updated_at` (comparar con
  `Date.parse`, no como strings: Postgres devuelve `+00:00` y el cliente
  escribe `Z`). Si no, se devuelve sin `saldoBase`/`contadoBase` (no anclada)
  con el `balance` de la fila.
- Por qué funciona: un cliente viejo que escribe la deuda (pago, edición)
  manda `updated_at` nuevo pero no conoce `saldo_base_at`; el upsert no toca
  esa columna → quedan distintas → los clientes nuevos ven la deuda **no
  anclada** con el `balance` que puso el cliente viejo (que es su verdad,
  incluido su pago). La UI pide confirmar el saldo otra vez (§5.4). Sin bucles:
  anclar escribe `saldo_base_at = updated_at`.
- `expenseToRow`/`rowToExpense`: `debt_historico: t.debtHistorico ?? null` /
  clave solo si `true`. Un cliente viejo no manda la columna → el upsert la
  conserva.
- `applyMerge`: tras mergear `expenses` y `debts`, aplicar
  `recalcularSaldos(debts.live, expenses.live)` **antes** de comparar con el
  estado local, para que una caché distinta en la fila remota no dispare un
  `setState` ni un push en cada ciclo.
- Nada cambia en `mergeById`, el incremental, la marca de agua, `keep_newest`
  ni `hidratarAusentes`/`pendienteHidratar`.

### 5.4 Transición: anclaje confirmado por el usuario (recomendado)

Una deuda existente **no se ancla sola**. Mientras no esté anclada funciona
exactamente como hoy (camino legado: contador + `descuentosDePago`), con una
única mejora: respeta `debtHistorico` (§4).

Se ancla por acción explícita del usuario en la UI:

1. **«Confirmar saldo»** (acción nueva `confirmarSaldoDeuda(id)`), visible en
   cada deuda no anclada de la página Deudas con un texto tipo «Confirma que el
   saldo de $X coincide con tu banco para que se mantenga igual en todos tus
   dispositivos». Ancla **preservando el saldo mostrado**:
   `saldoBase = balance + Σ_{pagos que descuentan} (descuento efectivo local si
   existe en descuentosDePago, si no el monto)`. Usar el descuento efectivo
   importa: deuda 100, pago legado de 150 (descontó 100) → base 100, no 150;
   borrar luego ese pago devuelve 100, no 150 (no se inventan $50).
   `contadoBase` análogo con `statement`.
2. **Cualquier cambio del saldo** («Actualizar estado de cuenta» o el
   formulario con un `balance` distinto al actual) ancla con el valor
   ingresado (es el rebase de §3.A).
3. Deudas **nuevas** nacen ancladas (`saldoBase = balance`,
   `contadoBase = statementBalance`).

Si el saldo actual ya está mal (divergencia previa entre dispositivos), el
usuario lo corrige tecleando el valor del banco en «Actualizar estado de
cuenta», que es exactamente la acción de anclaje 2. Guiarlo, no corregirlo por
él.

**Alternativa (no recomendada): anclaje automático** en el primer ciclo
completo (o en `migrateV17`), preservando el saldo con la misma fórmula.
Arregla el bug para todos sin intervención, pero es una escritura automática
sobre filas financieras reales (bump de `updated_at` + columnas nuevas), elige
de facto el saldo de un dispositivo cuando ya hay divergencia, y dos
dispositivos que anclen a la vez con pagos locales distintos producen bases
distintas (converge por LWW, pero a la del último). Contradice la regla del
proyecto. Queda como decisión del usuario (§11).

### 5.5 Store (`financeStore`, v17)

`migrateV17` (encadenada, con test):

- Por cada entrada `descuentosDePago[id].vinculado` cuyo movimiento exista y
  tenga `debtId`: poner `debtHistorico: true` y renovar `updated_at` para que se
  suba. **No cambia montos ni saldos**: codifica en el dato sincronizado una
  decisión que el usuario ya tomó al pulsar «Vincular». Aun así es una
  escritura automática sobre movimientos existentes → confirmar con el usuario
  (§11). Alternativa manual: que el historial muestre «Vinculado solo en este
  dispositivo · Confirmar» y se aplique al pulsarlo.
- No ancla deudas (§5.4). Idempotente.

---

## 6. Diseño de funciones y acciones

### 6.1 Lógica pura — `src/lib/debt-balance.ts` (nuevo, con test propio)

- `pagaDeuda(t, debtId)`: `t.debtId === debtId && !t.debtHistorico`.
- `sumaDePagos(expenses): Map<debtId, number>` (una pasada, `roundMoney`).
- `saldoDerivado(debt, suma)`: `{ balance, statementBalance? }` con
  `max(0, base − Σ)`; para deudas no ancladas devuelve los valores actuales.
- `recalcularSaldos(debts, expenses): Debt[]` — **devuelve el mismo array y las
  mismas referencias** si nada cambió (render y `igualEstructural`); nunca toca
  `updated_at` (la caché no es una edición).
- `anclarDeuda(debt, expenses, descuentos): Debt` — §5.4.1, preserva `balance`.
- `rebasarDeuda(debt, expenses, { balance?, statementBalance? }): Debt` —
  solo rebasa el campo que difiere del derivado; si la deuda no está anclada,
  la ancla con el valor nuevo.
- `efectoDeBorrar(tx, debts, expenses, descuentos): number` — saldo sin `tx`
  menos saldo con `tx` para ancladas; `montoQueRevierte` actual para no
  ancladas. Reemplaza a `montoQueRevierte` en `MovementsPage` y
  `TransactionModal`.

`src/lib/debt-payments.ts`:

- `aplicarCambioDePagos` ignora deudas ancladas (no las toca ni les cambia
  `updated_at`) y trata `debtHistorico` como `vinculado`.
- `historialDeuda` sin cambios (reconstruye desde `balance`, que es correcto).
- `enlazarPagosAntiguos` sin cambios.

### 6.2 Acciones del store

| Acción | Cambio |
|---|---|
| add/update/delete/deleteMany/restore transacción | Legado para no ancladas (como hoy) + `recalcularSaldos` sobre el `expenses` resultante, en el mismo `set()`. Las ancladas no cambian `updated_at`. Un helper único (`ajustarDeudas(state, antes, despues, expensesNuevo)`) reemplaza a `cambioDePagos`. |
| `registerDebtPayment` | Sin cambios (pasa por `addTransaction`). |
| `addDebt` | Nace anclada. |
| `updateDebt` | Si `partial.balance`/`statementBalance` difieren del derivado → `rebasarDeuda`; si no, no se toca el base. `normalizarDeuda` también quita `contadoBase` si la deuda deja de ser tarjeta o se borra el contado. |
| `confirmarSaldoDeuda(id)` | Nueva: `anclarDeuda`. No-op si ya anclada. |
| `vincularPagoHistorico` | Pone `debtId` + `debtHistorico: true` (sincronizado). Deja de escribir en `descuentosDePago`. Ningún saldo cambia. |
| `desvincularPago` | Quita `debtId` y `debtHistorico`. Si el pago **descontaba** y la deuda está anclada, rebasa para conservar el saldo mostrado (`saldoBase = saldoAntes + Σ restante` ≥ 0). |
| `importBackup` | `recalcularSaldos` tras importar. `src/lib/backup.ts` exporta/importa `saldoBase`, `contadoBase`, `debtHistorico`; un respaldo viejo entra no anclado. |
| `deleteDebt`, `reset` | Sin cambios. |

`descuentosDePago` sigue en el estado (persistido, no sincronizado) solo para
el camino legado.

### 6.3 UI (mínima)

- `DebtsPage.tsx`: acción «Confirmar saldo» en deudas no ancladas (una línea
  de texto + botón en la tarjeta de la deuda; si se decide algo más visible,
  invocar la skill `frontend-design` antes). «Desvincular» según `debtHistorico`
  (§4). La hoja «Actualizar estado de cuenta» no cambia de aspecto.
- `MovementsPage.tsx`, `TransactionModal.tsx`: `efectoDeBorrar` en lugar de
  `montoQueRevierte`.

---

## 7. Plan de implementación (TDD, por pasos)

Rama `fix/sync-saldo-deudas` desde `main` actualizado. Cada paso: test rojo →
código → verde.

**Paso 0 — Reproducir el bug (tests que hoy fallan).** En
`src/__tests__/sync-conflictos.test.ts` (mock de Supabase con `vi.hoisted()` +
getter, como el resto):
1. Dos dispositivos, deuda 1000; A paga 100, B paga 200, B sube último → tras
   el ciclo el saldo esperado es 700 (hoy 800).
2. A paga 100; B (sin pull) edita la tasa y sube último → 900 (hoy 1000).
3. A vincula un histórico de 250; en B se borra → saldo intacto (hoy +250).
4. Pago de 150 sobre deuda 100 creado en A, borrado en B → 100 (hoy 150).

Los cuatro se escriben contra deudas **ancladas** (el 3 también contra una no
anclada, que se arregla con `debtHistorico`).

**Paso 1 — Lógica pura** (`src/lib/debt-balance.ts`,
`src/__tests__/debt-balance.test.ts`): tope agregado (150 y 30 sobre 100,
borrar 150 → 70); histórico excluido; `recalcularSaldos` conserva referencias
y `updated_at`; `anclarDeuda` preserva `balance` y usa el descuento efectivo;
`rebasarDeuda` es no-op con el mismo valor y solo toca el campo cambiado;
`contadoBase` análogo; `efectoDeBorrar` para anclada, no anclada e histórico.
Ajustar `debt-payments.test.ts`: `aplicarCambioDePagos` ignora ancladas y
respeta `debtHistorico`.

**Paso 2 — Supabase**: `supabase/migrations/0020_debts_saldo_base.sql` con la
cabecera habitual (contexto, ORDEN antes del deploy, consulta de
verificación). Aplicarla en el proyecto solo con OK del usuario.

**Paso 3 — Tipos y sync** (`src/types/index.ts`, `src/lib/sync.ts`):
convertidores y detección de §5.3; `recalcularSaldos` en `applyMerge`. Tests en
`sync.test.ts`/`sync-conflictos.test.ts`: ida y vuelta fila↔deuda anclada;
`saldo_base_at` ≠ `updated_at` → no anclada con el `balance` de la fila;
formatos `Z` vs `+00:00` equivalentes; ciclo sin novedades con caché remota
distinta no produce `setState` ni push; `debt_historico` ida y vuelta.
Los tests del paso 0 pasan a verde aquí.

**Paso 4 — Store v17** (`src/stores/financeStore.ts`,
`src/__tests__/debt-payments-store.test.ts`): tabla §6.2. Tests: cada acción de
transacción sobre anclada no cambia `saldoBase` ni `updated_at` de la deuda y
deja `balance === max(0, base − Σ)`; `updateDebt` de la tasa no rebasa;
estado de cuenta rebasa; `confirmarSaldoDeuda` preserva saldo; vincular /
desvincular preservan saldo en ambos modos; deudas no ancladas se comportan
exactamente como hoy (los tests actuales deben seguir verdes sin tocarlos);
`migrateV17` (marca histórica, idempotente, cadena desde v14 llega a v17);
`importBackup` de respaldo viejo → no anclada. Test de invariante: secuencia
aleatoria de acciones sobre deudas ancladas → siempre `balance` derivado.

**Paso 5 — UI** (`DebtsPage.tsx`, `MovementsPage.tsx`,
`TransactionModal.tsx`, `src/lib/backup.ts`): tests en `debts-page.test.tsx`
(«Confirmar saldo» visible solo en no ancladas, no cambia el saldo mostrado;
«Desvincular» por `debtHistorico`) y en los tests de borrado (aviso con
`efectoDeBorrar`).

**Paso 6 — Cierre**: README («Migración de Supabase»: 0020 y su orden;
nota en datos: el saldo de una deuda anclada se deriva de sus pagos),
`CLAUDE.md` (la frase de la invariante de deudas cambia: los pagos ya no
escriben la deuda; confirmar con el usuario antes de tocarlo), wiki
`stores-zustand.md`/`sync-y-autenticacion.md` si el usuario lo pide.
`npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx vite build` (borrar
`dist/`). Revisión (Opus) de §5.3 y §6.2 antes del PR.

Partición sugerida: ola 1 en paralelo — pasos 1 y 2; ola 2 — paso 3 y paso 4
(dependen de 1; comparten tipos: fijar primero el contrato de §5.1); ola 3 —
paso 5; ola 4 — paso 6.

---

## 8. Riesgos

- **Clientes viejos tras el deploy.** Mientras un dispositivo no actualice,
  cada pago o edición suya desancla la deuda (§5.3) y vuelve el
  comportamiento de hoy para ella. Mitigación: actualizar todos los
  dispositivos (banner de nueva versión) y reconfirmar. No hay forma de
  bloquearlos.
- **Caché `balance` en BD desactualizada.** Como los pagos no reescriben la
  deuda, la columna `balance` solo se refresca cuando la fila se sube por otro
  motivo (o en un push completo). Solo la leen clientes viejos y consultas SQL
  a mano; documentarlo.
- **Rebases concurrentes** siguen siendo LWW (§3.A.1): correcto por semántica,
  pero el usuario puede ver su valor reemplazado por el de otro dispositivo.
- **Cambio de semántica del tope** (agregado vs. por pago): cifras distintas a
  las de hoy solo al borrar pagos que excedieron el saldo. Test explícito.
- **Olvidar recalcular en un camino nuevo.** Mitiga el test de invariante del
  paso 4 y centralizar en `ajustarDeudas`/`recalcularSaldos`.

## 9. Metas de ahorro (fuera de este cambio)

Mismo defecto (`saved` es contador con LWW). La opción A se traslada
(`savedBase + Σ aportes`), pero necesita antes: `expenses.goal_id` para los
aportes con cuenta y una representación sincronizada para los aportes **sin**
cuenta (hoy no crean fila alguna), además de decidir qué pasa al borrar un
«Aporte a X» (hoy no baja `saved`). Menor severidad: no es un pasivo y el
patrimonio usa `min(savedFromAccounts, saved)`. Recomendación: spec propio
(`sync-aportes-metas.md`) tras cerrar este.

## 10. Qué NO cambia

- `mergeById`, `mergeBudgets`, `hidratarAusentes`, el contrato LWW por fila de
  **todas** las tablas, el incremental, la marca de agua, `keep_newest`, los
  tombstones y `pendienteHidratar`.
- `projectDebts` (snowball/avalanche), `networth`, `estadoTarjeta`,
  impresión/CSV y el Resumen: siguen leyendo `debt.balance`.
- `historialDeuda`, `enlazarPagosAntiguos`, `cuentaComoGasto`, `etiquetaPago`,
  los saldos de cuentas (`accountBalance`) y la forma de registrar pagos (D4).
- Las decisiones D1–D9 de `deudas-pagos-unificados.md`, salvo que D8/D9 ahora
  se cumplen también entre dispositivos.
- Metas de ahorro (§9).
- Ningún dato existente se corrige automáticamente; no hay scripts sobre
  Supabase ni sobre el estado local más allá de §5.5 (y esa parte, sujeta a OK).
- No hay triggers, vistas ni RPC nuevos en el servidor.

## 11. Decisiones (resueltas por el usuario, 2026-09-30)

1. **Anclaje**: confirmación manual deuda por deuda (§5.4, opción
   recomendada). Ninguna deuda existente se ancla sola.
2. **Marcas «vinculado» locales**: se suben automáticamente como
   `debt_historico` en `migrateV17` (solo metadatos — qué pago ya estaba
   vinculado —, sin montos ni saldos).
3. **Semántica del rebase concurrente** (§3.A.1): confirmado. Un pago que el
   dispositivo que fijó el saldo no conocía sigue restando después.
4. **Metas de ahorro** (§9): fuera de alcance, spec aparte
   (`sync-aportes-metas.md`) después de cerrar este.
5. **Aplicar la 0020** en el proyecto Supabase antes del deploy del cliente, y
   actualizar todos los dispositivos después (orden obligatorio, no es una
   preferencia — ver §5.2).

Con esto el spec queda cerrado para pasar a implementación (§7).
