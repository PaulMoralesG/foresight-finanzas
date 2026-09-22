// ================================================================
// useFinance - Hook para acceder al store financiero
// Re-exporta selectores comunes para facilitar consumo
// ================================================================

import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { useExpensesEnAmbito } from '@/hooks/useAmbito';
import { filtrarPorAmbito } from '@/lib/ambito';
import { safeParseDate, roundMoney } from '@/lib/utils';
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
  const ambito = useFinanceStore((s) => s.ambito);
  const expenses = useExpensesEnAmbito();
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);

  return useMemo(() => {
    const monthlyData = filtrarPorAmbito(getMonthlyData(), ambito, (t) => t.businessType);

    const incomeItems = monthlyData.filter((i) => i.type === 'income');
    const expenseItems = monthlyData.filter((i) => i.type === 'expense');

    const totalIncome = roundMoney(incomeItems.reduce((s, i) => s + i.amount, 0));
    const totalSpent = roundMoney(expenseItems.reduce((s, i) => s + i.amount, 0));
    const available = roundMoney(totalIncome - totalSpent);

    const businessIncomeItems = incomeItems.filter(
      (i) => i.businessType === 'business'
    );
    const businessExpenseItems = expenseItems.filter(
      (i) => i.businessType === 'business'
    );
    const businessIncome = roundMoney(businessIncomeItems.reduce((s, i) => s + i.amount, 0));
    const businessSpent = roundMoney(businessExpenseItems.reduce((s, i) => s + i.amount, 0));
    const businessProfit = roundMoney(businessIncome - businessSpent);
    const profitMargin = businessIncome > 0 ? roundMoney((businessProfit / businessIncome) * 100) : 0;

    // Ingresos de negocio del mes anterior
    const d = new Date(currentViewDate);
    const prevDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevMonth = prevDate.getMonth();
    const prevYear = prevDate.getFullYear();
    const previousBusinessIncome = roundMoney(expenses
      .filter((item) => {
        const id = safeParseDate(item.date);
        return (
          id.getMonth() === prevMonth &&
          id.getFullYear() === prevYear &&
          item.type === 'income' &&
          item.businessType === 'business'
        );
      })
      .reduce((s, i) => s + i.amount, 0));

    return {
      monthlyData,
      summary: { totalIncome, totalSpent, available, businessIncome, businessSpent, businessProfit, profitMargin },
      previousBusinessIncome,
    };
  }, [getMonthlyData, expenses, currentViewDate, ambito]);
}
