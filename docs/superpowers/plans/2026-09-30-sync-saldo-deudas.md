# Saldo de deudas convergente entre dispositivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el saldo de una deuda (y su pago de contado) sea una función determinista del estado sincronizado —`max(0, saldoBase − Σ pagos que descuentan)`— para que pagos concurrentes se sumen, editar otros campos no pierda pagos y borrar/editar un pago (incluidos los históricos vinculados a mano) tenga el mismo efecto en todos los dispositivos.

**Architecture:** Opción A del spec. Una deuda *anclada* (`saldoBase` presente) guarda un saldo base que solo cambia cuando el usuario fija el saldo; `balance`/`statementBalance` pasan a ser caché recalculada con `recalcularSaldos` a partir de los movimientos con `debtId` (los marcados `debtHistorico` no descuentan). Los pagos ya no reescriben la fila de la deuda. Las deudas no ancladas siguen el camino legado (`aplicarCambioDePagos` + `descuentosDePago`), que ahora ignora las ancladas y respeta `debtHistorico`. El sync solo gana columnas y una detección de escrituras de clientes viejos (`saldo_base_at` ≠ `updated_at` ⇒ no anclada); el anclaje de deudas existentes es siempre una acción explícita del usuario.

**Tech Stack:** React 19 + TypeScript (strict) + Zustand (`persist`, versión 16 → 17) + Supabase (PostgREST) + Vitest/Testing Library.

**Spec:** `.agents/specs/sync-saldo-deudas.md` (autoridad de diseño; §11 ya está resuelto — no reabrir decisiones). El implementador de cada tarea debería leer al menos §4, §5 y §6 del spec antes de empezar.

## Global Constraints

- `mergeById`, `mergeBudgets`, `hidratarAusentes`, el incremental, la marca de agua, `keep_newest`, los tombstones y `pendienteHidratar` NO se tocan (spec §5.3, §10). `src/lib/merge.ts` no se modifica.
- Ninguna deuda existente se ancla automáticamente (decisión §11.1): el anclaje ocurre solo con `confirmarSaldoDeuda`, al cambiar el saldo/contado (formulario o «Actualizar estado de cuenta») o al crear una deuda nueva.
- Las marcas `vinculado` locales SÍ se suben automáticamente como `debtHistorico`/`debt_historico` en `migrateV17` (decisión §11.2) — sin tocar montos ni saldos.
- `descuentosDePago` sigue existiendo (persistido, no sincronizado) para las deudas no ancladas; no se borra en este cambio.
- La migración `0020_debts_saldo_base.sql` se escribe pero NO se aplica a ningún proyecto Supabase real desde una tarea: lo hace el controlador de la sesión con OK explícito del usuario, y siempre ANTES de desplegar el cliente (§11.5).
- Consumidores de `balance` (`projectDebts` y demás de `src/lib/debts.ts`, `src/lib/networth.ts`, `estadoTarjeta`, impresión/CSV, Resumen) siguen leyendo `debt.balance` sin cambios; `historialDeuda` y `enlazarPagosAntiguos` no cambian.
- Cada tarea termina con los tests afectados en verde (`npx vitest run <archivos>`) y, si tocó código de producción, `npx tsc --noEmit` limpio.
- Idioma de código, comentarios, mensajes de UI y commits: español (Conventional Commits en español: `feat:`, `fix:`, `test:`, `docs:`). Todo `catch` captura `err: unknown` y hace *type narrowing*. Exportaciones con nombre, sin `default export`.
- Nombres idénticos en todas las tareas: `saldoBase`, `contadoBase`, `saldoBaseAt`/`saldo_base_at`, `debtHistorico`/`debt_historico`, `confirmarSaldoDeuda`, `anclarDeuda`, `rebasarDeuda`, `recalcularSaldos`, `sumaDePagos`, `saldoDerivado`, `pagaDeuda`, `efectoDeBorrar`, `ajustarDeudas`. Nombre auxiliar añadido por este plan: `estaAnclada`.
- Claves opcionales solo presentes con valor (`saldoBase`, `contadoBase`, `debtHistorico`), como `cutDay`/`debtId`, para que `igualEstructural` compare bien local vs. remoto.
- No hacer `git push` ni abrir PR desde ninguna tarea; los commits los hace el implementador en la rama del worktree (`worktree-fix+sync-saldo-deudas`) y el controlador añade el trailer de atribución que corresponda a la sesión.

## Notas del plan (desviaciones respecto al orden del §7 del spec)

1. **Paso 0 (tests de reproducción) va después de las Tasks 1–3.** El spec pide escribirlos contra deudas *ancladas*, un concepto que no existe en los tipos hasta la Task 1. Para no dejar la suite en rojo entre tareas, la Task 4 los escribe con `it.fails(...)` (Vitest da verde mientras el test falle, es decir, mientras el bug siga ahí); la Task 5 los convierte a `it` al arreglar el sync (casos 1, 2, 3a, 3b) y la Task 6 el caso 4 (necesita el store).
2. **Los tipos (§5.1) se adelantan a la Task 1**, junto con la lógica pura: `debt-balance.ts` no compila sin `Debt.saldoBase` ni `Transaction.debtHistorico`. La Task 5 queda solo con `sync.ts`.
3. **`rebasarDeuda` acepta un cuarto parámetro opcional `descuentos`** (por defecto `{}`): anclar una deuda no anclada al rebasarla necesita el descuento efectivo local (spec §5.4.1) para no inventar dinero. La firma del spec (`debt, expenses, { balance?, statementBalance? }`) sigue siendo válida.
4. **`anclarDeuda` con saldo > 0 usa Σ montos**, no Σ efectivos: es la única base que cumple «preserva el `balance` mostrado» cuando un pago legado con tope coexiste con un saldo editado después. Con saldo 0 usa Σ efectivos (el ejemplo del spec: base 100, no 150). Está documentado en el propio código.
5. **Tests existentes que hay que tocar.** `addDebt` ahora crea deudas ancladas, así que cuatro tests que inspeccionan el registro legado (`descuentosDePago`) o inyectan pagos «antiguos» con `setState` pasan a sembrar una deuda **no anclada** (que es lo que prueban); y tres aserciones de `version === 16` pasan a 17. Todos están listados con su código exacto en la Task 6. Ningún test cambia de intención.
6. **`TransactionModal`**: con el tope agregado, un pago puede no mover el saldo sin ser un histórico (p. ej. borrar un pago de 30 cuando otro de 150 ya dejó la deuda en 0). El aviso distingue ese caso («el saldo no cambiará») del pago vinculado a mano.
7. Sugerencia de modelos para el controlador (CLAUDE.md): Tasks 5 y 6 → Opus (sync/store, bugs sutiles); Tasks 1, 3, 4, 7, 8 → Sonnet; Task 2 → Sonnet o Haiku.

## Mapa de archivos

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `src/types/index.ts` | 1 | `Debt.saldoBase?`, `Debt.contadoBase?`, `Transaction.debtHistorico?` |
| `src/lib/debt-balance.ts` (nuevo) | 1 | Lógica pura del saldo derivado |
| `src/__tests__/debt-balance.test.ts` (nuevo) | 1 | Tests de la lógica pura |
| `supabase/migrations/0020_debts_saldo_base.sql` (nuevo) | 2 | Columnas nuevas |
| `src/lib/debt-payments.ts` | 3 | Camino legado: ignora ancladas, respeta `debtHistorico` |
| `src/__tests__/debt-payments.test.ts` | 3, 6 | Tests del camino legado; versión 17 |
| `src/__tests__/sync-conflictos.test.ts` | 4, 5, 6 | Reproducción (Paso 0) y tests de sync |
| `src/lib/sync.ts` | 5 | Conversores fila↔entidad, detección de clientes viejos, `recalcularSaldos` en `applyMerge` |
| `src/lib/credit-card.ts` | 6 | `normalizarDeuda` valida `saldoBase`/`contadoBase` |
| `src/stores/financeStore.ts` | 6 | v17: `ajustarDeudas`, `migrateV17`, `confirmarSaldoDeuda`, acciones ajustadas |
| `src/__tests__/debt-payments-store.test.ts`, `finance-migrate-versiones.test.ts`, `credit-card.test.ts`, `transaction-modal.test.tsx` | 6 | Tests del store; ajustes de fixtures/versión |
| `src/pages/DebtsPage.tsx` | 7 | «Confirmar saldo», regla de «Desvincular» |
| `src/pages/MovementsPage.tsx`, `src/components/features/movements/TransactionModal.tsx` | 7 | `efectoDeBorrar` en lugar de `montoQueRevierte` |
| `src/__tests__/debts-page.test.tsx`, `movements-pagos-deuda.test.tsx`, `transaction-modal.test.tsx`, `backup.test.ts` | 7 | Tests de UI y de respaldo |
| `README.md`, `.agents/specs/README.md` | 8 | Documentación |

`src/lib/backup.ts` **no necesita cambios**: exporta/importa las entidades tal cual (las claves nuevas viajan solas y un respaldo viejo entra sin `saldoBase`, es decir, no anclado). La Task 7 lo fija con un test. `src/lib/merge.ts`, `src/lib/debts.ts` y `src/lib/networth.ts` no se tocan.

---

### Task 1: Tipos y lógica pura del saldo derivado

**Files:**
- Modify: `src/types/index.ts:38-58` (interface `Transaction`) y `src/types/index.ts:110-131` (interface `Debt`)
- Create: `src/lib/debt-balance.ts`
- Test: `src/__tests__/debt-balance.test.ts` (nuevo)

**Interfaces:**
- Consumes: `roundMoney(amount: number): number` de `src/lib/utils.ts`; `montoQueRevierte(t, descuentos): number` y `type DescuentosDePago` de `src/lib/debt-payments.ts` (ya existen).
- Produces (usadas por Tasks 3, 5, 6, 7):
  - `Debt.saldoBase?: number`, `Debt.contadoBase?: number`, `Transaction.debtHistorico?: true`
  - `estaAnclada(d: Pick<Debt, 'saldoBase'>): boolean`
  - `pagaDeuda(t: Pick<Transaction, 'debtId' | 'debtHistorico'>, debtId: string): boolean`
  - `sumaDePagos(expenses: readonly PagoDeDeuda[]): Map<string, number>` con `type PagoDeDeuda = Pick<Transaction, 'debtId' | 'debtHistorico' | 'amount'>`
  - `saldoDerivado(debt: Debt, suma: ReadonlyMap<string, number>): SaldoDerivado` con `interface SaldoDerivado { balance: number; statementBalance?: number }`
  - `recalcularSaldos(debts: Debt[], expenses: readonly PagoDeDeuda[]): Debt[]`
  - `anclarDeuda(debt: Debt, expenses: readonly Transaction[], descuentos: DescuentosDePago): Debt`
  - `rebasarDeuda(debt: Debt, expenses: readonly Transaction[], cambios: { balance?: number; statementBalance?: number }, descuentos?: DescuentosDePago): Debt`
  - `efectoDeBorrar(tx: Pick<Transaction, 'id' | 'debtId' | 'debtHistorico' | 'amount'>, debts: readonly Debt[], expenses: readonly Transaction[], descuentos: DescuentosDePago): number`

- [ ] **Step 1: Añadir los campos a los tipos**

En `src/types/index.ts`, dentro de `interface Transaction`, justo después de `debtId?: string | null;` (línea 55):

```ts
  /** Pago histórico enlazado a mano (vincularPagoHistorico): aparece en el
   *  historial de la deuda pero NO descuenta de su saldo, en ningún
   *  dispositivo. Solo existe con valor `true` (ver lib/debt-balance). */
  debtHistorico?: true;
```

En `interface Debt`, reemplazar el comentario de la interfaz (línea 110) y añadir los dos campos justo antes de `updated_at` (línea 130):

```ts
/**
 * Deuda (Balance Dual: `debts`). Si está ANCLADA (`saldoBase` presente), el
 * saldo no es un contador: `balance = max(0, saldoBase − Σ pagos)` y
 * `balance`/`statementBalance` son caché (ver lib/debt-balance). Sin
 * `saldoBase` sigue el camino legado: cada pago baja el saldo (lib/debt-payments).
 */
export interface Debt {
```

```ts
  // ── Saldo derivado (0020; spec sync-saldo-deudas) ──
  /** Presente ⇔ deuda anclada. Solo cambia cuando el usuario FIJA el saldo. */
  saldoBase?: number;
  /** Solo tarjetas con pago de contado: base de `statementBalance`, mismo esquema. */
  contadoBase?: number;
```

- [ ] **Step 2: Escribir el test (rojo)**

Crear `src/__tests__/debt-balance.test.ts`:

