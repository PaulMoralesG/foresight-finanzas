// ================================================================
// SAVINGS — Agrupación de gastos de ahorro por concepto
// ================================================================

import { roundMoney, safeParseDate } from '@/lib/utils';
import type { Transaction } from '@/types';

/**
 * Suma los gastos con categoría 'ahorro' agrupados por concepto.
 * @param month {year, month} opcional — si se omite, suma todo el histórico.
 * Concepto vacío → 'Sin concepto'.
 */
export function computeSavingsByConcept(
  expenses: Transaction[],
  month?: { year: number; month: number },
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.type !== 'expense' || e.category !== 'ahorro') continue;
    if (month) {
      const d = safeParseDate(e.date);
      if (d.getMonth() !== month.month || d.getFullYear() !== month.year) continue;
    }
    const concept = e.concept.trim() || 'Sin concepto';
    map.set(concept, roundMoney((map.get(concept) || 0) + e.amount));
  }
  return map;
}

/** Total ahorrado por concepto para una meta puntual (match por nombre, case-insensitive). */
export function savingsForGoal(
  savingsByConcept: Map<string, number>,
  goalConcept: string,
): number {
  const target = goalConcept.trim().toLowerCase();
  let total = 0;
  for (const [concept, saved] of savingsByConcept) {
    if (concept.trim().toLowerCase() === target) total += saved;
  }
  return roundMoney(total);
}
