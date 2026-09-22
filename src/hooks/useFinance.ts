// ================================================================
// useFinance - Hook para acceder al store financiero
// Re-exporta selectores comunes para facilitar consumo
// ================================================================

import { useMemo } from 'react';
import { useExpensesDelMesEnAmbito } from '@/hooks/useAmbito';
import { roundMoney } from '@/lib/utils';
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
} {
  const monthlyData = useExpensesDelMesEnAmbito();

  return useMemo(() => {

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

    return {
      monthlyData,
      summary: { totalIncome, totalSpent, available, businessIncome, businessSpent, businessProfit, profitMargin },
    };
  }, [monthlyData]);
}
