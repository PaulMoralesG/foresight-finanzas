// ================================================================
// MESES — helpers de la clave 'YYYY-MM' que comparten Presupuestos,
// Cuentas y el cierre mensual del patrimonio.
// ================================================================

import { MONTH_NAMES } from '@/lib/utils';

/** Etiqueta legible de un mes YYYY-MM (ej. 'Agosto 2026') */
export function monthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Versión corta para selectores estrechos (ej. 'Sep 2026') */
export function monthKeyLabelCorto(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

/** Desplazar un monthKey por ±N meses */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** monthKey del mes actual */
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