```ts
// ================================================================
// TESTS — lib/debt-balance: saldo de deuda derivado de sus pagos
// (spec .agents/specs/sync-saldo-deudas.md §6.1)
// ================================================================

import { describe, it, expect } from 'vitest';
import {
  estaAnclada, pagaDeuda, sumaDePagos, saldoDerivado, recalcularSaldos,
  anclarDeuda, rebasarDeuda, efectoDeBorrar,
} from '@/lib/debt-balance';
import type { Debt, Transaction } from '@/types';

const deuda = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000,
  annualRate: 30, minPayment: 50, payDay: 10, updated_at: '2026-09-01T00:00:00.000Z', ...o,
});
const mov = (o: Partial<Transaction> = {}): Transaction => ({
  id: 'm1', type: 'expense', amount: 100, concept: 'Pago Visa', date: '2026-09-05',
  category: 'pago-tarjetas', method: 'transfer', businessType: 'personal', accountId: null,
  toAccountId: null, updated_at: '2026-09-05T00:00:00.000Z', ...o,
});

describe('lib/debt-balance', () => {
  it('estaAnclada y pagaDeuda', () => {
    expect(estaAnclada(deuda())).toBe(false);
    expect(estaAnclada(deuda({ saldoBase: 0 }))).toBe(true);
    expect(pagaDeuda(mov({ debtId: 'd1' }), 'd1')).toBe(true);
    expect(pagaDeuda(mov({ debtId: 'd2' }), 'd1')).toBe(false);
    expect(pagaDeuda(mov({ debtId: 'd1', debtHistorico: true }), 'd1')).toBe(false);
    expect(pagaDeuda(mov(), 'd1')).toBe(false);
  });

  it('sumaDePagos: una pasada, redondeada, sin históricos ni movimientos sueltos', () => {
    const suma = sumaDePagos([
      mov({ id: 'a', debtId: 'd1', amount: 100.1 }),
      mov({ id: 'b', debtId: 'd1', amount: 200.2, type: 'transfer' }),
      mov({ id: 'c', debtId: 'd2', amount: 50 }),
      mov({ id: 'h', debtId: 'd1', amount: 999, debtHistorico: true }),
      mov({ id: 's', amount: 70 }),
    ]);
    expect(suma.get('d1')).toBe(300.3);
    expect(suma.get('d2')).toBe(50);
    expect(suma.size).toBe(2);
  });

  it('saldoDerivado: tope a 0 agregado (150 y 30 sobre 100 → 0; sin el de 150 → 70)', () => {
    const d = deuda({ saldoBase: 100, contadoBase: 100, balance: 0, statementBalance: 0 });
    const ambos = sumaDePagos([mov({ id: 'a', debtId: 'd1', amount: 150 }), mov({ id: 'b', debtId: 'd1', amount: 30 })]);
    expect(saldoDerivado(d, ambos)).toEqual({ balance: 0, statementBalance: 0 });
    const soloB = sumaDePagos([mov({ id: 'b', debtId: 'd1', amount: 30 })]);
    expect(saldoDerivado(d, soloB)).toEqual({ balance: 70, statementBalance: 70 });
  });

  it('saldoDerivado: una deuda no anclada devuelve sus valores actuales', () => {
    const suma = sumaDePagos([mov({ debtId: 'd1', amount: 300 })]);
    expect(saldoDerivado(deuda({ balance: 640 }), suma)).toEqual({ balance: 640 });
    expect(saldoDerivado(deuda({ balance: 640, statementBalance: 20 }), suma)).toEqual({ balance: 640, statementBalance: 20 });
  });

  it('recalcularSaldos: corrige la caché sin tocar updated_at y conserva referencias', () => {
    const anclada = deuda({ id: 'd1', saldoBase: 1000, balance: 1000, updated_at: 'X' });
    const legada = deuda({ id: 'd2', balance: 500 });
    const pagos = [mov({ debtId: 'd1', amount: 100 }), mov({ id: 'm2', debtId: 'd2', amount: 50 })];
    const out = recalcularSaldos([anclada, legada], pagos);
    expect(out[0]).toMatchObject({ balance: 900, saldoBase: 1000, updated_at: 'X' });
    expect(out[1]).toBe(legada);

    const estable = [out[0], legada];
    expect(recalcularSaldos(estable, pagos)).toBe(estable); // nada cambia → mismo array
    const sinAncladas = [legada];
    expect(recalcularSaldos(sinAncladas, pagos)).toBe(sinAncladas);
  });

  it('recalcularSaldos: el pago de contado se deriva de contadoBase', () => {
    const d = deuda({ saldoBase: 1000, contadoBase: 300, balance: 1000, statementBalance: 300 });
    const [n] = recalcularSaldos([d], [mov({ debtId: 'd1', amount: 200 })]);
    expect(n).toMatchObject({ balance: 800, statementBalance: 100 });
  });

  it('anclarDeuda preserva el saldo y usa el descuento efectivo del registro local', () => {
    // Deuda 100, pago legado de 150 que descontó 100 → base 100 (no 150)
    const pagada = deuda({ balance: 0, statementBalance: 0 });
    const pago = mov({ id: 'p', debtId: 'd1', amount: 150 });
    const a = anclarDeuda(pagada, [pago], { p: { balance: 100, statement: 100 } });
    expect(a).toMatchObject({ saldoBase: 100, contadoBase: 100, balance: 0, statementBalance: 0 });
    expect(saldoDerivado(a, sumaDePagos([pago])).balance).toBe(0);
    expect(saldoDerivado(a, sumaDePagos([])).balance).toBe(100); // borrar el pago devuelve 100

    // Sin registro (otro dispositivo, dato antiguo): el monto entero
    expect(anclarDeuda(deuda({ balance: 700 }), [mov({ debtId: 'd1', amount: 300 })], {}).saldoBase).toBe(1000);
    // Saldo > 0 con un pago recortado: la base preserva el saldo mostrado
    const recortado = anclarDeuda(deuda({ balance: 500 }), [mov({ debtId: 'd1', amount: 150 })], { m1: { balance: 100 } });
    expect(saldoDerivado(recortado, sumaDePagos([mov({ debtId: 'd1', amount: 150 })])).balance).toBe(500);
    // Los históricos no entran en la base
    expect(anclarDeuda(deuda({ balance: 1000 }), [mov({ debtId: 'd1', amount: 250, debtHistorico: true })], {}).saldoBase).toBe(1000);
    // Sin pago de contado no nace contadoBase; ya anclada → misma referencia
    expect('contadoBase' in anclarDeuda(deuda(), [], {})).toBe(false);
    const ya = deuda({ saldoBase: 1000 });
    expect(anclarDeuda(ya, [], {})).toBe(ya);
  });

  it('rebasarDeuda: no-op con el mismo valor; solo toca el campo que cambia', () => {
    const d = deuda({ saldoBase: 1000, balance: 800, contadoBase: 300, statementBalance: 100 });
    const pagos = [mov({ debtId: 'd1', amount: 200 })];
    expect(rebasarDeuda(d, pagos, { balance: 800, statementBalance: 100 })).toBe(d);
    expect(rebasarDeuda(d, pagos, {})).toBe(d);

    const nuevoSaldo = rebasarDeuda(d, pagos, { balance: 1200 });
    expect(nuevoSaldo).toMatchObject({ saldoBase: 1400, balance: 1200, contadoBase: 300, statementBalance: 100 });

    const nuevoContado = rebasarDeuda(d, pagos, { statementBalance: 0 });
    expect(nuevoContado).toMatchObject({ saldoBase: 1000, balance: 800, contadoBase: 200, statementBalance: 0 });

    expect(rebasarDeuda(d, pagos, { balance: -5 })).toMatchObject({ saldoBase: 200, balance: 0 });
  });

  it('rebasarDeuda ancla una deuda no anclada solo si el valor cambia', () => {
    const legada = deuda({ balance: 700, statementBalance: 50 });
    const pagos = [mov({ debtId: 'd1', amount: 300 })];
    const igual = rebasarDeuda(legada, pagos, { balance: 700 });
    expect(igual).toBe(legada);
    expect(estaAnclada(igual)).toBe(false);

    const anclada = rebasarDeuda(legada, pagos, { balance: 900 });
    expect(anclada).toMatchObject({ saldoBase: 1200, balance: 900, contadoBase: 350, statementBalance: 50 });
    expect(saldoDerivado(anclada, sumaDePagos(pagos))).toEqual({ balance: 900, statementBalance: 50 });
  });

  it('efectoDeBorrar: anclada, anclada con tope, histórico, no anclada y sin deuda', () => {
    const base1000 = deuda({ saldoBase: 1000, balance: 800 });
    const p = mov({ id: 'p', debtId: 'd1', amount: 200 });
    expect(efectoDeBorrar(p, [base1000], [p], {})).toBe(200);

    const base100 = deuda({ saldoBase: 100, balance: 0 });
    const a = mov({ id: 'a', debtId: 'd1', amount: 150 });
    const b = mov({ id: 'b', debtId: 'd1', amount: 30 });
    expect(efectoDeBorrar(a, [base100], [a, b], {})).toBe(70);
    expect(efectoDeBorrar(b, [base100], [a, b], {})).toBe(0);

    const h = mov({ id: 'h', debtId: 'd1', amount: 250, debtHistorico: true });
    expect(efectoDeBorrar(h, [base1000], [h], {})).toBe(0);
    expect(efectoDeBorrar(h, [deuda()], [h], {})).toBe(0);

    const legado = mov({ id: 'l', debtId: 'd1', amount: 300 });
    expect(efectoDeBorrar(legado, [deuda({ balance: 0 })], [legado], { l: { balance: 100 } })).toBe(100);
    expect(efectoDeBorrar(legado, [deuda({ balance: 0 })], [legado], {})).toBe(300);

    expect(efectoDeBorrar(mov(), [base1000], [], {})).toBe(0); // no paga deuda
    expect(efectoDeBorrar(p, [], [p], {})).toBe(0); // la deuda ya no existe
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/__tests__/debt-balance.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/debt-balance"`.

- [ ] **Step 4: Implementar `src/lib/debt-balance.ts`**

```ts
// ================================================================
// SALDO DERIVADO DE DEUDAS (spec .agents/specs/sync-saldo-deudas.md)
//
// Una deuda ANCLADA (con `saldoBase`) no guarda su saldo como contador:
//   balance          = max(0, saldoBase   − Σ pagos que descuentan)
//   statementBalance = max(0, contadoBase − Σ pagos que descuentan)
// Los pagos son filas propias de `expenses`: dos dispositivos que pagan a la
// vez convergen al mismo saldo porque la fila de la deuda no se reescribe y
// el tope a 0 se aplica al agregado, no pago a pago. `balance` y
// `statementBalance` quedan como caché (recalcularSaldos).
//
// Las deudas NO ancladas siguen el camino legado (aplicarCambioDePagos +
// descuentosDePago) hasta que el usuario confirma su saldo. Todo es puro.
// ================================================================

import { roundMoney } from './utils';
import { montoQueRevierte, type DescuentosDePago } from './debt-payments';
import type { Debt, Transaction } from '@/types';

type PagoDeDeuda = Pick<Transaction, 'debtId' | 'debtHistorico' | 'amount'>;

export interface SaldoDerivado {
  balance: number;
  statementBalance?: number;
}

/** ¿El saldo de esta deuda se deriva de sus pagos? */
export function estaAnclada(d: Pick<Debt, 'saldoBase'>): boolean {
  return d.saldoBase !== undefined;
}

/** ¿Este movimiento descuenta de esa deuda? Los históricos vinculados a mano no. */
export function pagaDeuda(t: Pick<Transaction, 'debtId' | 'debtHistorico'>, debtId: string): boolean {
  return t.debtId === debtId && !t.debtHistorico;
}

/** Total que descuenta cada deuda (id → suma), en una sola pasada. */
export function sumaDePagos(expenses: readonly PagoDeDeuda[]): Map<string, number> {
  const suma = new Map<string, number>();
  for (const t of expenses) {
    if (!t.debtId || t.debtHistorico) continue;
    suma.set(t.debtId, roundMoney((suma.get(t.debtId) ?? 0) + t.amount));
  }
  return suma;
}

/**
 * Saldo (y pago de contado) que corresponde a la deuda con esos pagos. Una
 * deuda no anclada devuelve sus valores actuales. Una anclada sin
 * `contadoBase` conserva el `statementBalance` que tenga (no lo inventa).
 */
export function saldoDerivado(debt: Debt, suma: ReadonlyMap<string, number>): SaldoDerivado {
  if (debt.saldoBase === undefined) {
    return debt.statementBalance !== undefined
      ? { balance: debt.balance, statementBalance: debt.statementBalance }
      : { balance: debt.balance };
  }
  const pagado = suma.get(debt.id) ?? 0;
  const tope = (base: number) => roundMoney(Math.max(0, base - pagado));
  const out: SaldoDerivado = { balance: tope(debt.saldoBase) };
  if (debt.contadoBase !== undefined) out.statementBalance = tope(debt.contadoBase);
  else if (debt.statementBalance !== undefined) out.statementBalance = debt.statementBalance;
  return out;
}

/**
 * Pone al día la caché de las deudas ancladas. Devuelve el MISMO array (y las
 * mismas referencias) si nada cambió, para no disparar renders ni un
 * setState/push del sync. Nunca toca `updated_at`: la caché no es una edición.
 */
export function recalcularSaldos(debts: Debt[], expenses: readonly PagoDeDeuda[]): Debt[] {
  if (!debts.some(estaAnclada)) return debts;
  const suma = sumaDePagos(expenses);
  let cambio = false;
  const out = debts.map((d) => {
    if (d.saldoBase === undefined) return d;
    const s = saldoDerivado(d, suma);
    if (s.balance === d.balance && s.statementBalance === d.statementBalance) return d;
    cambio = true;
    const n: Debt = { ...d, balance: s.balance };
    if (s.statementBalance !== undefined) n.statementBalance = s.statementBalance;
    return n;
  });
  return cambio ? out : debts;
}

/**
 * Ancla una deuda PRESERVANDO el saldo mostrado (spec §5.4.1). Con saldo > 0
 * la base es saldo + Σ montos (lo único que hace que base − Σ dé el saldo
 * exacto); con saldo 0, saldo + Σ descuento efectivo del registro local, que
 * es la base más baja que lo preserva y no inventa dinero al borrar un pago
 * que excedió la deuda (deuda 100, pago 150 que descontó 100 → base 100).
 * Una deuda ya anclada se devuelve tal cual. No toca `updated_at`.
 */
export function anclarDeuda(debt: Debt, expenses: readonly Transaction[], descuentos: DescuentosDePago): Debt {
  if (debt.saldoBase !== undefined) return debt;
  let montos = 0;
  let efectivoSaldo = 0;
  let efectivoContado = 0;
  for (const t of expenses) {
    if (!pagaDeuda(t, debt.id)) continue;
    const rec = descuentos[t.id];
    montos += t.amount;
    efectivoSaldo += rec ? rec.balance : t.amount;
    efectivoContado += rec ? (rec.statement ?? 0) : t.amount;
  }
  const base = (saldo: number, efectivo: number) => roundMoney(saldo > 0 ? saldo + montos : saldo + efectivo);
  const n: Debt = { ...debt, saldoBase: base(debt.balance, efectivoSaldo) };
  if (debt.statementBalance !== undefined) n.contadoBase = base(debt.statementBalance, efectivoContado);
  return n;
}

/**
 * «El saldo real es X» (estado de cuenta, formulario). Solo rebasa el campo
 * cuyo valor difiere del derivado actual: editar la tasa (que reenvía el mismo
 * saldo) no toca la base, y así no reintroduce la pérdida de pagos
 * concurrentes (spec §3.A.2). Base nueva = X + Σ pagos locales que
 * descuentan. Si la deuda no estaba anclada y algo cambia, primero se ancla
 * (con `descuentos`) y luego se fija el valor. No toca `updated_at`.
 */
export function rebasarDeuda(
  debt: Debt,
  expenses: readonly Transaction[],
  cambios: { balance?: number; statementBalance?: number },
  descuentos: DescuentosDePago = {},
): Debt {
  const suma = sumaDePagos(expenses);
  const actual = saldoDerivado(debt, suma);
  const nuevoSaldo = cambios.balance !== undefined ? roundMoney(Math.max(0, cambios.balance)) : undefined;
  const nuevoContado = cambios.statementBalance !== undefined ? roundMoney(Math.max(0, cambios.statementBalance)) : undefined;
  const cambiaSaldo = nuevoSaldo !== undefined && nuevoSaldo !== actual.balance;
  const cambiaContado = nuevoContado !== undefined && nuevoContado !== actual.statementBalance;
  if (!cambiaSaldo && !cambiaContado) return debt;

  const pagado = suma.get(debt.id) ?? 0;
  let n = anclarDeuda(debt, expenses, descuentos);
  if (cambiaSaldo && nuevoSaldo !== undefined) {
    n = { ...n, saldoBase: roundMoney(nuevoSaldo + pagado), balance: nuevoSaldo };
  }
  if (cambiaContado && nuevoContado !== undefined) {
    n = { ...n, contadoBase: roundMoney(nuevoContado + pagado), statementBalance: nuevoContado };
  }
  return n;
}

/**
 * Cuánto subiría el saldo de su deuda al borrar este movimiento (para avisar
 * antes de borrar). Anclada: saldo sin el movimiento − saldo con él (igual en
 * todos los dispositivos). No anclada: el camino legado (`montoQueRevierte`).
 * Un histórico o un movimiento cuya deuda ya no existe: 0.
 */
export function efectoDeBorrar(
  tx: Pick<Transaction, 'id' | 'debtId' | 'debtHistorico' | 'amount'>,
  debts: readonly Debt[],
  expenses: readonly Transaction[],
  descuentos: DescuentosDePago,
): number {
  if (!tx.debtId || tx.debtHistorico) return 0;
  const deuda = debts.find((d) => d.id === tx.debtId);
  if (!deuda) return 0;
  if (deuda.saldoBase === undefined) return montoQueRevierte(tx, descuentos);
  const con = saldoDerivado(deuda, sumaDePagos(expenses)).balance;
  const sin = saldoDerivado(deuda, sumaDePagos(expenses.filter((e) => e.id !== tx.id))).balance;
  return roundMoney(sin - con);
}
```

- [ ] **Step 5: Ejecutar el test y el type-check**

