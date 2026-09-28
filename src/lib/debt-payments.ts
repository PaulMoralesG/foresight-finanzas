// ================================================================
// PAGOS DE DEUDAS — un pago es un movimiento con `debtId`
//
// Una sola fuente de verdad: el historial de una deuda son sus movimientos
// enlazados, y el saldo se ajusta cuando esos movimientos cambian. Todo lo de
// aquí es puro; el store decide cuándo aplicarlo (ver financeStore).
// ================================================================

import { roundMoney } from './utils';
import type { Debt, DebtKind, Transaction } from '@/types';

/** Categorías en las que un gasto puede ser el pago de una deuda. */
export const CATEGORIAS_DE_PAGO = ['pago-tarjetas', 'prestamos'] as const;

export function esCategoriaDePago(category: string): boolean {
  return (CATEGORIAS_DE_PAGO as readonly string[]).includes(category);
}

/** La categoría de gasto que corresponde a un tipo de deuda. */
export function categoriaDePago(kind: DebtKind): string {
  return kind === 'Tarjeta de crédito' ? 'pago-tarjetas' : 'prestamos';
}

/** Lo que un movimiento descuenta de cada deuda (0 si no paga ninguna). */
function aportes(movs: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movs) {
    if (!m.debtId) continue;
    out[m.debtId] = (out[m.debtId] ?? 0) + m.amount;
  }
  return out;
}

/**
 * Cuánto cambia el saldo de cada deuda al pasar de `antes` a `despues`
 * (los movimientos afectados, no todos). Positivo = el saldo sube (se deshizo
 * un pago), negativo = baja (se registró uno).
 *
 * Alta: antes = [], despues = [nuevo]. Borrado: al revés. Edición: [viejo] →
 * [nuevo], que cubre a la vez un cambio de monto y un cambio de deuda.
 */
export function deltaDeSaldos(antes: Transaction[], despues: Transaction[]): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const [id, monto] of Object.entries(aportes(antes))) delta[id] = (delta[id] ?? 0) + monto;
  for (const [id, monto] of Object.entries(aportes(despues))) delta[id] = (delta[id] ?? 0) - monto;
  for (const id of Object.keys(delta)) if (Math.abs(delta[id]) < 0.005) delete delta[id];
  return delta;
}

/**
 * Aplica los deltas a las deudas. El saldo nunca baja de 0.
 *
 * En una tarjeta con pago de contado conocido, el pago también se descuenta
 * de él (y borrarlo lo devuelve): así la tarjeta dice cuánto falta para no
 * pagar intereses en este corte.
 */
export function aplicarDeltas(debts: Debt[], delta: Record<string, number>, ahora: string): Debt[] {
  if (Object.keys(delta).length === 0) return debts;
  return debts.map((d) => {
    const cambio = delta[d.id];
    if (cambio === undefined) return d;
    const siguiente: Debt = { ...d, balance: Math.max(0, roundMoney(d.balance + cambio)), updated_at: ahora };
    if (d.statementBalance !== undefined) {
      siguiente.statementBalance = Math.max(0, roundMoney(d.statementBalance + cambio));
    }
    return siguiente;
  });
}

export interface PagoDeDeuda {
  id: string;
  date: string;
  amount: number;
  accountId: string | null;
  /** true si cuenta como gasto del mes; false si es solo una salida de cuenta. */
  esGasto: boolean;
  /** Saldo de la deuda justo después de este pago (reconstruido). */
  saldoDespues: number;
}

export interface HistorialDeuda {
  pagos: PagoDeDeuda[]; // del más reciente al más antiguo
  totalPagado: number;
}

/**
 * Historial de una deuda a partir de sus movimientos enlazados.
 *
 * El saldo tras cada pago se reconstruye hacia atrás desde el saldo actual:
 * tras el último pago el saldo es el de hoy; antes de él, ese saldo más su
 * monto. Si el saldo se editó a mano entre pagos la serie lo absorbe en el
 * tramo más antiguo, que es lo razonable sin un registro de ediciones.
 */
export function historialDeuda(debt: Debt, expenses: Transaction[]): HistorialDeuda {
  const propios = expenses
    .filter((e) => e.debtId === debt.id)
    .sort((a, b) => (a.date === b.date ? (b.created_at ?? '').localeCompare(a.created_at ?? '') : b.date.localeCompare(a.date)));

  let saldo = debt.balance;
  const pagos: PagoDeDeuda[] = propios.map((e) => {
    const pago: PagoDeDeuda = {
      id: e.id,
      date: e.date,
      amount: e.amount,
      accountId: e.accountId ?? null,
      esGasto: e.type === 'expense',
      saldoDespues: roundMoney(saldo),
    };
    saldo += e.amount;
    return pago;
  });

  return { pagos, totalPagado: roundMoney(propios.reduce((s, e) => s + e.amount, 0)) };
}

/**
 * Cuenta de origen del pago más reciente de la deuda, para precargarla en
 * «Registrar pago». Sale de los propios movimientos (sin estado nuevo, así
 * vale igual en todos los dispositivos). Ignora cuentas que ya no existen;
 * '' si no hay ninguna.
 */
export function ultimaCuentaDePago(debt: Debt, expenses: Transaction[], cuentasValidas: string[]): string {
  const pago = historialDeuda(debt, expenses).pagos.find((p) => p.accountId && cuentasValidas.includes(p.accountId));
  return pago?.accountId ?? '';
}

/**
 * Enlaza a su deuda los pagos registrados antes de que existiera `debtId`:
 * los que creaba «Registrar pago» se llaman «Pago <nombre de la deuda>» y van
 * en una categoría de pago. Solo enlaza si el nombre identifica una única
 * deuda. NO toca saldos: esos pagos ya se habían descontado.
 */
export function enlazarPagosAntiguos(expenses: Transaction[], debts: Debt[], ahora: string): Transaction[] {
  const porNombre = new Map<string, Debt[]>();
  for (const d of debts) porNombre.set(d.name, [...(porNombre.get(d.name) ?? []), d]);
  return expenses.map((e) => {
    if (e.debtId || e.type !== 'expense' || !esCategoriaDePago(e.category)) return e;
    const nombre = e.concept.startsWith('Pago ') ? e.concept.slice(5) : null;
    const candidatas = nombre ? porNombre.get(nombre) : undefined;
    if (!candidatas || candidatas.length !== 1) return e;
    return { ...e, debtId: candidatas[0].id, updated_at: ahora };
  });
}
