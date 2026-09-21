// ================================================================
// TESTS — src/hooks/useBudget.ts
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBudget, shiftMonthKey, monthKeyLabel } from '@/hooks/useBudget';
import { useFinanceStore } from '@/stores/financeStore';
import type { Transaction } from '@/types';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'uuid-1',
    type: 'expense',
    amount: 100,
    concept: 'Compra',
    date: '2026-08-15',
    category: 'comida',
    method: 'cash',
    businessType: 'personal',
    updated_at: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('useBudget', () => {
  beforeEach(() => {
    useFinanceStore.setState({ budgets: {}, budgetUpdatedAt: {}, expenses: [] });
  });

  it('cuenta el gasto del día 1 en su propio mes, no en el anterior', () => {
    // `new Date('2026-08-01')` parsea como UTC: en cualquier zona con offset
    // negativo eso es el 31 de julio y el gasto se contaba en el mes previo.
    useFinanceStore.setState({
      budgets: { '2026-08': 1000 },
      expenses: [tx({ id: 'a', amount: 250, date: '2026-08-01' })],
    });

    const { result } = renderHook(() => useBudget('2026-08'));
    expect(result.current.monthSpent).toBe(250);

    const previo = renderHook(() => useBudget('2026-07'));
    expect(previo.result.current.monthSpent).toBe(0);
  });

  it('cuenta el gasto del último día en su propio mes', () => {
    useFinanceStore.setState({
      expenses: [tx({ id: 'a', amount: 80, date: '2026-08-31' })],
    });
    expect(renderHook(() => useBudget('2026-08')).result.current.monthSpent).toBe(80);
    expect(renderHook(() => useBudget('2026-09')).result.current.monthSpent).toBe(0);
  });

  it('un presupuesto de 0 es "sin presupuesto", no hereda el mes anterior', () => {
    useFinanceStore.setState({ budgets: { '2026-07': 5000, '2026-08': 0 } });

    const { result } = renderHook(() => useBudget('2026-08'));
    expect(result.current.budget).toBe(0);
    expect(result.current.isCarriedOver).toBe(false);
    expect(result.current.carriedFrom).toBeNull();
  });

  it('hereda el presupuesto del mes anterior cuando el mes no tiene clave propia', () => {
    useFinanceStore.setState({ budgets: { '2026-07': 5000 } });

    const { result } = renderHook(() => useBudget('2026-08'));
    expect(result.current.budget).toBe(5000);
    expect(result.current.isCarriedOver).toBe(true);
    expect(result.current.carriedFrom).toBe('2026-07');
  });

  it('el presupuesto propio gana sobre el heredable', () => {
    useFinanceStore.setState({ budgets: { '2026-07': 5000, '2026-08': 2000 } });

    const { result } = renderHook(() => useBudget('2026-08'));
    expect(result.current.budget).toBe(2000);
    expect(result.current.isCarriedOver).toBe(false);
  });

  it('solo suma gastos, no ingresos', () => {
    useFinanceStore.setState({
      budgets: { '2026-08': 1000 },
      expenses: [
        tx({ id: 'a', amount: 300, date: '2026-08-10' }),
        tx({ id: 'b', amount: 900, date: '2026-08-10', type: 'income' }),
      ],
    });
    expect(renderHook(() => useBudget('2026-08')).result.current.monthSpent).toBe(300);
  });

  it('redondea el gasto acumulado a centavos', () => {
    useFinanceStore.setState({
      expenses: [
        tx({ id: 'a', amount: 0.1, date: '2026-08-05' }),
        tx({ id: 'b', amount: 0.2, date: '2026-08-06' }),
      ],
    });
    expect(renderHook(() => useBudget('2026-08')).result.current.monthSpent).toBe(0.3);
  });

  it('pct sin presupuesto es 0, no NaN ni Infinity', () => {
    useFinanceStore.setState({
      expenses: [tx({ id: 'a', amount: 500, date: '2026-08-05' })],
    });
    const { result } = renderHook(() => useBudget('2026-08'));
    expect(result.current.pct).toBe(0);
    expect(result.current.message).toBe('Define tu presupuesto');
  });
});

describe('shiftMonthKey', () => {
  it('cruza el límite de año en ambos sentidos', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-08', 0)).toBe('2026-08');
  });
});

describe('monthKeyLabel', () => {
  it('formatea el mes en español, nombre completo (mismo formato que MonthNav)', () => {
    expect(monthKeyLabel('2026-08')).toBe('Agosto 2026');
    expect(monthKeyLabel('2026-01')).toBe('Enero 2026');
  });
});