Run: `npx vitest run src/__tests__/debt-balance.test.ts`
Expected: PASS (10 tests).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/debt-balance.ts src/__tests__/debt-balance.test.ts
git commit -m "feat: saldo de deuda derivado de sus pagos (lógica pura)"
```

---

### Task 2: Migración de Supabase 0020

**Files:**
- Create: `supabase/migrations/0020_debts_saldo_base.sql`

**Interfaces:**
- Consumes: nada.
- Produces: columnas `debts.saldo_base numeric(14,2)`, `debts.contado_base numeric(14,2)`, `debts.saldo_base_at timestamptz`, `expenses.debt_historico boolean` (todas nullable, sin default). Las usa la Task 5 (`DebtRow`/`ExpenseRow`).

> **IMPORTANTE:** esta tarea solo ESCRIBE el archivo. No ejecutes `apply_migration`, `execute_sql` ni el SQL Editor contra ningún proyecto Supabase. Aplicarla en producción lo hace el controlador de la sesión, con OK explícito del usuario, **antes** de desplegar el cliente (spec §5.2, §11.5).

- [ ] **Step 1: Crear el archivo**

`supabase/migrations/0020_debts_saldo_base.sql`:

```sql
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
```

- [ ] **Step 2: Verificar la convención contra la migración anterior**

Run: `git diff --no-index --stat supabase/migrations/0019_debts_card_statement.sql supabase/migrations/0020_debts_saldo_base.sql`
Expected: muestra dos archivos distintos (solo para confirmar que existe y no se sobrescribió la 0019). Comprobar a ojo: cabecera con contexto, «ORDEN», consulta de verificación; `add column if not exists`; sin `not null`, sin `default`, sin `update`/`insert`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0020_debts_saldo_base.sql
git commit -m "feat: migración 0020 con saldo base de deudas y marca de pago histórico"
```

---

### Task 3: El camino legado ignora las deudas ancladas y respeta `debtHistorico`

**Files:**
- Modify: `src/lib/debt-payments.ts:85-200` (comentario de `DescuentoPago` y función `aplicarCambioDePagos`)
- Test: `src/__tests__/debt-payments.test.ts` (añadir dos tests dentro de `describe('lib/debt-payments')`)

**Interfaces:**
- Consumes: `Debt.saldoBase`, `Transaction.debtHistorico` (Task 1).
- Produces: `aplicarCambioDePagos(debts, descuentos, antes, despues, ahora)` con la misma firma; ahora (a) no modifica deudas ancladas ni les cambia `updated_at` ni les crea registro en `descuentos`, y (b) trata un movimiento con `debtHistorico: true` como vinculado aunque no haya registro local. La Task 6 la usa desde `ajustarDeudas`.

> No importar nada de `debt-balance.ts` aquí: `debt-balance.ts` ya importa de `debt-payments.ts` y un import en sentido contrario crearía un ciclo. La comprobación de anclaje se hace inline (`d.saldoBase === undefined`).

- [ ] **Step 1: Escribir los tests (rojos)**

En `src/__tests__/debt-payments.test.ts`, dentro de `describe('lib/debt-payments', ...)`, después del test `'un pago vinculado a mano no mueve el saldo ni al editarlo, borrarlo o deshacer el borrado'` (termina en la línea 88), añadir:

```ts
  it('aplicarCambioDePagos ignora las deudas ancladas: ni saldo, ni updated_at, ni registro', () => {
    const debts = [deuda({ id: 'd1', balance: 1000, saldoBase: 1000 }), deuda({ id: 'd2', balance: 500 })];
    const alta = aplicarCambioDePagos(debts, {}, [], [mov({ id: 'a', debtId: 'd1' }), mov({ id: 'b', debtId: 'd2' })], AHORA);
    expect(alta.debts[0]).toBe(debts[0]);
    expect(alta.debts[1].balance).toBe(400);
    expect(alta.descuentos.a).toBeUndefined();
    expect(alta.descuentos.b).toEqual({ balance: 100 });

    expect(aplicarCambioDePagos(debts, {}, [mov({ id: 'a', debtId: 'd1' })], [], AHORA).debts).toBe(debts);
    expect(aplicarCambioDePagos(debts, {}, [mov({ id: 'a', debtId: 'd1' })], [mov({ id: 'a', debtId: 'd1', amount: 900 })], AHORA).debts).toBe(debts);
  });

  it('aplicarCambioDePagos trata debtHistorico como vinculado aunque no haya registro local', () => {
    // Histórico vinculado en OTRO dispositivo: aquí no hay entrada en descuentos.
    const debts = [deuda({ balance: 1000 })];
    const h = mov({ debtId: 'd1', amount: 250, debtHistorico: true });
    expect(aplicarCambioDePagos(debts, {}, [h], [], AHORA).debts).toBe(debts); // borrar
    expect(aplicarCambioDePagos(debts, {}, [], [h], AHORA).debts).toBe(debts); // alta / deshacer
    expect(aplicarCambioDePagos(debts, {}, [h], [{ ...h, amount: 999 }], AHORA).debts).toBe(debts); // editar monto
    const dos = [deuda({ id: 'd1', balance: 1000 }), deuda({ id: 'd2', balance: 500 })];
    const otra = aplicarCambioDePagos(dos, {}, [h], [{ ...h, debtId: 'd2' }], AHORA); // cambiar de deuda
    expect(otra.debts.map((d) => d.balance)).toEqual([1000, 500]);
    expect(otra.descuentos).toEqual({});
  });
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/debt-payments.test.ts`
Expected: FAIL en los dos tests nuevos (p. ej. `expected { … balance: 900 … } to be { … balance: 1000 … }` y `expected [ 1250 ] …`/referencias distintas). El resto sigue verde.

- [ ] **Step 3: Implementar**

En `src/lib/debt-payments.ts`, reemplazar el comentario de `DescuentoPago` (líneas 85-94) por:

```ts
/**
 * Lo que un pago descontó de verdad de su deuda. Descontar no es simétrico:
 * el saldo (y el pago de contado) nunca bajan de 0, así que un pago mayor que
 * lo que había descontó menos que su monto, y devolver el monto entero al
 * borrarlo dejaría la deuda más alta que antes. Por eso se guarda lo efectivo.
 *
 * Es estado LOCAL (`financeStore.descuentosDePago`, persistido pero no
 * sincronizado: no hay columna en BD). Sin entrada —dispositivo que no
 * registró el pago, dato anterior— se revierte el monto completo.
 *
 * Solo sirve para las deudas NO ancladas (camino legado): en una anclada el
 * tope a 0 se aplica al agregado (lib/debt-balance) y no hace falta. La
 * marca «vinculado» tiene ahora su versión sincronizada, `Transaction.debtHistorico`.
 */
```

Reemplazar la función `aplicarCambioDePagos` completa (líneas 125-200, comentario incluido) por:

```ts
/**
 * Aplica a las deudas el paso de `antes` a `despues` (los movimientos
 * afectados, no todos): primero revierte lo que descontaron los de `antes` y
 * luego descuenta los de `despues`, guardando lo efectivo de cada uno.
 *
 * Alta: antes = [], despues = [nuevo]. Borrado: al revés. Edición: [viejo] →
 * [nuevo], que cubre a la vez un cambio de monto y un cambio de deuda; si no
 * cambia ni la deuda ni el monto no toca nada.
 *
 * En una tarjeta con pago de contado conocido el pago también se descuenta de
 * él (y borrarlo lo devuelve). El saldo nunca baja de 0. Un movimiento
 * vinculado a mano (`debtHistorico` o, en datos locales antiguos, la marca
 * `vinculado`) no mueve el saldo: al editarlo conserva el enlace, al quitarle
 * `debtId` pierde la marca.
 *
 * Las deudas ANCLADAS (`saldoBase`) no pasan por aquí: su saldo se deriva de
 * los movimientos (lib/debt-balance, recalcularSaldos). Este camino no las
 * modifica, no les cambia `updated_at` y no les registra descuentos.
 */
export function aplicarCambioDePagos(
  debts: Debt[],
  descuentos: DescuentosDePago,
  antes: Transaction[],
  despues: Transaction[],
  ahora: string,
): { debts: Debt[]; descuentos: DescuentosDePago } {
  const sig: DescuentosDePago = { ...descuentos };
  const porId = new Map(debts.map((d) => [d.id, d]));
  const tocadas = new Set<string>();
  const esVinculado = (t: Transaction): boolean => !!t.debtHistorico || !!descuentos[t.id]?.vinculado;
  /** La deuda si sigue el camino legado; undefined si no existe o está anclada. */
  const legada = (id: string): Debt | undefined => {
    const d = porId.get(id);
    return d && d.saldoBase === undefined ? d : undefined;
  };
  const cambiar = (id: string, balance: number, statement: number) => {
    const d = legada(id);
    if (!d) return;
    const n: Debt = { ...d, balance: roundMoney(d.balance + balance) };
    if (d.statementBalance !== undefined) n.statementBalance = roundMoney(d.statementBalance + statement);
    porId.set(id, n);
    tocadas.add(id);
  };

  const nuevos = new Map(despues.map((m) => [m.id, m]));
  const intactos = new Set<string>();
  for (const v of antes) {
    const n = nuevos.get(v.id);
    if (!v.debtId || !n) continue;
    const rec = descuentos[v.id];
    if (esVinculado(v) && n.debtId) {
      if (rec) sig[v.id] = rec; // sigue siendo un pago vinculado, aunque cambie la deuda
      intactos.add(v.id);
    } else if (n.debtId === v.debtId && n.amount === v.amount) {
      intactos.add(v.id);
    }
  }

  for (const v of antes) {
    if (!v.debtId || intactos.has(v.id)) continue;
    const rec = descuentos[v.id];
    if (esVinculado(v)) {
      // Borrado: la marca se conserva para que deshacer no lo descuente. Edición
      // que le quita la deuda: la marca ya no tiene sentido.
      if (nuevos.has(v.id)) delete sig[v.id];
      continue;
    }
    delete sig[v.id];
    cambiar(v.debtId, rec ? rec.balance : v.amount, rec ? (rec.statement ?? 0) : v.amount);
  }
  for (const n of despues) {
    if (!n.debtId || intactos.has(n.id)) continue;
    // Deshacer el borrado de un pago vinculado a mano: sigue sin mover el saldo.
    if (esVinculado(n)) continue;
    const d = legada(n.debtId);
    if (!d) continue;
    const ef = descuentoEfectivo(d, n.amount);
    sig[n.id] = ef;
    cambiar(n.debtId, -ef.balance, -(ef.statement ?? 0));
  }

  if (tocadas.size === 0) return { debts, descuentos: sig };
  return {
    debts: debts.map((d) => (tocadas.has(d.id) ? { ...porId.get(d.id)!, updated_at: ahora } : d)),
    descuentos: sig,
  };
}
```

- [ ] **Step 4: Ejecutar los tests y el type-check**

Run: `npx vitest run src/__tests__/debt-payments.test.ts src/__tests__/debt-payments-store.test.ts src/__tests__/debt-balance.test.ts`
Expected: PASS (todos, incluidos los tests legados existentes).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debt-payments.ts src/__tests__/debt-payments.test.ts
git commit -m "fix: el camino legado de pagos ignora deudas ancladas y respeta debtHistorico"
```

---

### Task 4: Tests de reproducción del bug (Paso 0 del spec)

**Files:**
- Test: `src/__tests__/sync-conflictos.test.ts` (añadir helpers a nivel de archivo y un `describe` nuevo al final)

**Interfaces:**
- Consumes: `Debt.saldoBase` (Task 1); los helpers existentes del archivo `armar`, `filaGasto`, `gastoLocal`, `filasDe`, `syncService`, `useFinanceStore` y el mock `vi.hoisted()` + getter de `@/config/supabase` (ya está arriba del archivo; no crear otro).
- Produces (usados por las Tasks 5 y 6 en el mismo archivo): constantes/helpers a nivel de archivo `T0`, `filaDeuda(extra?: Fila): Fila`, `deudaBase(extra?: Partial<Debt>): Debt`, `meterDeuda(d: Debt): Debt`, `saldoD1(): number`; y el `describe('saldo de deudas convergente (Paso 0 del spec sync-saldo-deudas)')` con cinco tests declarados con `it.fails`.

> Estos tests documentan el bug: **deben fallar hoy**. Se declaran con `it.fails(...)`, que Vitest marca en verde mientras la aserción falle, para no dejar la suite en rojo entre tareas. La Task 5 cambia `it.fails` → `it` en los casos 1, 2, 3a y 3b; la Task 6 en el caso 4. Si alguno pasa hoy (y por tanto `it.fails` sale rojo), el test está mal escrito: revisarlo antes de seguir.

- [ ] **Step 1: Ampliar el import de tipos**

En `src/__tests__/sync-conflictos.test.ts`, línea 34, reemplazar:

```ts
import type { Transaction } from '@/types';
```

por:

```ts
import type { Debt, Transaction } from '@/types';
```

- [ ] **Step 2: Añadir los helpers a nivel de archivo**

Justo después de la definición de `filasDe` (línea 122) y antes de `beforeEach`, añadir:

```ts
// ── Deudas con saldo derivado (spec sync-saldo-deudas) ──
const T0 = '2026-08-01T00:00:00.000Z';

/** Fila remota de la deuda d1, anclada en T0 con base 1000 (la escribió un cliente nuevo). */
const filaDeuda = (extra: Fila = {}): Fila => ({
  id: 'd1', user_id: 'user-1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito',
  balance: 1000, annual_rate: 30, min_payment: 50, pay_day: null,
  cut_day: null, statement_balance: null, credit_limit: null,
  saldo_base: 1000, contado_base: null, saldo_base_at: T0,
  updated_at: T0, deleted_at: null,
  ...extra,
});

/** Deuda d1 local con las mismas claves que produce rowToDebt (sin saldoBase: no anclada). */
const deudaBase = (extra: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000,
  annualRate: 30, minPayment: 50, payDay: null, updated_at: T0, ...extra,
});

function meterDeuda(d: Debt): Debt {
  useFinanceStore.setState((s) => ({ debts: [...s.debts, d] }));
  return d;
}

