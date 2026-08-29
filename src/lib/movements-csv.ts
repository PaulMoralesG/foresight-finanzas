// ================================================================
// EXPORTACIÓN CSV DE MOVIMIENTOS — formato único
//
// Existían dos generadores para la misma función y no coincidían:
// StatsPage emitía `Fecha, Tipo, Categoría, Negocio/Personal, Monto,
// Concepto` con la fecha en es-ES y el importe firmado; ReportModal emitía
// `Fecha, Tipo, Categoría, Concepto, Monto, Ámbito, Método` con la fecha en
// ISO y el importe sin signo. Distinto orden, distinto formato y distinto
// convenio de signo, según el botón que pulsara el usuario.
//
// Decisiones de este formato:
//  · Fecha en ISO (YYYY-MM-DD): es la única que ninguna hoja de cálculo puede
//    confundir con mm/dd, y ordena bien como texto.
//  · Importe firmado y en la última columna: así la columna se puede sumar
//    directamente y el total es el saldo del periodo.
//  · Se incluye el método de pago, que solo estaba en una de las dos.
// ================================================================

import { getCategoryById } from '@/config/categories';
import { roundMoney, sortByDateAsc, toCsv } from '@/lib/utils';
import type { Category, PaymentMethod, Transaction } from '@/types';

export const CSV_HEADERS = [
  'Fecha',
  'Tipo',
  'Ámbito',
  'Categoría',
  'Concepto',
  'Método',
  'Monto',
] as const;

const METODOS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
};

/** Una fila por movimiento, en el orden de CSV_HEADERS. */
export function movementsToRows(
  movements: Transaction[],
  customCategories: Category[],
): string[][] {
  // Cronológico: el orden del store es por última edición (el pull del sync
  // trae `order by updated_at`), así que sin esto el archivo sale con días y
  // meses entremezclados.
  return sortByDateAsc(movements).map((tx) => {
    const monto = tx.type === 'income' ? tx.amount : -tx.amount;
    return [
      tx.date.slice(0, 10),
      tx.type === 'income' ? 'Ingreso' : 'Gasto',
      // businessType ausente cuenta como Negocio, igual que en el resto de la app
      tx.businessType === 'personal' ? 'Personal' : 'Negocio',
      // getCategoryById nunca devuelve undefined: ya trae su propio fallback
      // ("Sin categoría") para un id que ya no existe.
      getCategoryById(tx.category, customCategories).label,
      tx.concept || '',
      METODOS[tx.method] ?? METODOS.cash,
      roundMoney(monto).toFixed(2),
    ];
  });
}

/** CSV listo para descargar. `toCsv` escapa todas las celdas y añade el BOM. */
export function movementsToCsv(
  movements: Transaction[],
  customCategories: Category[],
): Blob {
  return toCsv([...CSV_HEADERS], movementsToRows(movements, customCategories));
}
