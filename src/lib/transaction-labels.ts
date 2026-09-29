// ================================================================
// Etiqueta y color de cada tipo de movimiento (ingreso, gasto, transferencia,
// pago de deuda). Fuera de TransactionBits para que ese archivo solo exporte
// componentes (react-refresh) y para compartirlo con las filas de Movimientos.
// ================================================================

import { esPagoDeDeuda } from './debt-payments';
import type { Transaction, TransactionType } from '@/types';

/**
 * Lo que las etiquetas necesitan saber de un movimiento. Se acepta el tipo
 * suelto (uso histórico) o el movimiento: un `debtId` lo convierte en «Pago de
 * deuda» sea cual sea su tipo (`expense` antiguo o `transfer` nuevo).
 */
export type TipoDeMovimiento = TransactionType | Pick<Transaction, 'type' | 'debtId'>;

function normalizar(t: TipoDeMovimiento): { type: TransactionType; pago: boolean } {
  return typeof t === 'string' ? { type: t, pago: false } : { type: t.type, pago: esPagoDeDeuda(t) };
}

export function typeLabel(t: TipoDeMovimiento): string {
  const { type, pago } = normalizar(t);
  if (pago) return 'Pago de deuda';
  return type === 'income' ? 'Ingreso' : type === 'expense' ? 'Gasto' : 'Transferencia';
}

/** Clases de color de la píldora de tipo. Una transferencia o un pago de deuda van en neutro. */
export function typePillClasses(t: TipoDeMovimiento): string {
  const { type, pago } = normalizar(t);
  if (!pago && type === 'income') return 'bg-income-50 dark:bg-income-950 text-income-700 dark:text-income-400';
  if (!pago && type === 'expense') return 'bg-expense-50 dark:bg-expense-950 text-expense-700 dark:text-expense-400';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
}