const saldoD1 = (): number => useFinanceStore.getState().debts.find((d) => d.id === 'd1')!.balance;
```

- [ ] **Step 3: Añadir los tests de reproducción**

Al final del archivo:

```ts
// ── Paso 0: reproducción del bug de saldo (spec sync-saldo-deudas §1, §7) ──
// `it.fails` mientras el bug exista; las Tasks 5 y 6 del plan los pasan a `it`.
describe('saldo de deudas convergente (Paso 0 del spec sync-saldo-deudas)', () => {
  it.fails('1. pagos concurrentes en dos dispositivos se suman: 1000 − 100 − 200 = 700', async () => {
    // Este dispositivo (B): deuda anclada y su propio pago de 200, aún sin subir.
    meterDeuda(deudaBase({ saldoBase: 1000, balance: 800 }));
    gastoLocal('pB', '2026-08-20T00:00:00.000Z', { amount: 200, debtId: 'd1', category: 'pago-tarjetas' });
    // Servidor: la deuda como la ancló A (un pago no reescribe la fila) y el pago de 100 de A.
    armar({
      filas: {
        debts: [filaDeuda()],
        expenses: [filaGasto({ id: 'pA', amount: 100, debt_id: 'd1', category: 'pago-tarjetas', updated_at: '2026-08-15T00:00:00.000Z' })],
      },
    });

    await syncService.attach('user-1');

    expect(saldoD1()).toBe(700);
  });

  it.fails('2. editar la tasa en B sin haber visto el pago de A no pierde el pago: 900', async () => {
    // Este dispositivo (A): pagó 100; la fila de la deuda no se reescribió.
    meterDeuda(deudaBase({ saldoBase: 1000, balance: 900 }));
    gastoLocal('pA', '2026-08-15T00:00:00.000Z', { amount: 100, debtId: 'd1', category: 'pago-tarjetas' });
    // B editó la tasa después (su fila gana) con su copia vieja del saldo.
    const T2 = '2026-08-20T00:00:00.000Z';
    armar({ filas: { debts: [filaDeuda({ annual_rate: 25, balance: 1000, updated_at: T2, saldo_base_at: T2 })] } });

    await syncService.attach('user-1');

    const d = useFinanceStore.getState().debts.find((x) => x.id === 'd1')!;
    expect(d.annualRate).toBe(25);
    expect(d.balance).toBe(900);
  });

  it.fails('3a. un histórico vinculado en A y borrado en B no mueve el saldo (deuda anclada)', async () => {
    armar({
      filas: {
        debts: [filaDeuda()],
        expenses: [filaGasto({ id: 'h', amount: 250, debt_id: 'd1', debt_historico: true, category: 'pago-tarjetas' })],
      },
    });
    await syncService.attach('user-1');
    expect(saldoD1()).toBe(1000);

    useFinanceStore.getState().deleteTransaction('h');

    expect(saldoD1()).toBe(1000); // hoy: 1250 (le devuelve dinero que nunca se descontó)
  });

  it.fails('3b. lo mismo con una deuda NO anclada: lo arregla debt_historico', async () => {
    armar({
      filas: {
        debts: [filaDeuda({ saldo_base: null, saldo_base_at: null })],
        expenses: [filaGasto({ id: 'h', amount: 250, debt_id: 'd1', debt_historico: true, category: 'pago-tarjetas' })],
      },
    });
    await syncService.attach('user-1');

    useFinanceStore.getState().deleteTransaction('h');

    expect(saldoD1()).toBe(1000);
  });

  it.fails('4. un pago de 150 sobre una deuda de 100, creado en A y borrado en B, devuelve 100', async () => {
    armar({
      filas: {
        debts: [filaDeuda({ balance: 0, saldo_base: 100 })],
        expenses: [filaGasto({ id: 'p', amount: 150, debt_id: 'd1', category: 'pago-tarjetas' })],
      },
    });
    await syncService.attach('user-1');
    expect(saldoD1()).toBe(0);

    useFinanceStore.getState().deleteTransaction('p');

    expect(saldoD1()).toBe(100); // hoy: 150 (inventa 50)
  });
});
```

- [ ] **Step 4: Ejecutar y verificar que los cinco fallan (es decir, que `it.fails` da verde)**

Run: `npx vitest run src/__tests__/sync-conflictos.test.ts`
Expected: PASS del archivo completo. Los cinco `it.fails` en verde significan que las aserciones fallan hoy (el bug está reproducido). Para verlo explícitamente, cambiar temporalmente un `it.fails` a `it` y comprobar que falla con, p. ej., `expected 800 to be 700` (caso 1), `expected 1000 to be 900` (caso 2), `expected 1250 to be 1000` (casos 3a/3b), `expected 150 to be 100` (caso 4); después volver a `it.fails`.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/sync-conflictos.test.ts
git commit -m "test: reproduce la divergencia del saldo de deudas entre dispositivos"
```

---

### Task 5: Sync — columnas nuevas, detección de clientes viejos y saldo recalculado en el merge

**Files:**
- Modify: `src/lib/sync.ts:48-66` (`ExpenseRow`), `src/lib/sync.ts:78-94` (`DebtRow`), `src/lib/sync.ts:206-250` (`expenseToRow`, `rowToExpense`), `src/lib/sync.ts:268-304` (`debtToRow`, `rowToDebt`), `src/lib/sync.ts:846-854` (`applyMerge`, tras el merge de deudas), imports (líneas 11-14)
- Test: `src/__tests__/sync-conflictos.test.ts`

**Interfaces:**
- Consumes: `recalcularSaldos(debts: Debt[], expenses): Debt[]` de `@/lib/debt-balance` (Task 1); columnas de la Task 2; helpers `T0`, `filaDeuda`, `deudaBase`, `meterDeuda`, `saldoD1` (Task 4).
- Produces: filas `debts` con `saldo_base`, `contado_base`, `saldo_base_at`; filas `expenses` con `debt_historico`; `rowToDebt` devuelve `saldoBase`/`contadoBase` solo si la deuda está anclada (`saldo_base != null` y `Date.parse(saldo_base_at) === Date.parse(updated_at)`); `rowToExpense` devuelve `debtHistorico: true` solo si la columna es `true`; `applyMerge` deja `debts.live` recalculado antes de comparar con el estado local y antes del push.

> No tocar `mergeById`, `hidratarAusentes`, `CLAVES_DEUDA_HIDRATABLES`, `CLAVES_GASTO_HIDRATABLES`, la marca de agua ni el filtro `changed()` del push.

- [ ] **Step 1: Escribir los tests de sync (rojos)**

En `src/__tests__/sync-conflictos.test.ts`, al final del archivo (después del `describe` del Paso 0), añadir:

```ts
describe('debts.saldo_base y expenses.debt_historico (0020)', () => {
  it('sube saldo_base, contado_base y saldo_base_at = updated_at, con balance como caché', async () => {
    const { upserts } = armar();
    meterDeuda(deudaBase({ saldoBase: 1000, contadoBase: 300, statementBalance: 300, updated_at: '2026-08-10T00:00:00.000Z' }));

    await syncService.attach('user-1');

    expect(filasDe(upserts, 'debts')[0]).toMatchObject({
      id: 'd1', balance: 1000, statement_balance: 300,
      saldo_base: 1000, contado_base: 300, saldo_base_at: '2026-08-10T00:00:00.000Z',
    });
  });

  it('una deuda no anclada sube saldo_base y saldo_base_at en null', async () => {
    const { upserts } = armar();
    meterDeuda(deudaBase({ balance: 640 }));

    await syncService.attach('user-1');

    expect(filasDe(upserts, 'debts')[0]).toMatchObject({ balance: 640, saldo_base: null, contado_base: null, saldo_base_at: null });
  });

  it('saldo_base_at ≠ updated_at (la reescribió un cliente viejo) → no anclada, con el balance de la fila', async () => {
    armar({
      filas: {
        debts: [filaDeuda({ balance: 640, updated_at: '2026-08-20T00:00:00.000Z', saldo_base_at: T0 })],
        expenses: [filaGasto({ id: 'p', amount: 100, debt_id: 'd1', category: 'pago-tarjetas' })],
      },
    });

    await syncService.attach('user-1');

    const d = useFinanceStore.getState().debts[0];
    expect('saldoBase' in d).toBe(false);
    expect('contadoBase' in d).toBe(false);
    expect(d.balance).toBe(640);
  });

  it('Z y +00:00 son el mismo instante: la deuda llega anclada y su saldo se deriva', async () => {
    armar({
      filas: {
        debts: [filaDeuda({ updated_at: '2026-08-01T00:00:00+00:00', saldo_base_at: T0, saldo_base: '1000.00', balance: '1000.00' })],
        expenses: [filaGasto({ id: 'p', amount: 100, debt_id: 'd1', category: 'pago-tarjetas' })],
      },
    });

    await syncService.attach('user-1');

    expect(useFinanceStore.getState().debts[0]).toMatchObject({ saldoBase: 1000, balance: 900 });
  });

  it('un ciclo sin novedades con la caché remota distinta no produce setState ni push de deudas', async () => {
    meterDeuda(deudaBase({ saldoBase: 1000, balance: 900 }));
    const pago: Transaction = {
      id: 'p', type: 'expense', amount: 100, concept: 'Pago', date: '2026-07-20', category: 'pago-tarjetas',
      method: 'cash', businessType: 'personal', accountId: null, toAccountId: null, recurrenceId: null,
      debtId: 'd1', updated_at: T0,
    };
    useFinanceStore.setState({ expenses: [pago] });
    const { upserts } = armar({
      filas: {
        debts: [filaDeuda({ balance: 1000 })], // caché vieja en el servidor
        expenses: [filaGasto({ id: 'p', amount: 100, concept: 'Pago', date: '2026-07-20', category: 'pago-tarjetas', debt_id: 'd1', updated_at: T0 })],
      },
    });
    await syncService.attach('user-1');
    const debtsTrasAttach = useFinanceStore.getState().debts;
    expect(debtsTrasAttach[0].balance).toBe(900);

    upserts.length = 0;
    await vi.advanceTimersByTimeAsync(10);
    await syncService.flush();

    expect(useFinanceStore.getState().debts).toBe(debtsTrasAttach);
    expect(filasDe(upserts, 'debts')).toHaveLength(0);
  });

  it('debt_historico va y vuelve; sin la marca la clave no existe en local', async () => {
    const { upserts } = armar({
      filas: {
        expenses: [
          filaGasto({ id: 'remoto', debt_id: 'd9', debt_historico: true }),
          filaGasto({ id: 'sinMarca', debt_id: 'd9', debt_historico: false }),
        ],
      },
    });
    gastoLocal('local', '2026-09-01T12:00:00.000Z', { debtId: 'd1', debtHistorico: true, category: 'pago-tarjetas' });
    gastoLocal('normal', '2026-09-01T12:00:00.000Z', { debtId: 'd1', category: 'pago-tarjetas' });

    await syncService.attach('user-1');

    const subidas = filasDe(upserts, 'expenses');
    expect(subidas.find((r) => r.id === 'local')).toMatchObject({ debt_id: 'd1', debt_historico: true });
    expect(subidas.find((r) => r.id === 'normal')).toMatchObject({ debt_historico: null });
    const locales = useFinanceStore.getState().expenses;
    expect(locales.find((e) => e.id === 'remoto')?.debtHistorico).toBe(true);
    expect('debtHistorico' in (locales.find((e) => e.id === 'sinMarca') as object)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/sync-conflictos.test.ts -t "0020"`
Expected: FAIL en los seis (p. ej. `saldo_base` ausente en la fila subida, `saldoBase` ausente al bajar, `debt_historico` ausente).

- [ ] **Step 3: Implementar los tipos de fila**

En `src/lib/sync.ts`, en `interface ExpenseRow`, después de `debt_id?: string | null;` (línea 62):

```ts
  /** 0020. Pago histórico vinculado a mano (no descuenta). Opcional en la forma. */
  debt_historico?: boolean | null;
```

En `interface DebtRow`, después de `credit_limit?: number | null;` (línea 91):

```ts
  /** 0020. Saldo derivado: presentes solo en filas que escribió un cliente nuevo. */
  saldo_base?: number | null;
  contado_base?: number | null;
  saldo_base_at?: string | null;
```

- [ ] **Step 4: Implementar los conversores de movimientos**

En `expenseToRow`, después de `debt_id: t.debtId ?? null,` (línea 220):

```ts
    debt_historico: t.debtHistorico ?? null,
```

En `rowToExpense`, después de la línea `...(r.debt_id ? { debtId: r.debt_id } : {}),` (línea 242):

```ts
    // Solo con valor (como debtId): un movimiento normal no lleva la clave.
    ...(r.debt_historico === true ? { debtHistorico: true as const } : {}),
```

- [ ] **Step 5: Implementar los conversores de deudas**

En `debtToRow`, después de `credit_limit: d.creditLimit ?? null,` (línea 281):

```ts
    saldo_base: d.saldoBase ?? null,
    contado_base: d.contadoBase ?? null,
    // La base es de ESTA escritura: si un cliente viejo reescribe la fila,
    // cambia updated_at sin tocar esta columna y la deuda se lee no anclada.
    saldo_base_at: d.saldoBase !== undefined ? d.updated_at : null,
```

Reemplazar `rowToDebt` completo (líneas 287-304) por:

```ts
function rowToDebt(r: DebtRow): Debt {
  // Anclada solo si la base la escribió la MISMA escritura que fijó
  // updated_at (spec sync-saldo-deudas §5.3). Un cliente viejo cambia
  // updated_at sin conocer saldo_base_at: la deuda queda no anclada, con el
  // `balance` que él escribió (su pago incluido). Se compara como instante:
  // Postgres devuelve `+00:00` y el cliente escribe `Z`.
  const anclada =
    r.saldo_base != null &&
    r.saldo_base_at != null &&
    Date.parse(r.saldo_base_at) === Date.parse(r.updated_at);
  return {
    id: r.id,
    name: r.name ?? '',
    tag: r.tag === 'business' ? 'business' : 'personal',
    kind: (DEBT_KINDS_VALIDOS.includes(r.kind as DebtKind) ? r.kind : 'Otro') as DebtKind,
    balance: Number(r.balance ?? 0),
    annualRate: Number(r.annual_rate ?? 0),
    minPayment: Number(r.min_payment ?? 0),
    payDay: r.pay_day ?? null,
    // Solo con valor, para que una deuda sin datos de tarjeta sea
    // estructuralmente igual a su copia local (igualEstructural).
    ...(r.cut_day != null ? { cutDay: Number(r.cut_day) } : {}),
    ...(r.statement_balance != null ? { statementBalance: Number(r.statement_balance) } : {}),
    ...(r.credit_limit != null ? { creditLimit: Number(r.credit_limit) } : {}),
    ...(anclada ? { saldoBase: Number(r.saldo_base) } : {}),
    ...(anclada && r.contado_base != null ? { contadoBase: Number(r.contado_base) } : {}),
    updated_at: r.updated_at,
  };
}
```

- [ ] **Step 6: Recalcular la caché en `applyMerge`**

Añadir el import junto a los demás de `@/lib` (después de la línea 14, `import { getTodayISO } from '@/lib/utils';`):

```ts
import { recalcularSaldos } from '@/lib/debt-balance';
```

En `applyMerge`, justo después del bloque (líneas 851-854):

```ts
  const debts = mergeById(
    { live: localDebts, tombstones: scopeTombstones(state.tombstones, debtsUniverse) },
    remoteDebts,
  );
```

añadir:

```ts
  // Saldo derivado (spec sync-saldo-deudas §5.3): la caché `balance` de una
  // deuda anclada se recalcula con los pagos YA mergeados antes de comparar
  // con el estado local. Así una caché remota distinta no dispara un setState
  // ni un push en cada ciclo, y lo que se sube lleva la caché correcta.
  // recalcularSaldos devuelve las mismas referencias si nada cambió.
  debts.live = recalcularSaldos(debts.live, expenses.live);
```

- [ ] **Step 7: Pasar a `it` los casos del Paso 0 que arregla el sync**

En el `describe('saldo de deudas convergente (Paso 0 …)')` de la Task 4, cambiar `it.fails(` por `it(` en los tests cuyo título empieza por `'1. `, `'2. `, `'3a. ` y `'3b. `. El caso `'4. '` se queda en `it.fails` (necesita que el store recalcule al borrar: Task 6).

- [ ] **Step 8: Ejecutar tests y type-check**

Run: `npx vitest run src/__tests__/sync-conflictos.test.ts src/__tests__/sync.test.ts src/__tests__/sync-hidratacion.test.ts src/__tests__/merge.test.ts`
Expected: PASS. Los casos 1, 2, 3a, 3b del Paso 0 pasan como `it`; el 4 sigue verde como `it.fails`; los seis de «0020» pasan.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sync.ts src/__tests__/sync-conflictos.test.ts
git commit -m "fix: el sync deriva el saldo de las deudas ancladas y detecta escrituras de clientes viejos"
```

---

### Task 6: Store v17 — acciones sobre el saldo derivado, `confirmarSaldoDeuda` y `migrateV17`

**Files:**
- Modify: `src/lib/credit-card.ts:13-30` (`normalizarDeuda`)
- Modify: `src/stores/financeStore.ts` — imports (líneas 15-16), interfaz `FinanceState` (líneas 115-129), migraciones (después de la línea 187), `cambioDePagos` (líneas 211-220), acciones de transacciones (líneas 468-530), deudas (líneas 786-854), `importBackup` (líneas 889-911), `MIGRACIONES` (líneas 385-394), `version` (línea 920)
- Test: `src/__tests__/debt-payments-store.test.ts`, `src/__tests__/finance-migrate-versiones.test.ts`, `src/__tests__/debt-payments.test.ts`, `src/__tests__/credit-card.test.ts`, `src/__tests__/transaction-modal.test.tsx`, `src/__tests__/sync-conflictos.test.ts`

**Interfaces:**
- Consumes: `recalcularSaldos`, `anclarDeuda`, `rebasarDeuda`, `sumaDePagos` de `@/lib/debt-balance` (Task 1); `aplicarCambioDePagos` ajustada (Task 3).
- Produces (usadas por la Task 7):
  - `FinanceState.confirmarSaldoDeuda: (id: string) => void` — ancla preservando el saldo; no-op si ya estaba anclada o no existe.
  - `export function migrateV17(state: Record<string, unknown>): Record<string, unknown>`
  - `useFinanceStore.persist.getOptions().version === 17`
  - Helper interno `ajustarDeudas(state, antes, despues, expensesNuevo)` que reemplaza a `cambioDePagos`.
  - `addDebt` crea deudas ancladas (`saldoBase = balance`, `contadoBase = statementBalance` si existe).
  - `vincularPagoHistorico` pone `debtId` + `debtHistorico: true` y ya no escribe `descuentosDePago`.

- [ ] **Step 1: Escribir los tests nuevos del store (rojos)**

En `src/__tests__/debt-payments-store.test.ts`, reemplazar las líneas 6-9 (imports) por:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore, migrateV16, migrateV17 } from '@/stores/financeStore';
import { accountBalance, TRANSFER_CATEGORY } from '@/lib/accounts';
import { sumaDePagos } from '@/lib/debt-balance';
import { roundMoney } from '@/lib/utils';
import type { BackupData } from '@/lib/backup';
import type { Debt, Transaction } from '@/types';
```

