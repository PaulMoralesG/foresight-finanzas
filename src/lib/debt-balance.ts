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
