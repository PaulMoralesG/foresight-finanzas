// ================================================================
// TESTS — hooks/useFinance.ts: KPIs del mes (Resumen)
// Un pago de deuda no es gasto: no entra en «gastos del mes».
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMonthlyData } from '@/hooks/useFinance';
import { useFinanceStore } from '@/stores/financeStore';
import type { Transaction } from '@/types';

let n = 0;
const mov = (o: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100,
  concept: '',
  date: '2026-08-10',
  category: 'comida',
  method: 'card',
  businessType: 'personal',
  updated_at: '2026-08-10T00:00:00.000Z',
  ...o,
});

beforeEach(() => {
  n = 0;
  useFinanceStore.getState().reset();
  useFinanceStore.setState({ currentViewDate: new Date(2026, 7, 15).toISOString() });
});

describe('useMonthlyData', () => {
  it('los gastos del mes excluyen los pagos de deuda (expense o transfer con debtId)', () => {
    useFinanceStore.setState({
      expenses: [
        mov({ type: 'income', amount: 1000 }),
        mov({ amount: 80 }),
        mov({ amount: 200, category: 'pago-tarjetas', debtId: 'd1' }),
        mov({ type: 'transfer', amount: 300, category: 'transferencia', debtId: 'd1', accountId: 'a1', toAccountId: null }),
      ],
    });
    const { result } = renderHook(() => useMonthlyData());
    expect(result.current.summary.totalSpent).toBe(80);
    expect(result.current.summary.available).toBe(920);
    // Siguen siendo movimientos del mes: se listan.
    expect(result.current.monthlyData).toHaveLength(4);
  });

  it('el gasto de negocio con debtId no reduce la utilidad', () => {
    useFinanceStore.setState({
      expenses: [
        mov({ type: 'income', amount: 500, businessType: 'business' }),
        mov({ amount: 50, businessType: 'business' }),
        mov({ amount: 150, businessType: 'business', debtId: 'd1' }),
      ],
    });
    const { result } = renderHook(() => useMonthlyData());
    expect(result.current.summary.businessSpent).toBe(50);
    expect(result.current.summary.businessProfit).toBe(450);
  });
});