Y añadir al final del archivo:

```ts
// ================================================================
// v17 — saldo derivado (spec .agents/specs/sync-saldo-deudas.md §6.2)
// ================================================================

const deudaVieja = '2026-01-01T00:00:00.000Z';
/** Deja el updated_at de todas las deudas en una fecha fija del pasado. */
const envejecerDeudas = () =>
  useFinanceStore.setState((s) => ({ debts: s.debts.map((d) => ({ ...d, updated_at: deudaVieja })) }));

describe('store v17: deudas ancladas', () => {
  beforeEach(() => estado().reset());

  it('addDebt nace anclada: saldoBase = balance y contadoBase = statementBalance', () => {
    estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().addDebt({ name: 'Auto', tag: 'personal', kind: 'Préstamo', balance: 5000, annualRate: 10, minPayment: 200, payDay: null });
    expect(estado().debts[0]).toMatchObject({ saldoBase: 1000, contadoBase: 300, balance: 1000, statementBalance: 300 });
    expect(estado().debts[1]).toMatchObject({ saldoBase: 5000, balance: 5000 });
    expect('contadoBase' in estado().debts[1]).toBe(false);
  });

  it('las acciones de movimientos no reescriben la fila de una deuda anclada', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    envejecerDeudas();
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    expect(estado().debts[0].balance).toBe(800);
    const pago = estado().expenses[0];
    estado().updateTransaction(pago.id, { amount: 300 });
    expect(estado().debts[0].balance).toBe(700);
    estado().deleteTransactions([pago.id]);
    expect(estado().debts[0].balance).toBe(1000);
    estado().restoreTransactions([pago]); // la copia guardada es la de 200
    expect(estado().debts[0].balance).toBe(800);
    estado().deleteTransaction(pago.id);
    const d = estado().debts[0];
    expect(d).toMatchObject({ balance: 1000, saldoBase: 1000, updated_at: deudaVieja });
    expect(estado().descuentosDePago).toEqual({});
  });

  it('updateDebt de la tasa (reenviando el mismo saldo, como el formulario) no rebasa', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    estado().updateDebt(id, { annualRate: 25, balance: 800, statementBalance: 100 });
    expect(estado().debts[0]).toMatchObject({ annualRate: 25, saldoBase: 1000, contadoBase: 300, balance: 800, statementBalance: 100 });
  });

  it('«Actualizar estado de cuenta» rebasa: el saldo queda en X y los pagos posteriores siguen restando', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    estado().updateDebt(id, { balance: 1200, statementBalance: 0, minPayment: 60 });
    expect(estado().debts[0]).toMatchObject({ balance: 1200, statementBalance: 0, saldoBase: 1400, contadoBase: 200, minPayment: 60 });
    estado().registerDebtPayment(id, { amount: 100, date: '2026-09-25', accountId: null });
    expect(estado().debts[0].balance).toBe(1100);
  });

  it('borrar el pago de contado quita contadoBase; cambiar a préstamo también', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().updateDebt(id, { statementBalance: undefined });
    expect('statementBalance' in estado().debts[0] || 'contadoBase' in estado().debts[0]).toBe(false);
    estado().updateDebt(id, { statementBalance: 120 });
    expect(estado().debts[0]).toMatchObject({ statementBalance: 120, contadoBase: 120 });
    estado().updateDebt(id, { kind: 'Préstamo' });
    expect('statementBalance' in estado().debts[0] || 'contadoBase' in estado().debts[0]).toBe(false);
    expect(estado().debts[0].saldoBase).toBe(1000);
  });

  it('vincular y desvincular un histórico no mueven el saldo de una anclada; desvincular un pago real conserva el saldo', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const viejo = estado().addTransaction({ type: 'expense', amount: 250, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    estado().vincularPagoHistorico(viejo, id);
    expect(estado().expenses.find((e) => e.id === viejo)).toMatchObject({ debtId: id, debtHistorico: true });
    expect(estado().descuentosDePago).toEqual({});
    expect(estado().debts[0].balance).toBe(1000);
    estado().desvincularPago(viejo);
    expect(estado().debts[0]).toMatchObject({ balance: 1000, saldoBase: 1000 });

    const real = estado().addTransaction({ type: 'expense', amount: 200, concept: 'Pago', date: '2026-09-10', category: 'pago-tarjetas', method: 'cash', businessType: 'personal', debtId: id });
    expect(estado().debts[0].balance).toBe(800);
    estado().desvincularPago(real);
    const tx = estado().expenses.find((e) => e.id === real)!;
    expect('debtId' in tx || 'debtHistorico' in tx).toBe(false);
    expect(estado().debts[0]).toMatchObject({ balance: 800, saldoBase: 800 });
  });

  it('quitarle la deuda a un histórico al editarlo también le quita la marca', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const viejo = estado().addTransaction({ type: 'expense', amount: 250, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    estado().vincularPagoHistorico(viejo, id);
    estado().updateTransaction(viejo, { debtId: null });
    expect('debtHistorico' in estado().expenses[0]).toBe(false);
    expect(estado().debts[0].balance).toBe(1000);
  });
});

describe('store v17: confirmarSaldoDeuda', () => {
  beforeEach(() => estado().reset());

  it('ancla una deuda legada preservando el saldo y usando el descuento efectivo', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 100, statementBalance: 100 })] });
    estado().registerDebtPayment('d1', { amount: 150, date: '2026-09-20', accountId: null });
    expect(estado().debts[0]).toMatchObject({ balance: 0, statementBalance: 0 });
    expect('saldoBase' in estado().debts[0]).toBe(false);

    estado().confirmarSaldoDeuda('d1');
    const d = estado().debts[0];
    expect(d).toMatchObject({ saldoBase: 100, contadoBase: 100, balance: 0, statementBalance: 0 });
    expect(d.updated_at).not.toBe('2026-09-01T00:00:00.000Z');

    estado().deleteTransaction(estado().expenses[0].id);
    expect(estado().debts[0]).toMatchObject({ balance: 100, statementBalance: 100 }); // no 150
  });

  it('es no-op en una deuda ya anclada o inexistente', () => {
    estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const antes = estado().debts;
    estado().confirmarSaldoDeuda(antes[0].id);
    estado().confirmarSaldoDeuda('no-existe');
    expect(estado().debts).toBe(antes);
  });
});

describe('store v17: las deudas no ancladas se comportan como antes', () => {
  beforeEach(() => estado().reset());

  it('camino legado: registro de descuento, updated_at renovado y reversión exacta', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 100, statementBalance: 100 })] });
    estado().registerDebtPayment('d1', { amount: 300, date: '2026-09-20', accountId: null });
    const pagoId = estado().expenses[0].id;
    expect(estado().debts[0]).toMatchObject({ balance: 0, statementBalance: 0 });
    expect(estado().debts[0].updated_at).not.toBe('2026-09-01T00:00:00.000Z');
    expect(estado().descuentosDePago[pagoId]).toEqual({ balance: 100, statement: 100 });
    estado().deleteTransaction(pagoId);
    expect(estado().debts[0]).toMatchObject({ balance: 100, statementBalance: 100 });
  });

  it('cambiar el saldo de una legada en el formulario la ancla con el valor nuevo', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 700 })] });
    estado().updateDebt('d1', { annualRate: 20, balance: 700 }); // mismo saldo: no ancla
    expect('saldoBase' in estado().debts[0]).toBe(false);
    estado().updateDebt('d1', { balance: 650 });
    expect(estado().debts[0]).toMatchObject({ saldoBase: 650, balance: 650 });
  });
});

describe('store v17: invariante — en deudas ancladas balance = max(0, saldoBase − Σ)', () => {
  beforeEach(() => estado().reset());

  it('se cumple tras una secuencia aleatoria (determinista) de acciones', () => {
    let semilla = 42;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla / 2147483648;
    };
    const elegir = <T,>(xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(azar() * xs.length)] : undefined);
    const d1 = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 800, annualRate: 30, minPayment: 50, payDay: null, statementBalance: 200 });
    const d2 = estado().addDebt({ name: 'Auto', tag: 'personal', kind: 'Préstamo', balance: 5000, annualRate: 10, minPayment: 200, payDay: null });
    const borrados: Transaction[] = [];
    const comprobar = (paso: number) => {
      const suma = sumaDePagos(estado().expenses);
      for (const d of estado().debts) {
        expect(d.saldoBase, `paso ${paso}`).toBeDefined();
        const pagado = suma.get(d.id) ?? 0;
        expect(d.balance, `paso ${paso}`).toBe(roundMoney(Math.max(0, (d.saldoBase ?? 0) - pagado)));
        if (d.contadoBase !== undefined) {
          expect(d.statementBalance, `paso ${paso}`).toBe(roundMoney(Math.max(0, d.contadoBase - pagado)));
        }
      }
    };
    for (let i = 0; i < 300; i++) {
      const monto = roundMoney(1 + azar() * 400);
      const deudaElegida = elegir([d1, d2, undefined]);
      const tx = elegir(estado().expenses);
      switch (Math.floor(azar() * 9)) {
        case 0:
          estado().addTransaction({ type: 'expense', amount: monto, concept: 'P', date: '2026-09-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal', ...(deudaElegida ? { debtId: deudaElegida } : {}) });
          break;
        case 1:
          estado().registerDebtPayment(deudaElegida ?? d1, { amount: monto, date: '2026-09-20', accountId: null });
          break;
        case 2:
          if (tx) estado().updateTransaction(tx.id, { amount: monto });
          break;
        case 3:
          if (tx) estado().updateTransaction(tx.id, { debtId: deudaElegida ?? null });
          break;
        case 4:
          if (tx) { borrados.push(tx); estado().deleteTransaction(tx.id); }
          break;
        case 5:
          if (borrados.length) estado().restoreTransactions(borrados.splice(0, borrados.length));
          break;
        case 6:
          if (tx && !tx.debtId && deudaElegida) estado().vincularPagoHistorico(tx.id, deudaElegida);
          break;
        case 7:
          if (tx) estado().desvincularPago(tx.id);
          break;
        default:
          estado().updateDebt(deudaElegida ?? d2, i % 2 ? { annualRate: roundMoney(azar() * 40) } : { balance: monto });
      }
      comprobar(i);
    }
  });
});

describe('migración v17 del estado persistido', () => {
  const estadoV16 = () => ({
    debts: [deuda({ balance: 1000 })],
    expenses: [mov({ id: 'h', debtId: 'd1', amount: 250 }), mov({ id: 'real', debtId: 'd1', amount: 100 }), mov({ id: 'suelto' })],
    descuentosDePago: {
      h: { balance: 0, vinculado: true },
      real: { balance: 100 },
      suelto: { balance: 0, vinculado: true },
      fantasma: { balance: 0, vinculado: true },
    },
  });

  it('sube como debtHistorico las marcas «vinculado» locales, sin tocar montos, saldos ni anclar', () => {
    const m = migrateV17(structuredClone(estadoV16())) as { debts: Debt[]; expenses: Transaction[] };
    const h = m.expenses.find((e) => e.id === 'h')!;
    expect(h).toMatchObject({ debtId: 'd1', debtHistorico: true, amount: 250 });
    expect(h.updated_at).not.toBe('2026-09-05T00:00:00.000Z'); // renovado: el sync lo sube
    expect(m.expenses.find((e) => e.id === 'real')).toEqual(mov({ id: 'real', debtId: 'd1', amount: 100 }));
    expect(m.expenses.find((e) => e.id === 'suelto')).toEqual(mov({ id: 'suelto' })); // sin debtId: nada
    expect(m.debts).toEqual([deuda({ balance: 1000 })]);
  });

  it('es idempotente', () => {
    const una = migrateV17(structuredClone(estadoV16()));
    const dos = migrateV17(structuredClone(una));
    expect(dos).toEqual(una);
  });

  it('sin descuentosDePago o sin movimientos no cambia nada', () => {
    const sinRegistro = { debts: [deuda()], expenses: [mov({ debtId: 'd1' })] };
    expect(migrateV17(structuredClone(sinRegistro))).toEqual(sinRegistro);
    expect(migrateV17({})).toEqual({});
  });
});

describe('store v17: importBackup y el saldo derivado', () => {
  beforeEach(() => estado().reset());
  const respaldo = (debts: Debt[], expenses: Transaction[]): BackupData => ({
    expenses, accounts: [], debts, assets: [], networth: [], budgetLines: [], recurrences: [],
    budgets: {}, budgetUpdatedAt: {}, savingsGoals: [], customExpenseCategories: [], customIncomeCategories: [],
    settings: { debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' },
  });

  it('un respaldo viejo (sin saldoBase) entra no anclado con su saldo', () => {
    estado().importBackup(respaldo([deuda({ balance: 640 })], [mov({ debtId: 'd1', amount: 100 })]));
    const d = estado().debts[0];
    expect('saldoBase' in d).toBe(false);
    expect(d.balance).toBe(640);
  });

  it('una deuda anclada del respaldo recalcula su saldo con los pagos importados', () => {
    estado().importBackup(respaldo(
      [deuda({ balance: 999, saldoBase: 1000 })],
      [mov({ debtId: 'd1', amount: 100 }), mov({ id: 'h', debtId: 'd1', amount: 50, debtHistorico: true })],
    ));
    expect(estado().debts[0]).toMatchObject({ saldoBase: 1000, balance: 900 });
  });
});
```

En `src/__tests__/credit-card.test.ts`, dentro de `describe('lib/credit-card')`, después del test `'normalizarDeuda quita datos inválidos y los de tarjeta en otras deudas'` (termina en la línea 45), añadir:

```ts
  it('normalizarDeuda: saldoBase válido se redondea; contadoBase solo en tarjetas con pago de contado', () => {
    expect(normalizarDeuda(tarjeta({ saldoBase: 1000.456 })).saldoBase).toBe(1000.46);
    expect('saldoBase' in normalizarDeuda(tarjeta({ saldoBase: -1 }))).toBe(false);
    expect(normalizarDeuda(tarjeta({ statementBalance: 100, contadoBase: 300.004 })).contadoBase).toBe(300);
    expect('contadoBase' in normalizarDeuda(tarjeta({ contadoBase: 300 }))).toBe(false); // sin contado
    const p = normalizarDeuda(tarjeta({ kind: 'Préstamo', saldoBase: 500, statementBalance: 10, contadoBase: 10 }));
    expect('contadoBase' in p).toBe(false);
    expect(p.saldoBase).toBe(500);
  });
```

