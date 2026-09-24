// ================================================================
// Etiqueta y color de cada tipo de movimiento (ingreso, gasto, transferencia).
// Fuera de TransactionBits para que ese archivo solo exporte componentes
// (react-refresh) y para compartirlo con las filas de Movimientos.
// ================================================================

import type { TransactionType } from '@/types';

export function typeLabel(type: TransactionType): string {
  return type === 'income' ? 'Ingreso' : type === 'expense' ? 'Gasto' : 'Transferencia';
}

/** Clases de color de la píldora de tipo. Una transferencia va en neutro. */
export function typePillClasses(type: TransactionType): string {
  if (type === 'income') return 'bg-income-50 dark:bg-income-950 text-income-700 dark:text-income-400';
  if (type === 'expense') return 'bg-expense-50 dark:bg-expense-950 text-expense-700 dark:text-expense-400';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
}
