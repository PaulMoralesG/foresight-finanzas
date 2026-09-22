// ================================================================
// useAmbito — las colecciones del store ya filtradas por el ámbito global.
// Las cuentas y el patrimonio no se filtran (no tienen ámbito), igual que
// en la referencia.
// ================================================================

import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { filtrarPorAmbito } from '@/lib/ambito';
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