- [ ] **Step 2: Ajustar los tests existentes que dependían de deudas no ancladas o de la versión 16**

Estos cambios mantienen la intención de cada test (probar el camino legado o la cadena de migraciones) con la nueva realidad: `addDebt` crea deudas ancladas y la versión es 17.

(a) `src/__tests__/debt-payments-store.test.ts`, test `'el registro de descuentos se persiste y reset() lo vacía'` (líneas 148-156). Reemplazarlo por:

```ts
  it('el registro de descuentos (deudas no ancladas) se persiste y reset() lo vacía', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 100, statementBalance: 100 })] });
    estado().registerDebtPayment('d1', { amount: 300, date: '2026-09-20', accountId: null });
    const pagoId = estado().expenses[0].id;
    const persistido = useFinanceStore.persist.getOptions().partialize!(estado()) as { descuentosDePago?: Record<string, unknown> };
    expect(persistido.descuentosDePago?.[pagoId]).toEqual({ balance: 100, statement: 100 });
    estado().reset();
    expect(estado().descuentosDePago).toEqual({});
  });
```

(b) Mismo archivo, test `'desvincular quita la marca; un pago real no se puede vincular encima y sí se devuelve al borrarlo'` (líneas 190-204). Reemplazarlo por:

```ts
  it('desvincular quita la marca; un pago real no se puede vincular encima y sí se devuelve al borrarlo', () => {
    const { id, txId } = escenario();
    const tx = () => estado().expenses.find((e) => e.id === txId)!;
    expect(tx().debtHistorico).toBe(true);
    estado().desvincularPago(txId);
    expect('debtHistorico' in tx() || 'debtId' in tx()).toBe(false);
    estado().vincularPagoHistorico(txId, id);
    expect(tx().debtHistorico).toBe(true);

    estado().registerDebtPayment(id, { amount: 100, date: '2026-09-20', accountId: null });
    const real = estado().expenses.find((e) => e.type === 'transfer')!;
    estado().vincularPagoHistorico(real.id, id); // ya paga la deuda: no-op
    expect(estado().expenses.find((e) => e.id === real.id)!.debtHistorico).toBeUndefined();
    expect(estado().debts[0].balance).toBe(900);
    estado().deleteTransaction(real.id);
    expect(estado().debts[0].balance).toBe(1000); // el real sí se devuelve
  });
```

(c) Mismo archivo, test `'la cadena completa desde v14 llega a v16 sin lanzar'` (líneas 231-242): cambiar el título a `'la cadena completa desde v14 llega a v17 sin lanzar'` y la línea `expect(opciones.version).toBe(16);` por `expect(opciones.version).toBe(17);`.

(d) `src/__tests__/debt-payments.test.ts`, test `'está en la cadena de migrate con la versión 16'` (líneas 182-187): título `'está en la cadena de migrate con la versión 17'` y `expect(opciones.version).toBe(17);`.

(e) `src/__tests__/finance-migrate-versiones.test.ts`:
- Líneas 30-32: título `'la versión actual del código es 17'` y `expect(opciones().version).toBe(17);`.
- Test `'en la versión actual (v16) es un no-op real'` (líneas 109-118): reemplazarlo por:

```ts
  it('desde v16 solo aplica v17: sube las marcas «vinculado» y no toca nada más', () => {
    const v16 = {
      expenses: [mov({ debtId: 'd1' })],
      debts: [deuda()],
      savingsGoals: [{ id: 'g1', concept: 'Hucha', target: 1000 }],
      accounts: [],
      recurrences: [],
      descuentosDePago: { m1: { balance: 0, vinculado: true } },
      pendienteHidratar: { debts: [], expenses: [] },
    };
    const m = migrar(v16, 16) as { expenses: Transaction[]; debts: Debt[]; savingsGoals: unknown[] };
    expect(m.expenses[0]).toMatchObject({ debtId: 'd1', debtHistorico: true, amount: 100 });
    expect(m.debts).toEqual([deuda()]); // no ancla
    expect(m.savingsGoals).toEqual(v16.savingsGoals);
  });

  it('en la versión actual (v17) es un no-op real', () => {
    const v17 = {
      expenses: [mov()],
      debts: [deuda()],
      savingsGoals: [{ id: 'g1', concept: 'Hucha', target: 1000 }],
      accounts: [],
      recurrences: [],
      descuentosDePago: { m1: { balance: 0, vinculado: true } },
    };
    expect(migrar(v17, 17)).toEqual(v17);
  });
```

(f) `src/__tests__/transaction-modal.test.tsx`, test `'editar un gasto enlazado antiguo (expense + debtId) lo normaliza a transferencia sin tocar el saldo'` (líneas 399-417). Es un dato ANTIGUO, así que la deuda debe ser no anclada. Reemplazar la línea `const debtId = nuevaDeuda({ balance: 750 });` por:

```ts
    const debtId = nuevaDeuda({ balance: 750 });
    // Dato antiguo: deuda sin anclar (anterior a la v17), como la tendría un usuario real.
    useFinanceStore.setState((s) => ({ debts: s.debts.map(({ saldoBase: _b, contadoBase: _c, ...d }) => d) }));
```

(g) `src/__tests__/sync-conflictos.test.ts`, test `'4. un pago de 150 sobre una deuda de 100, creado en A y borrado en B, devuelve 100'` del Paso 0: cambiar `it.fails(` por `it(`.

- [ ] **Step 3: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/debt-payments-store.test.ts src/__tests__/finance-migrate-versiones.test.ts src/__tests__/credit-card.test.ts src/__tests__/debt-payments.test.ts src/__tests__/sync-conflictos.test.ts`
Expected: FAIL — `migrateV17` no exportada, `confirmarSaldoDeuda is not a function`, `expected 16 to be 17`, `saldoBase` ausente tras `addDebt`, caso 4 del Paso 0 (`expected 0 to be 100`), `normalizarDeuda` sin redondeo de `saldoBase`.

- [ ] **Step 4: `normalizarDeuda` valida `saldoBase` y `contadoBase`**

En `src/lib/credit-card.ts`, reemplazar la función `normalizarDeuda` (líneas 13-30, con su comentario) por:

```ts
/**
 * Deja en la deuda solo los campos de tarjeta con valor válido: la clave
 * desaparece si viene null/undefined/NaN o fuera de rango. Así una deuda sin
 * esos datos tiene la misma forma local y remota (ver rowToDebt en sync).
 * En deudas que no son tarjeta los tres campos se quitan.
 *
 * Saldo derivado (spec sync-saldo-deudas): `saldoBase` inválido (negativo,
 * NaN) se quita; `contadoBase` solo sobrevive en tarjetas que conservan su
 * pago de contado (quitar el contado quita su base).
 */
export function normalizarDeuda<T extends Partial<Debt>>(d: T): T {
  const out: T = { ...d };
  const tarjeta = d.kind === undefined || d.kind === 'Tarjeta de crédito';
  const dia = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31;
  const monto = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!tarjeta || !dia(out.cutDay)) delete out.cutDay;
  if (!tarjeta || !monto(out.statementBalance)) delete out.statementBalance;
  else out.statementBalance = roundMoney(out.statementBalance as number);
  if (!tarjeta || !monto(out.creditLimit) || out.creditLimit === 0) delete out.creditLimit;
  else out.creditLimit = roundMoney(out.creditLimit as number);
  if (out.saldoBase !== undefined) {
    if (!monto(out.saldoBase)) delete out.saldoBase;
    else out.saldoBase = roundMoney(out.saldoBase as number);
  }
  if (!tarjeta || out.statementBalance === undefined || !monto(out.contadoBase)) delete out.contadoBase;
  else out.contadoBase = roundMoney(out.contadoBase as number);
  return out;
}
```

- [ ] **Step 5: Imports, interfaz y `ajustarDeudas` en el store**

En `src/stores/financeStore.ts`, después de la línea 16 (`import { normalizarDeuda } from '@/lib/credit-card';`) añadir:

```ts
import { recalcularSaldos, anclarDeuda, rebasarDeuda } from '@/lib/debt-balance';
```

En `interface FinanceState`, reemplazar las líneas 125-129 (comentarios y firmas de `vincularPagoHistorico` / `desvincularPago`) por:

```ts
  /** Enlaza un movimiento antiguo (sin deuda) a una deuda SIN cambiar ningún
   *  saldo. Queda marcado `debtHistorico` (sincronizado): borrarlo o editarlo
   *  tampoco lo mueve, en ningún dispositivo. */
  vincularPagoHistorico: (txId: string, debtId: string) => void;
  /** Quita el enlace de un pago a su deuda SIN cambiar el saldo mostrado
   *  (en una anclada, si el pago descontaba, rebasa para conservarlo). */
  desvincularPago: (txId: string) => void;
  /** Ancla una deuda (su saldo pasa a derivarse de sus pagos) preservando el
   *  saldo mostrado. No-op si ya estaba anclada o no existe. */
  confirmarSaldoDeuda: (id: string) => void;
```

Reemplazar `cambioDePagos` (líneas 211-220, con su comentario) por:

```ts
/**
 * Ajusta las deudas al pasar de `antes` a `despues` (invariante de deudas):
 * las no ancladas por el camino legado (`aplicarCambioDePagos`, con su
 * registro de descuentos) y las ancladas recalculando su saldo derivado con
 * `expensesNuevo`, el array de movimientos que queda tras la acción. Las
 * ancladas nunca cambian `updated_at` aquí: un pago no reescribe la deuda.
 */
function ajustarDeudas(
  state: Pick<FinanceState, 'debts' | 'descuentosDePago'>,
  antes: Transaction[],
  despues: Transaction[],
  expensesNuevo: Transaction[],
): Pick<FinanceState, 'debts' | 'descuentosDePago'> {
  const r = aplicarCambioDePagos(state.debts, state.descuentosDePago ?? {}, antes, despues, nowIso());
  return { debts: recalcularSaldos(r.debts, expensesNuevo), descuentosDePago: r.descuentos };
}
```

- [ ] **Step 6: `migrateV17`, la cadena y la versión**

Después de `migrateV16` (termina en la línea 187) añadir:

```ts
/** v17 (spec sync-saldo-deudas §5.5): las marcas «vinculado» locales de
 *  `descuentosDePago` pasan a `debtHistorico` en el propio movimiento (con
 *  `updated_at` renovado para que el sync las suba). Solo codifica una
 *  decisión que el usuario ya tomó al pulsar «Vincular»: no cambia montos ni
 *  saldos y NO ancla ninguna deuda (§11.1). Idempotente. */
export function migrateV17(state: Record<string, unknown>): Record<string, unknown> {
  const descuentos = state.descuentosDePago;
  if (!descuentos || typeof descuentos !== 'object' || !Array.isArray(state.expenses)) return state;
  const vinculados = new Set(
    Object.entries(descuentos as DescuentosDePago)
      .filter(([, rec]) => !!rec && rec.vinculado === true)
      .map(([id]) => id),
  );
  if (vinculados.size === 0) return state;
  const ahora = nowIso();
  state.expenses = (state.expenses as Transaction[]).map((e) =>
    vinculados.has(e.id) && e.debtId && !e.debtHistorico ? { ...e, debtHistorico: true as const, updated_at: ahora } : e,
  );
  return state;
}
```

En `MIGRACIONES` (líneas 385-394), añadir después de `[16, migrateV16],`:

```ts
  [17, migrateV17],
```

En las opciones de `persist`, cambiar `version: 16,` (línea 920) por `version: 17,`.

- [ ] **Step 7: Acciones de movimientos con `ajustarDeudas`**

Reemplazar el bloque de acciones de transacciones (líneas 468-530, desde el comentario `// Invariante de deudas:` hasta el cierre de `restoreTransactions`) por:

```ts
      // Invariante de deudas: un movimiento con `debtId` ES un pago de esa
      // deuda. Toda acción que lo crea, cambia, borra o restaura ajusta el
      // saldo en el MISMO set() (ajustarDeudas): las no ancladas por el camino
      // legado, las ancladas recalculando su saldo derivado.
      addTransaction: (t) => {
        const id = newId();
        set((state) => {
          const nuevo: Transaction = { ...t, id, created_at: nowIso(), updated_at: nowIso() };
          const expenses = [...state.expenses, nuevo];
          return { expenses, ...ajustarDeudas(state, [], [nuevo], expenses) };
        });
        return id;
      },

      updateTransaction: (id, partial) =>
        set((state) => {
          const viejo = state.expenses.find((e) => e.id === id);
          if (!viejo) return { tombstones: clearedTombstone(state.tombstones, id) };
          let nuevo: Transaction = { ...viejo, ...partial, updated_at: nowIso() };
          // Sin deuda no hay «histórico»: la marca viaja con debtId (spec §4).
          if (!nuevo.debtId && nuevo.debtHistorico) {
            const { debtHistorico: _historico, ...resto } = nuevo;
            nuevo = resto;
          }
          const expenses = state.expenses.map((e) => (e.id === id ? nuevo : e));
          return {
            expenses,
            tombstones: clearedTombstone(state.tombstones, id),
            ...ajustarDeudas(state, [viejo], [nuevo], expenses),
          };
        }),

      deleteTransaction: (id) =>
        set((state) => {
          const borrados = state.expenses.filter((e) => e.id === id);
          const expenses = state.expenses.filter((e) => e.id !== id);
          return {
            expenses,
            tombstones: tombstoned(state.tombstones, id),
            ...ajustarDeudas(state, borrados, [], expenses),
          };
        }),

      deleteTransactions: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          let tombstones = state.tombstones;
          ids.forEach((id) => {
            tombstones = tombstoned(tombstones, id);
          });
          const borrados = state.expenses.filter((e) => idSet.has(e.id));
          const expenses = state.expenses.filter((e) => !idSet.has(e.id));
          return {
            expenses,
            tombstones,
            ...ajustarDeudas(state, borrados, [], expenses),
          };
        }),

      // Undo de borrado masivo: conserva ids y timestamps originales. Un pago
      // restaurado vuelve a descontarse de su deuda.
      restoreTransactions: (items) =>
        set((state) => {
          const tombstones = { ...state.tombstones };
          items.forEach((item) => delete tombstones[item.id]);
          const expenses = [...state.expenses, ...items];
          return {
            expenses,
            tombstones,
            ...ajustarDeudas(state, [], items, expenses),
          };
        }),
```

- [ ] **Step 8: Acciones de deudas**

Reemplazar `addDebt` y `updateDebt` (líneas 787-797) por:

```ts
      // Una deuda nueva nace ANCLADA (spec §5.4.3): su saldo se deriva de sus
      // pagos, así que pagos concurrentes en dos dispositivos se suman.
      addDebt: (d) => {
        const id = newId();
        set((state) => {
          const base = normalizarDeuda({ ...d, id, updated_at: nowIso() });
          const nueva: Debt = { ...base, saldoBase: roundMoneyLocal(Math.max(0, base.balance)) };
          delete nueva.contadoBase;
          if (base.statementBalance !== undefined) nueva.contadoBase = base.statementBalance;
          return { debts: [...state.debts, nueva] };
        });
        return id;
      },

      // Saldo y contado solo se REBASAN si el valor recibido difiere del
      // derivado actual (el formulario siempre reenvía el saldo: editar la tasa
      // no debe tocar la base, spec §3.A.2). Cambiar el saldo de una deuda no
      // anclada la ancla con el valor nuevo (§5.4.2). Vaciar el contado quita
      // también su base (normalizarDeuda).
      updateDebt: (id, partial) =>
        set((state) => {
          const actual = state.debts.find((d) => d.id === id);
          if (!actual) return { tombstones: clearedTombstone(state.tombstones, id) };
          const { balance, statementBalance, saldoBase: _saldoBase, contadoBase: _contadoBase, ...resto } = partial;
          let n: Debt = { ...actual, ...resto };
          n = rebasarDeuda(
            n,
            state.expenses,
            {
              ...(balance !== undefined ? { balance } : {}),
              ...(statementBalance !== undefined ? { statementBalance } : {}),
            },
            state.descuentosDePago,
          );
          if ('statementBalance' in partial && statementBalance === undefined) {
            delete n.statementBalance;
            delete n.contadoBase;
          }
          const normalizada = normalizarDeuda({ ...n, updated_at: nowIso() });
          return {
            debts: state.debts.map((d) => (d.id === id ? normalizada : d)),
            tombstones: clearedTombstone(state.tombstones, id),
          };
        }),
```

