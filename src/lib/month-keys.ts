// ================================================================
// MESES — helpers de la clave 'YYYY-MM' que comparten Presupuestos,
// Cuentas y el cierre mensual del patrimonio.
// ================================================================

import { MONTH_NAMES, safeParseDate } from '@/lib/utils';

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

/** monthKey del mes que se está viendo (la fecha ISO que guarda el store) */
export function mesDeLaVista(viewDate: string): string {
  const d = new Date(viewDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** monthKey del mes actual */
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Quedarse con lo que cae en el mes de `viewDate` (la fecha que guarda el
 * store como mes en pantalla). Vive aquí y no en cada página porque el filtro
 * por mes se repetía en el store, en Movimientos y en el reporte, y bastaba
 * con que uno de los tres divergiera para que dos pantallas dieran cifras
 * distintas del mismo mes.
 */
export function filtrarPorMes<T extends { date: string }>(items: T[], viewDate: string): T[] {
  const d = new Date(viewDate);
  const mes = d.getMonth();
  const anio = d.getFullYear();
  return items.filter((item) => {
    const f = safeParseDate(item.date);
    return f.getMonth() === mes && f.getFullYear() === anio;
  });
}
