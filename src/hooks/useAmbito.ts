// ================================================================
// useAmbito — las colecciones del store ya filtradas por el ámbito global.
// Las cuentas y el patrimonio no se filtran (no tienen ámbito), igual que
// en la referencia.
// ================================================================

import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { filtrarPorAmbito } from '@/lib/ambito';
import { filtrarPorMes } from '@/lib/month-keys';
import type { Ambito, BudgetLine, Debt, SavingsGoal, Transaction } from '@/types';

export function useAmbito(): Ambito {
  return useFinanceStore((s) => s.ambito);
}

export function useExpensesEnAmbito(): Transaction[] {
  const expenses = useFinanceStore((s) => s.expenses);
  const ambito = useAmbito();
  return useMemo(() => filtrarPorAmbito(expenses, ambito, (t) => t.businessType), [expenses, ambito]);
}

export function useBudgetLinesEnAmbito(): BudgetLine[] {
  const lines = useFinanceStore((s) => s.budgetLines);
  const ambito = useAmbito();
  return useMemo(() => filtrarPorAmbito(lines, ambito, (l) => l.tag), [lines, ambito]);
}

export function useDebtsEnAmbito(): Debt[] {
  const debts = useFinanceStore((s) => s.debts);
  const ambito = useAmbito();
  return useMemo(() => filtrarPorAmbito(debts, ambito, (d) => d.tag), [debts, ambito]);
}

export function useGoalsEnAmbito(): SavingsGoal[] {
  const goals = useFinanceStore((s) => s.savingsGoals);
  const ambito = useAmbito();
  return useMemo(() => filtrarPorAmbito(goals, ambito, (g) => g.tag), [goals, ambito]);
}

/**
 * Los movimientos del mes en pantalla, ya filtrados por el ámbito activo.
 *
 * Es la única fuente para Movimientos, el Resumen y el reporte mensual: antes
 * cada uno llamaba a `getMonthlyData()` del store, que lee `expenses` sin
 * filtrar, y el segmentado Todo/Personal/Negocio —visible en esas pantallas—
 * no surtía efecto: el Resumen decía una cifra y Movimientos otra.
 */
export function useExpensesDelMesEnAmbito(): Transaction[] {
  const expenses = useExpensesEnAmbito();
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  return useMemo(() => filtrarPorMes(expenses, currentViewDate), [expenses, currentViewDate]);
}