Reemplazar `vincularPagoHistorico` y `desvincularPago` (líneas 826-854, comentario incluido) por:

```ts
      // Vincular/desvincular NO mueven el saldo mostrado. Lo vinculado queda
      // marcado `debtHistorico` en el propio movimiento (sincronizado), así
      // borrarlo o editarlo tampoco devuelve nada a la deuda en ningún
      // dispositivo. Ya no se escribe en `descuentosDePago`.
      vincularPagoHistorico: (txId, debtId) =>
        set((state) => {
          if (!state.debts.some((d) => d.id === debtId)) return {};
          const tx = state.expenses.find((e) => e.id === txId);
          // Un movimiento que ya paga una deuda no se puede vincular encima.
          if (!tx || tx.debtId) return {};
          return {
            expenses: state.expenses.map((e) =>
              e.id === txId ? { ...e, debtId, debtHistorico: true as const, updated_at: nowIso() } : e,
            ),
            tombstones: clearedTombstone(state.tombstones, txId),
          };
        }),

      desvincularPago: (txId) =>
        set((state) => {
          const { [txId]: _descuento, ...descuentosDePago } = state.descuentosDePago;
          const tx = state.expenses.find((e) => e.id === txId);
          if (!tx || !tx.debtId) return { descuentosDePago };
          const { debtId: _quitado, debtHistorico: _historico, ...resto } = tx;
          const expenses = state.expenses.map((e) => (e.id === txId ? { ...resto, updated_at: nowIso() } : e));
          let debts = state.debts;
          const deuda = state.debts.find((d) => d.id === tx.debtId);
          // Un pago que descontaba de una anclada: sin él el saldo derivado
          // subiría, así que se rebasa al saldo que se mostraba.
          if (deuda && deuda.saldoBase !== undefined && !tx.debtHistorico) {
            const conservada = rebasarDeuda(deuda, expenses, {
              balance: deuda.balance,
              ...(deuda.statementBalance !== undefined ? { statementBalance: deuda.statementBalance } : {}),
            });
            if (conservada !== deuda) {
              debts = state.debts.map((d) => (d.id === deuda.id ? { ...conservada, updated_at: nowIso() } : d));
            }
          }
          return { expenses, descuentosDePago, debts: recalcularSaldos(debts, expenses) };
        }),

      confirmarSaldoDeuda: (id) =>
        set((state) => {
          const deuda = state.debts.find((d) => d.id === id);
          if (!deuda || deuda.saldoBase !== undefined) return {};
          const anclada = normalizarDeuda({ ...anclarDeuda(deuda, state.expenses, state.descuentosDePago), updated_at: nowIso() });
          const debts = state.debts.map((d) => (d.id === id ? anclada : d));
          return { debts: recalcularSaldos(debts, state.expenses) };
        }),
```

- [ ] **Step 9: `importBackup` recalcula**

En `importBackup` (líneas 890-911), reemplazar:

```ts
        set({
          expenses: sellar(data.expenses),
          accounts: sellar(data.accounts),
          debts: sellar(data.debts),
```

por:

```ts
        const expenses = sellar(data.expenses);
        set({
          expenses,
          accounts: sellar(data.accounts),
          // Un respaldo viejo trae deudas sin saldoBase: entran no ancladas.
          debts: recalcularSaldos(sellar(data.debts), expenses),
```

- [ ] **Step 10: Ejecutar tests y type-check**

Run: `npx vitest run src/__tests__/debt-payments-store.test.ts src/__tests__/finance-migrate-versiones.test.ts src/__tests__/credit-card.test.ts src/__tests__/debt-payments.test.ts src/__tests__/sync-conflictos.test.ts src/__tests__/transaction-modal.test.tsx`
Expected: PASS (incluido el caso 4 del Paso 0 como `it`).

Run: `npx vitest run`
Expected: PASS de la suite completa. Si algún otro test existente falla porque inyecta con `setState` pagos con `debtId` sobre una deuda creada con `addDebt` (ahora anclada) y espera que el saldo no los descuente, está simulando un dato antiguo: aplicarle el mismo arreglo que en (f) —justo después de crear la deuda, `useFinanceStore.setState((s) => ({ debts: s.debts.map(({ saldoBase: _b, contadoBase: _c, ...d }) => d) }));` con un comentario «Dato antiguo: deuda sin anclar»— y anotarlo en el reporte de la tarea. No cambiar ninguna otra aserción.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint src/stores/financeStore.ts src/lib/credit-card.ts src/lib/debt-balance.ts src/lib/debt-payments.ts src/lib/sync.ts`
Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add src/lib/credit-card.ts src/stores/financeStore.ts src/__tests__/debt-payments-store.test.ts src/__tests__/finance-migrate-versiones.test.ts src/__tests__/credit-card.test.ts src/__tests__/debt-payments.test.ts src/__tests__/sync-conflictos.test.ts src/__tests__/transaction-modal.test.tsx
git commit -m "fix: store v17 con saldo de deudas derivado, confirmar saldo y marcas históricas sincronizadas"
```

---

### Task 7: UI — «Confirmar saldo», «Desvincular» por `debtHistorico` y avisos de borrado con `efectoDeBorrar`

**Files:**
- Modify: `src/pages/DebtsPage.tsx:44-53` (selectores), `:193-197` (handlers), `:355-362` (fila de deuda), `:748-752` (condición de «Desvincular»)
- Modify: `src/pages/MovementsPage.tsx:19` (import) y `:78-83` (`handleBulkDelete`)
- Modify: `src/components/features/movements/TransactionModal.tsx:14` (import) y `:225-234` (mensaje de borrado)
- Test: `src/__tests__/debts-page.test.tsx`, `src/__tests__/movements-pagos-deuda.test.tsx`, `src/__tests__/transaction-modal.test.tsx`, `src/__tests__/backup.test.ts`

**Interfaces:**
- Consumes: `confirmarSaldoDeuda(id: string): void` del store (Task 6); `efectoDeBorrar(tx, debts, expenses, descuentos): number` de `@/lib/debt-balance` (Task 1); `Debt.saldoBase`, `Transaction.debtHistorico` (Task 1).
- Produces: botón accesible `Confirmar saldo de <nombre>` en cada deuda no anclada; ningún cambio de API.

> Cambio visual mínimo (una línea de texto + botón con las clases ya existentes `saas-btn saas-btn-secondary saas-btn-sm text-xs`), sin nueva dirección estética: no hace falta la skill `frontend-design` (spec §6.3). Si se decide algo más visible, invocarla antes. `text-2xs` es solo para etiquetas en mayúsculas: el texto usa `text-xs`.

- [ ] **Step 1: Escribir los tests (rojos)**

`src/__tests__/debts-page.test.tsx`, al final del archivo:

```ts
describe('DebtsPage — saldo derivado (spec sync-saldo-deudas)', () => {
  const legada = {
    id: 'd1', name: 'Visa', tag: 'personal' as const, kind: 'Tarjeta de crédito' as const, balance: 700,
    annualRate: 30, minPayment: 50, payDay: null, updated_at: '2026-09-01T00:00:00.000Z',
  };

  it('«Confirmar saldo» aparece solo en deudas no ancladas y anclar no cambia el saldo mostrado', async () => {
    const user = userEvent.setup();
    useFinanceStore.setState({ debts: [legada] });
    useFinanceStore.getState().addDebt({ name: 'Auto', tag: 'personal', kind: 'Préstamo', balance: 5000, annualRate: 10, minPayment: 200, payDay: null });
    render(<DebtsPage />);

    expect(within(filaDe('Visa')).getByText(/Confirma que el saldo de \$700\.00 coincide con tu banco/)).toBeInTheDocument();
    expect(within(filaDe('Auto')).queryByRole('button', { name: /Confirmar saldo/ })).not.toBeInTheDocument();

    await user.click(within(filaDe('Visa')).getByRole('button', { name: 'Confirmar saldo de Visa' }));

    const d = useFinanceStore.getState().debts.find((x) => x.id === 'd1')!;
    expect(d).toMatchObject({ saldoBase: 700, balance: 700 });
    expect(within(filaDe('Visa')).queryByRole('button', { name: /Confirmar saldo/ })).not.toBeInTheDocument();
    expect(filaDe('Visa')).toHaveTextContent('$700.00');
  });

  it('«Desvincular» sigue debtHistorico en una deuda anclada, sin mirar el registro local', async () => {
    const user = userEvent.setup();
    const st = useFinanceStore.getState();
    const id = st.addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: null });
    // Histórico vinculado en OTRO dispositivo: llegó por el sync, sin registro en descuentosDePago.
    useFinanceStore.setState((s) => ({
      expenses: [...s.expenses, {
        id: 'h', type: 'expense', amount: 300, concept: 'Pago Visa (viejo)', date: '2026-08-15', category: 'pago-tarjetas',
        method: 'cash', businessType: 'personal', debtId: id, debtHistorico: true, updated_at: '2026-08-15T00:00:00.000Z',
      }],
    }));
    st.addTransaction({ type: 'expense', amount: 100, concept: 'Pago real', date: '2026-09-10', category: 'pago-tarjetas', method: 'cash', businessType: 'personal', debtId: id });
    render(<DebtsPage />);

    await user.click(screen.getByRole('button', { name: /Historial de pagos \(2\)/ }));
    const panel = document.getElementById(`historial-${id}`)!;
    const botones = within(panel).getAllByRole('button', { name: /Desvincular/ });
    expect(botones).toHaveLength(1);
    expect(botones[0]).toHaveAccessibleName(/\$300\.00/);
  });
});
```

`src/__tests__/transaction-modal.test.tsx`, dentro de `describe('TransactionModal — pago de una deuda (un pago no es gasto)')`, al final:

```ts
  it('deuda anclada: avisa lo que de verdad subirá según el resto de pagos (tope agregado)', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda({ name: 'Visa Pichincha', balance: 100 });
    useFinanceStore.getState().registerDebtPayment(debtId, { amount: 150, date: '2026-08-10', accountId: null });
    useFinanceStore.getState().registerDebtPayment(debtId, { amount: 30, date: '2026-08-11', accountId: null });
    const grande = useFinanceStore.getState().expenses.find((e) => e.amount === 150)!;

    abrirModal(grande.id);
    montar();
    await user.click(screen.getByRole('button', { name: 'Eliminar movimiento' }));

    expect(screen.getByText(/volverá a subir \$70\.00/)).toBeInTheDocument();
  });

  it('deuda anclada: borrar un pago que no mueve el saldo lo dice sin llamarlo «vinculado a mano»', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda({ name: 'Visa Pichincha', balance: 100 });
    useFinanceStore.getState().registerDebtPayment(debtId, { amount: 150, date: '2026-08-10', accountId: null });
    useFinanceStore.getState().registerDebtPayment(debtId, { amount: 30, date: '2026-08-11', accountId: null });
    const chico = useFinanceStore.getState().expenses.find((e) => e.amount === 30)!;

    abrirModal(chico.id);
    montar();
    await user.click(screen.getByRole('button', { name: 'Eliminar movimiento' }));

    expect(screen.getByText(/El saldo de «Visa Pichincha» no cambiará/)).toBeInTheDocument();
    expect(screen.queryByText(/vinculado a mano/)).not.toBeInTheDocument();
    expect(screen.queryByText(/volverá a subir/)).not.toBeInTheDocument();
  });

  it('un histórico llegado de otro dispositivo (sin registro local) se anuncia como vinculado a mano', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda({ name: 'Visa Pichincha', balance: 1000 });
    useFinanceStore.setState({
      expenses: [{
        id: 'h', type: 'expense', amount: 250, concept: 'Pago viejo', date: '2026-08-10', category: 'pago-tarjetas',
        method: 'cash', businessType: 'personal', debtId, debtHistorico: true, updated_at: '2026-08-10T00:00:00.000Z',
      }],
    });

    abrirModal('h');
    montar();
    await user.click(screen.getByRole('button', { name: 'Eliminar movimiento' }));

    expect(screen.getByText(/pago vinculado a mano: el saldo de «Visa Pichincha» no cambiará/)).toBeInTheDocument();
  });
```

`src/__tests__/movements-pagos-deuda.test.tsx`, dentro de `describe('MovementsPage — borrado masivo con pagos de deuda')`, al final:

```ts
  it('un histórico llegado de otro dispositivo (debtHistorico, sin registro local) no dispara el aviso', async () => {
    const { visa } = conDeudas();
    useFinanceStore.setState((s) => ({
      expenses: [
        ...s.expenses,
        mov({ concept: 'Cuota vieja', amount: 200, category: 'pago-tarjetas', debtId: visa, debtHistorico: true }),
        mov({ concept: 'Café', amount: 30 }),
      ],
    }));
    render(<MovementsPage />);

    const mensaje = await seleccionarYEliminar(['Cuota vieja', 'Café']);
    expect(mensaje).toContain('2 transacciones eliminadas');
    expect(mensaje).not.toContain('vuelve');
    expect(useFinanceStore.getState().debts.find((d) => d.id === visa)!.balance).toBe(1000);
  });
```

`src/__tests__/backup.test.ts`, dentro de `describe('backup')`, al final (test de guarda: `backup.ts` no cambia y debe pasar ya):

```ts
  it('conserva saldoBase, contadoBase y debtHistorico en la ida y vuelta', () => {
    const conSaldo: BackupData = {
      ...datos,
      debts: [{
        id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 900, annualRate: 30,
        minPayment: 50, payDay: null, statementBalance: 200, saldoBase: 1000, contadoBase: 300, updated_at: 'x',
      }],
      expenses: [{ ...datos.expenses[0], debtId: 'd1', debtHistorico: true }],
    };
    expect(parseBackup(JSON.stringify(buildBackup(conSaldo)))).toEqual(conSaldo);
  });
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/__tests__/debts-page.test.tsx src/__tests__/transaction-modal.test.tsx src/__tests__/movements-pagos-deuda.test.tsx src/__tests__/backup.test.ts`
Expected: FAIL en los tests nuevos de UI (no existe «Confirmar saldo»; dos botones «Desvincular»; aviso de `$150.00` en vez de `$70.00`; «vinculado a mano» para el pago de 30; aviso «vuelve» en el borrado masivo). El test de `backup` pasa ya (guarda).

- [ ] **Step 3: `DebtsPage.tsx`**

Después de `const desvincularPago = useFinanceStore((s) => s.desvincularPago);` (línea 49) añadir:

```tsx
  const confirmarSaldoDeuda = useFinanceStore((s) => s.confirmarSaldoDeuda);
```

Después de `handleDesvincular` (termina en la línea 197) añadir:

```tsx
  function handleConfirmarSaldo(d: Debt) {
    confirmarSaldoDeuda(d.id);
    addToast(`Saldo de ${d.name} confirmado: se mantendrá igual en todos tus dispositivos`, 'success');
    syncToCloud(saveData, addToast);
  }
```

En la fila de la deuda, justo después del `</div>` que cierra el grupo de botones (el `div` con `className="flex gap-x-2 gap-y-1 mt-1.5 flex-wrap"`, línea 362) y antes del `</div>` que cierra `flex-1 min-w-[180px]`, añadir:

