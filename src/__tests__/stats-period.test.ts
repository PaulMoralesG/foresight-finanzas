// ================================================================
// TESTS — src/hooks/useStatsPeriod.ts
// Las derivaciones de periodo, ahora sin montar la página.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStatsPeriod, pctChange, type PeriodoStats } from '@/hooks/useStatsPeriod';
import { useFinanceStore } from '@/stores/financeStore';
import type { Transaction } from '@/types';

let n = 0;
function tx(overrides: Partial<Transaction> = {}): Transaction {
  n += 1;
  return {
    id: `t${n}`,
    type: 'expense',
    amount: 100,
    concept: `Mov ${n}`,
    date: '2026-08-15',
    category: 'comida',
    method: 'cash',
    businessType: 'personal',
    created_at: '2026-08-15T10:00:00.000Z',
    updated_at: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

const AGOSTO: PeriodoStats = {
  mode: 'month',
  month: 7,
  year: 2026,
  fromDate: null,
  toDate: null,
};

function conGastos(expenses: Transaction[], periodo: PeriodoStats = AGOSTO) {
  useFinanceStore.setState({ expenses });
  return renderHook(() => useStatsPeriod(periodo)).result;
}

beforeEach(() => {
  n = 0;
  useFinanceStore.setState({ expenses: [] });
});

describe('totales del periodo', () => {
  it('suma solo lo que cae dentro del mes', () => {
    const { current } = conGastos([
      tx({ type: 'income', amount: 1000, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 400, date: '2026-08-20' }),
      tx({ type: 'expense', amount: 999, date: '2026-07-31' }),
      tx({ type: 'expense', amount: 888, date: '2026-09-01' }),
    ]);

    expect(current.totals).toMatchObject({ income: 1000, spent: 400, balance: 600, count: 2 });
  });

  it('incluye los bordes del mes: día 1 y último día', () => {
    const { current } = conGastos([
      tx({ type: 'expense', amount: 10, date: '2026-08-01' }),
      tx({ type: 'expense', amount: 20, date: '2026-08-31' }),
    ]);
    expect(current.totals.spent).toBe(30);
    expect(current.totals.count).toBe(2);
  });

  it('separa el resultado de negocio del personal', () => {
    const { current } = conGastos([
      tx({ type: 'income', amount: 2000, businessType: 'business', date: '2026-08-02' }),
      tx({ type: 'expense', amount: 500, businessType: 'business', date: '2026-08-03' }),
      tx({ type: 'expense', amount: 300, businessType: 'personal', date: '2026-08-04' }),
    ]);
    expect(current.totals.businessProfit).toBe(1500);
    expect(current.totals.spent).toBe(800);
  });

  it('redondea a centavos en vez de arrastrar el float', () => {
    const { current } = conGastos([
      tx({ type: 'expense', amount: 0.1, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 0.2, date: '2026-08-06' }),
    ]);
    expect(current.totals.spent).toBe(0.3);
  });
});

describe('modo rango', () => {
  const rango: PeriodoStats = {
    mode: 'range',
    month: 7,
    year: 2026,
    fromDate: '2026-08-10',
    toDate: '2026-08-20',
  };

  it('incluye los dos extremos del rango', () => {
    const { current } = conGastos(
      [
        tx({ amount: 10, date: '2026-08-09' }),
        tx({ amount: 20, date: '2026-08-10' }),
        tx({ amount: 30, date: '2026-08-20' }),
        tx({ amount: 40, date: '2026-08-21' }),
      ],
      rango,
    );
    expect(current.totals.spent).toBe(50);
    expect(current.totals.count).toBe(2);
  });

  it('cruza el límite de mes sin perder nada', () => {
    const { current } = conGastos(
      [
        tx({ amount: 100, date: '2026-07-28' }),
        tx({ amount: 200, date: '2026-08-03' }),
      ],
      { mode: 'range', month: 7, year: 2026, fromDate: '2026-07-25', toDate: '2026-08-05' },
    );
    expect(current.totals.spent).toBe(300);
  });
});

describe('comparación con el periodo anterior', () => {
  it('en modo mes compara contra el mes previo', () => {
    const { current } = conGastos([
      tx({ type: 'income', amount: 1500, date: '2026-08-10' }),
      tx({ type: 'income', amount: 1000, date: '2026-07-10' }),
    ]);
    expect(current.totals.income).toBe(1500);
    expect(current.prevTotals.income).toBe(1000);
  });

  it('en enero el mes previo es diciembre del año anterior', () => {
    const { current } = conGastos(
      [tx({ type: 'income', amount: 700, date: '2025-12-15' })],
      { mode: 'month', month: 0, year: 2026, fromDate: null, toDate: null },
    );
    expect(current.prevTotals.income).toBe(700);
  });
});

describe('pctChange', () => {
  it('formatea la variación con signo', () => {
    expect(pctChange(150, 100)).toBe('+50.0%');
    expect(pctChange(50, 100)).toBe('-50.0%');
  });

  it('sin periodo anterior no inventa una comparación', () => {
    expect(pctChange(0, 0)).toBe('—');
    expect(pctChange(100, 0)).toBe('+100%');
  });
});

describe('desglose y extremos', () => {
  it('agrupa gastos por categoría, de mayor a menor', () => {
    const { current } = conGastos([
      tx({ amount: 100, category: 'comida', date: '2026-08-05' }),
      tx({ amount: 250, category: 'transporte', date: '2026-08-06' }),
      tx({ amount: 50, category: 'comida', date: '2026-08-07' }),
      tx({ type: 'income', amount: 900, category: 'ventas', date: '2026-08-08' }),
    ]);
    expect(current.expensesByCategory).toEqual([
      ['transporte', 250],
      ['comida', 150],
    ]);
    expect(current.maxAmount).toBe(250);
  });

  it('encuentra el gasto individual más grande', () => {
    const { current } = conGastos([
      tx({ amount: 100, concept: 'Chico', date: '2026-08-05' }),
      tx({ amount: 900, concept: 'Grande', date: '2026-08-06' }),
      tx({ type: 'income', amount: 5000, date: '2026-08-07' }),
    ]);
    expect(current.largestExpense?.concept).toBe('Grande');
  });

  it('encuentra el día de mayor gasto acumulado, no la mayor transacción', () => {
    const { current } = conGastos([
      tx({ amount: 400, date: '2026-08-05' }),
      tx({ amount: 300, date: '2026-08-10' }),
      tx({ amount: 300, date: '2026-08-10' }),
    ]);
    // El 10 suma 600 entre dos gastos; el 5 tiene el gasto más grande pero suma 400
    expect(current.peakDay).toEqual({ date: '2026-08-10', amount: 600 });
    expect(current.peakDayTransactions).toHaveLength(2);
  });

  it('sin gastos no hay extremos que mostrar', () => {
    const { current } = conGastos([tx({ type: 'income', amount: 500, date: '2026-08-05' })]);
    expect(current.largestExpense).toBeNull();
    expect(current.peakDay).toBeNull();
    expect(current.peakDayTransactions).toEqual([]);
    expect(current.expensesByCategory).toEqual([]);
  });
});

describe('tendencia', () => {
  it('devuelve seis meses terminando en el seleccionado', () => {
    const { current } = conGastos([
      tx({ type: 'income', amount: 100, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 40, date: '2026-08-06' }),
      tx({ type: 'income', amount: 500, date: '2026-06-05' }),
    ]);

    expect(current.trendData).toHaveLength(6);
    const agosto = current.trendData[5];
    expect(agosto).toMatchObject({ month: 'Ago', Ingresos: 100, Gastos: 40, Balance: 60 });
    expect(current.trendData[3]).toMatchObject({ month: 'Jun', Ingresos: 500 });
  });

  it('cruza el cambio de año hacia atrás', () => {
    const { current } = conGastos(
      [tx({ type: 'income', amount: 800, date: '2025-11-15' })],
      { mode: 'month', month: 1, year: 2026, fromDate: null, toDate: null },
    );
    // Febrero 2026 hacia atrás: Sep, Oct, Nov, Dic (2025), Ene, Feb (2026)
    expect(current.trendData.map((p) => p.month)).toEqual(['Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb']);
    expect(current.trendData[2].Ingresos).toBe(800);
  });
});
