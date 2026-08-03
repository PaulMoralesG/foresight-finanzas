// ================================================================
// useFinance - Hook para acceder al store financiero
// Re-exporta selectores comunes para facilitar consumo
// ================================================================

import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { safeParseDate } from '@/lib/utils';
import type { Transaction } from '@/types';

interface MonthlySummary {
  totalIncome: number;
  totalSpent: number;
  available: number;
  businessIncome: number;
  businessSpent: number;
  businessProfit: number;
  profitMargin: number;
}

export function useMonthlyData(): {
  monthlyData: Transaction[];
  summary: MonthlySummary;
  previousBusinessIncome: number;
} {
  const getMonthlyData = useFinanceStore((s) => s.getMonthlyData);
  const expenses = useFinanceStore((s) => s.expenses);
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);

  return useMemo(() => {
    // getMonthlyData() ya hace el dedup: oculta templates solo si existe copia en el mismo mes
    const monthlyData = getMonthlyData();

    const incomeItems = monthlyData.filter((i) => i.type === 'income');
    const expenseItems = monthlyData.filter((i) => i.type === 'expense');

    const totalIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
    const totalSpent = expenseItems.reduce((s, i) => s + i.amount, 0);
    const available = totalIncome - totalSpent;

    const businessIncomeItems = incomeItems.filter(
      (i) => i.businessType === 'business'
    );
    const businessExpenseItems = expenseItems.filter(
      (i) => i.businessType === 'business'
    );
    const businessIncome = businessIncomeItems.reduce((s, i) => s + i.amount, 0);
    const businessSpent = businessExpenseItems.reduce((s, i) => s + i.amount, 0);
    const businessProfit = businessIncome - businessSpent;
    const profitMargin = businessIncome > 0 ? (businessProfit / businessIncome) * 100 : 0;

    // Ingresos de negocio del mes anterior
    const d = new Date(currentViewDate);
    const prevDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevMonth = prevDate.getMonth();
    const prevYear = prevDate.getFullYear();
    const previousBusinessIncome = expenses
      .filter((item) => {
        const id = safeParseDate(item.date);
        return (
          id.getMonth() === prevMonth &&
          id.getFullYear() === prevYear &&
          item.type === 'income' &&
          item.businessType === 'business'
        );
      })
      .reduce((s, i) => s + i.amount, 0);

    return {
      monthlyData,
      summary: { totalIncome, totalSpent, available, businessIncome, businessSpent, businessProfit, profitMargin },
      previousBusinessIncome,
    };
  }, [getMonthlyData, expenses, currentViewDate]);
}