```tsx
                      {/* Deuda no anclada (anterior al saldo derivado): su saldo
                          aún se lleva como contador en este dispositivo. Anclarla
                          es decisión del usuario (spec sync-saldo-deudas §5.4). */}
                      {d.saldoBase === undefined && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Confirma que el saldo de {formatMoney(d.balance)} coincide con tu banco para que se mantenga igual en todos tus dispositivos.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleConfirmarSaldo(d)}
                            className="saas-btn saas-btn-secondary saas-btn-sm text-xs"
                            aria-label={`Confirmar saldo de ${d.name}`}
                          >
                            Confirmar saldo
                          </button>
                        </div>
                      )}
```

En `HistorialPagos`, reemplazar el comentario y la condición de «Desvincular» (líneas 748-752):

```tsx
                        {/* Solo se desvincula un gasto vinculado a mano (o uno
                            antiguo sin registro de descuento). Un pago que sí
                            bajó la deuda —lo registra `descuentosDePago`— no tiene
                            «antes», y quitarle el enlace lo dejaría huérfano. */}
                        {tx && tx.type === 'expense' && (!descuentos[tx.id] || descuentos[tx.id].vinculado) && (
```

por:

```tsx
                        {/* Solo se desvincula un pago histórico (vinculado a
                            mano): la marca `debtHistorico` viaja con el
                            movimiento, así todos los dispositivos muestran lo
                            mismo. En una deuda NO anclada se mantiene además la
                            regla legada (gasto sin registro de descuento o
                            marcado «vinculado» en este dispositivo). */}
                        {tx && tx.type === 'expense' && (
                          tx.debtHistorico ||
                          (debt.saldoBase === undefined && (!descuentos[tx.id] || descuentos[tx.id].vinculado))
                        ) && (
```

- [ ] **Step 4: `MovementsPage.tsx`**

Línea 19: quitar `montoQueRevierte` del import:

```tsx
import { categoriaDePago, cuentaComoGasto, esPagoDeDeuda, etiquetaPago } from '@/lib/debt-payments';
import { efectoDeBorrar } from '@/lib/debt-balance';
```

Reemplazar las líneas 78-83:

```tsx
    // Borrar un pago de deuda devuelve su monto a la deuda: se avisa (como en
    // el borrado individual). Los vinculados a mano no cambian ningún saldo.
    const { descuentosDePago, debts } = useFinanceStore.getState();
    const pagosQueSuben = deletedItems.filter(
      (e) => debts.some((d) => d.id === e.debtId) && montoQueRevierte(e, descuentosDePago) > 0,
    ).length;
```

por:

```tsx
    // Borrar un pago de deuda puede subir su saldo: se avisa (como en el
    // borrado individual). `efectoDeBorrar` da lo mismo en todos los
    // dispositivos; los históricos vinculados a mano no cambian ningún saldo.
    const { descuentosDePago, debts, expenses } = useFinanceStore.getState();
    const pagosQueSuben = deletedItems.filter(
      (e) => efectoDeBorrar(e, debts, expenses, descuentosDePago) > 0,
    ).length;
```

- [ ] **Step 5: `TransactionModal.tsx`**

Línea 14: quitar `montoQueRevierte` y añadir el import nuevo:

```tsx
import { esCategoriaDePago, categoriaDePago } from '@/lib/debt-payments';
import { efectoDeBorrar } from '@/lib/debt-balance';
```

Reemplazar las líneas 225-234:

```tsx
  // Borrar un pago devuelve su monto al saldo de la deuda (invariante del
  // store): se le dice al usuario antes de confirmar.
  const porBorrar = deletingId !== null ? useFinanceStore.getState().expenses.find((e) => e.id === deletingId) : undefined;
  const deudaDelPago = porBorrar?.debtId ? debts.find((d) => d.id === porBorrar.debtId) : undefined;
  const devolucion = porBorrar ? montoQueRevierte(porBorrar, useFinanceStore.getState().descuentosDePago) : 0;
  const mensajeBorrado = porBorrar && deudaDelPago
    ? devolucion > 0
      ? `El saldo de «${deudaDelPago.name}» volverá a subir ${formatMoney(devolucion)}. Esta acción no se puede deshacer.`
      : `Es un pago vinculado a mano: el saldo de «${deudaDelPago.name}» no cambiará. Esta acción no se puede deshacer.`
    : 'Esta acción no se puede deshacer.';
```

por:

```tsx
  // Borrar un pago puede subir el saldo de su deuda (invariante del store):
  // se le dice al usuario antes de confirmar, con el efecto real
  // (`efectoDeBorrar`: igual en todos los dispositivos y con el tope a 0).
  const { expenses: todosLosMovimientos, descuentosDePago } = useFinanceStore.getState();
  const porBorrar = deletingId !== null ? todosLosMovimientos.find((e) => e.id === deletingId) : undefined;
  const deudaDelPago = porBorrar?.debtId ? debts.find((d) => d.id === porBorrar.debtId) : undefined;
  const devolucion = porBorrar ? efectoDeBorrar(porBorrar, debts, todosLosMovimientos, descuentosDePago) : 0;
  const mensajeBorrado = porBorrar && deudaDelPago
    ? devolucion > 0
      ? `El saldo de «${deudaDelPago.name}» volverá a subir ${formatMoney(devolucion)}. Esta acción no se puede deshacer.`
      : porBorrar.debtHistorico
        ? `Es un pago vinculado a mano: el saldo de «${deudaDelPago.name}» no cambiará. Esta acción no se puede deshacer.`
        : `El saldo de «${deudaDelPago.name}» no cambiará. Esta acción no se puede deshacer.`
    : 'Esta acción no se puede deshacer.';
```

- [ ] **Step 6: Ejecutar tests, type-check y lint**

Run: `npx vitest run src/__tests__/debts-page.test.tsx src/__tests__/transaction-modal.test.tsx src/__tests__/movements-pagos-deuda.test.tsx src/__tests__/backup.test.ts src/__tests__/settings-backup.test.tsx`
Expected: PASS (nuevos y existentes).

Run: `npx tsc --noEmit`
Expected: sin errores (en particular, ningún uso restante de `montoQueRevierte` fuera de `debt-payments.ts`/`debt-balance.ts`/sus tests).

Run: `npx eslint src/pages/DebtsPage.tsx src/pages/MovementsPage.tsx src/components/features/movements/TransactionModal.tsx`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/pages/DebtsPage.tsx src/pages/MovementsPage.tsx src/components/features/movements/TransactionModal.tsx src/__tests__/debts-page.test.tsx src/__tests__/transaction-modal.test.tsx src/__tests__/movements-pagos-deuda.test.tsx src/__tests__/backup.test.ts
git commit -m "feat: confirmar saldo de deudas y avisos de borrado iguales en todos los dispositivos"
```

---

### Task 8: Cierre — documentación y verificación final

**Files:**
- Modify: `README.md:111` (tabla de migraciones) y `README.md:133-138` (tras «Hidratación de campos ausentes»)
- Modify: `.agents/specs/README.md` (tabla de specs)
- NO modificar: `CLAUDE.md` (ver Step 3)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación; ningún cambio de código.

> Esta tarea NO ejecuta `git push` ni abre PR, y NO aplica la migración 0020 en Supabase: ambas cosas las hace el controlador de la sesión con OK del usuario. La wiki (`stores-zustand.md` / `sync-y-autenticacion.md`) no vive en este repo: solo se actualiza si el usuario lo pide.

- [ ] **Step 1: README — fila de la 0020 y nota de datos**

En `README.md`, después de la fila de `0019_debts_card_statement.sql` (línea 111), añadir:

```markdown
| `0020_debts_saldo_base.sql` | Columnas opcionales `saldo_base`, `contado_base` y `saldo_base_at` en `debts`, y `debt_historico` en `expenses`: el saldo de una deuda anclada se deriva de sus pagos y un pago histórico vinculado a mano no descuenta. Solo añade columnas; no toca datos | **Antes** de desplegar el cliente que las usa (sin ellas, el sync se desactiva con 42703). Después, actualizar todos los dispositivos |
```

Después del párrafo «**Hidratación de campos ausentes (store v16):** …» (termina en la línea 138), añadir:

```markdown

**Saldo de deudas derivado (store v17, migración 0020):** el saldo de una deuda se sincronizaba
como valor absoluto aunque cada pago lo modificaba sumando y restando, así que dos pagos
concurrentes perdían uno y editar la tasa con una copia vieja devolvía un pago. Una deuda
**anclada** guarda un `saldoBase` que solo cambia cuando el usuario fija el saldo (al crearla,
en «Actualizar estado de cuenta», al editar el saldo o con «Confirmar saldo»), y el saldo
mostrado es `max(0, saldoBase − Σ pagos)`; los pagos ya no reescriben la fila de la deuda. Un
pago histórico vinculado a mano lleva `debtHistorico` y no descuenta. Las deudas existentes
**no se anclan solas**: Deudas muestra «Confirmar saldo» en cada una hasta que el usuario lo
pulsa. Si un dispositivo con la versión anterior reescribe una deuda, deja de estar anclada
(`saldo_base_at` ya no coincide con `updated_at`) y hay que volver a confirmarla. La columna
`balance` en la base de datos es solo una caché para clientes viejos y consultas SQL: se
refresca cuando la fila se sube por otro motivo. Detalle en `.agents/specs/sync-saldo-deudas.md`.
```

- [ ] **Step 2: README de specs**

En `.agents/specs/README.md`, añadir al final de la tabla:

```markdown
| `sync-saldo-deudas.md` | Implementada — saldo de deudas derivado de sus pagos (store v17, `0020_debts_saldo_base.sql`), anclaje confirmado por el usuario y `debtHistorico` sincronizado. Pendiente: retirar `descuentosDePago` cuando no quede ninguna deuda sin anclar; metas de ahorro en un spec aparte (`sync-aportes-metas.md`, §9) |
```

- [ ] **Step 3: Texto propuesto para `CLAUDE.md` (no aplicarlo)**

El spec (§7, Paso 6) exige confirmar con el usuario antes de tocar `CLAUDE.md`. No editar el archivo: copiar en el reporte de la tarea este reemplazo propuesto para que el controlador lo presente al usuario. La frase actual, en la descripción de `financeStore.ts`, es:

> Likewise a movement with `debtId` *is* a payment of that debt: every transaction action (add/update/delete/delete-many/restore) and `registerDebtPayment` adjust the debt's `balance` in the same `set()` (`src/lib/debt-payments.ts`), so the balance and the per-debt payment history in Deudas never diverge.

Reemplazo propuesto:

> Likewise a movement with `debtId` *is* a payment of that debt. For an **anchored** debt (`saldoBase` present — every new debt, or an old one after the user presses «Confirmar saldo»/changes its balance) the balance is derived, `max(0, saldoBase − Σ payments)` (`src/lib/debt-balance.ts`): payments never rewrite the debt row, every transaction action recalculates the cached `balance` in the same `set()` (`ajustarDeudas` → `recalcularSaldos`), and `applyMerge` recalculates it after each pull, so concurrent payments on two devices add up. Non-anchored debts keep the legacy counter (`aplicarCambioDePagos` + local `descuentosDePago`). A historical payment linked by hand carries `debtHistorico` (synced) and never moves any balance. Existing debts are never anchored automatically.

- [ ] **Step 4: Verificación completa**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint .`
Expected: sin errores.

Run: `npx vitest run`
Expected: PASS de toda la suite; ningún `it.fails` restante en `src/__tests__/sync-conflictos.test.ts` (comprobar con `rg "it\.fails" src/__tests__/sync-conflictos.test.ts` → sin resultados).

Run: `npx vite build`
Expected: build correcto.

Borrar el `dist/` generado (no se despliega desde aquí). PowerShell: `Remove-Item -Recurse -Force dist` · Bash: `rm -rf dist`.

- [ ] **Step 5: Commit**

```bash
git add README.md .agents/specs/README.md
git commit -m "docs: saldo de deudas derivado y migración 0020"
```

- [ ] **Step 6: Reporte al controlador**

Incluir en el reporte: resultado de los cuatro comandos de verificación; el texto propuesto para `CLAUDE.md` (Step 3); la lista de tests existentes cuyo fixture se pasó a «deuda sin anclar» (los de la Task 6 Step 2 y cualquier otro encontrado en la Task 6 Step 10); y el recordatorio de que, antes del PR, el spec pide una revisión (Opus) de §5.3 y §6.2, y que la 0020 debe aplicarse en Supabase ANTES de desplegar el cliente, con OK del usuario.

---

## Self-Review (hecho al escribir el plan)

**Cobertura del spec:**
- §1 (problema: casos 1–3, §1.2): reproducidos en la Task 4 (casos 1, 2, 3a/3b, 4) y arreglados en las Tasks 5–6.
- §1.3 / §9 (metas de ahorro): fuera de alcance por §11.4; solo se anota en `.agents/specs/README.md` (Task 8).
- §2 (requisitos): convergencia y suma de pagos → Tasks 1, 5, 6; borrado/edición iguales en todos los dispositivos → `debtHistorico` (Tasks 3, 5, 6) y `efectoDeBorrar` (Task 7); motor de sync intacto → Global Constraints y Task 5; offline → toda la lógica vive en el store (Task 6), sin dependencia de Supabase; transición sin correcciones automáticas → §5.4 en Task 6 (nada se ancla solo); consumidores de `balance` sin cambios → `balance` sigue siendo el campo que se lee.
- §3 (opciones): se implementa la A; §3.A.1 (rebase concurrente LWW) se acepta y documenta (README, Task 8); §3.A.2 → `rebasarDeuda` solo rebasa lo que difiere (Task 1) y `updateDebt` (Task 6); §3.A.3 → `debtHistorico`; §3.A.4 → `saldo_base_at` (Task 5).
- §4 (`descuentosDePago`): conservado para no ancladas; `aplicarCambioDePagos` respeta `debtHistorico` (Task 3); UI deja de depender de él para ancladas (Task 7).
- §5.1 → Task 1; §5.2 → Task 2 (+ README en Task 8); §5.3 → Task 5; §5.4 → `confirmarSaldoDeuda`, `rebasarDeuda`, `addDebt` (Tasks 1, 6, 7); §5.5 → `migrateV17` (Task 6).
- §6.1 → Task 1 (+ Task 3 para `debt-payments.ts`); §6.2 → Task 6 (tabla completa: acciones de movimientos, `registerDebtPayment` sin cambios, `addDebt`, `updateDebt` + `normalizarDeuda`, `confirmarSaldoDeuda`, vincular/desvincular, `importBackup`; `deleteDebt`/`reset` sin cambios); §6.3 → Task 7.
- §7 → Tasks 1–8 (orden ajustado, ver «Notas del plan»); §8 (riesgos) → README (Task 8) y test de invariante (Task 6); §10 → Global Constraints; §11 → Global Constraints.

**Placeholders:** ningún paso de código sin código; el único paso condicional (Task 6 Step 10, fixtures adicionales) trae el snippet exacto a aplicar.

**Consistencia de nombres y firmas:** `recalcularSaldos(debts, expenses)`, `anclarDeuda(debt, expenses, descuentos)`, `rebasarDeuda(debt, expenses, cambios, descuentos?)`, `efectoDeBorrar(tx, debts, expenses, descuentos)`, `sumaDePagos(expenses)`, `saldoDerivado(debt, suma)`, `pagaDeuda(t, debtId)`, `estaAnclada(d)`, `ajustarDeudas(state, antes, despues, expensesNuevo)`, `confirmarSaldoDeuda(id)`, `migrateV17(state)` se usan con la misma firma en todas las tareas; campos `saldoBase`/`contadoBase`/`debtHistorico` y columnas `saldo_base`/`contado_base`/`saldo_base_at`/`debt_historico` idénticos en Tasks 1, 2, 5, 6 y 7.
