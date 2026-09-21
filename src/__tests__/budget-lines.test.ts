// ================================================================
// TESTS — lib/budget-lines.ts: presupuesto por categoría
// Primero la migración del presupuesto global (nadie pierde datos), y
// después planFor, el resumen por grupo y el reporte anual.
// ================================================================

import { describe, it, expect } from 'vitest';
import {
  convertGlobalBudgets,
  planFor,
  budgetStatus,
  groupSummary,
  plannedExpenseTotal,
  annualReport,
} from '@/lib/budget-lines';
import type { BudgetLine, Transaction } from '@/types';

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
const linea = (o: Partial<BudgetLine>): BudgetLine => ({
  id: `b${++n}`,
  tag: 'personal',
  kind: 'expense',
  categoryId: 'comida',
  limit: 500,
  plan: {},
  updated_at: '2026-08-01T00:00:00.000Z',
  ...o,
});

describe('convertGlobalBudgets (migración del presupuesto global)', () => {
  it('reparte el presupuesto de cada mes entre las categorías en proporción al gasto real', () => {
    const budgets = { '2026-08': 1000 };
    const expenses = [
      mov({ category: 'comida', amount: 300, date: '2026-08-05' }),
      mov({ category: 'transporte', amount: 100, date: '2026-08-06' }),
      mov({ category: 'comida', amount: 999, date: '2026-07-06' }), // otro mes: no cuenta
      mov({ type: 'income', category: 'sueldo', amount: 5000, date: '2026-08-01' }), // ingreso: no cuenta
    ];
    const lines = convertGlobalBudgets(budgets, expenses);
    const porCat = Object.fromEntries(lines.map((l) => [l.categoryId, l]));
    expect(Object.keys(porCat).sort()).toEqual(['comida', 'transporte']);
    expect(porCat.comida.plan['2026-08']).toBe(750); // 300/400 de 1000
    expect(porCat.transporte.plan['2026-08']).toBe(250);
    expect(lines.every((l) => l.kind === 'expense' && l.tag === 'personal')).toBe(true);
    // El límite base es el reparto del mes más reciente
    expect(porCat.comida.limit).toBe(750);
  });

  it('la suma del reparto es exactamente el presupuesto (el resto de redondeo va a la mayor)', () => {
    const budgets = { '2026-08': 100 };
    const expenses = [
      mov({ category: 'a', amount: 1, date: '2026-08-05' }),
      mov({ category: 'b', amount: 1, date: '2026-08-05' }),
      mov({ category: 'c', amount: 1, date: '2026-08-05' }),
    ];
    const lines = convertGlobalBudgets(budgets, expenses);
    const total = lines.reduce((s, l) => s + l.plan['2026-08'], 0);
    expect(total).toBe(100);
  });

  it('sin gasto en el mes, todo va a "General"', () => {
    const lines = convertGlobalBudgets({ '2026-09': 1500 }, []);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ categoryId: 'general', limit: 1500, plan: { '2026-09': 1500 } });
  });

  it('varios meses: una línea por categoría con un plan por mes', () => {
    const budgets = { '2026-07': 800, '2026-08': 1000 };
    const expenses = [
      mov({ category: 'comida', amount: 100, date: '2026-07-05' }),
      mov({ category: 'comida', amount: 100, date: '2026-08-05' }),
      mov({ category: 'ropa', amount: 100, date: '2026-08-06' }),
    ];
    const lines = convertGlobalBudgets(budgets, expenses);
    const comida = lines.find((l) => l.categoryId === 'comida')!;
    expect(comida.plan).toEqual({ '2026-07': 800, '2026-08': 500 });
    expect(comida.limit).toBe(500); // el más reciente
    const ropa = lines.find((l) => l.categoryId === 'ropa')!;
    expect(ropa.plan).toEqual({ '2026-08': 500 });
  });

  it('un mes con presupuesto 0 no genera líneas; sin presupuestos, nada', () => {
    expect(convertGlobalBudgets({ '2026-08': 0 }, [mov({})])).toEqual([]);
    expect(convertGlobalBudgets({}, [mov({})])).toEqual([]);
  });

  it('el ámbito de la línea sigue al de los movimientos de esa categoría', () => {
    const lines = convertGlobalBudgets({ '2026-08': 100 }, [mov({ category: 'ventas', businessType: 'business', date: '2026-08-05' })]);
    expect(lines[0].tag).toBe('business');
  });
});

describe('planFor y estado', () => {
  it('usa el plan del mes si existe y el límite base si no', () => {
    const l = linea({ limit: 500, plan: { '2026-12': 900 } });
    expect(planFor(l, '2026-12')).toBe(900);
    expect(planFor(l, '2026-11')).toBe(500);
  });

  it('budgetStatus: en rango < 70 %, cerca ≤ 100 %, excedido después', () => {
    expect(budgetStatus(69, 100).status).toBe('good');
    expect(budgetStatus(70, 100).status).toBe('warn');
    expect(budgetStatus(100, 100).status).toBe('warn');
    expect(budgetStatus(101, 100).status).toBe('crit');
    expect(budgetStatus(50, 0)).toMatchObject({ pct: 0, status: 'good' });
  });
});

describe('groupSummary (presupuestado vs. real por grupo)', () => {
  it('agrupa planificado y real por grupo y calcula el resultado del mes', () => {
    const lines = [
      linea({ kind: 'income', categoryId: 'sueldo', limit: 2000 }),
      linea({ kind: 'expense', categoryId: 'comida', limit: 500 }),
      linea({ kind: 'expense', categoryId: 'restaurantes', limit: 200 }),
      linea({ kind: 'expense', categoryId: 'transporte', limit: 300 }),
    ];
    const expenses = [
      mov({ type: 'income', category: 'sueldo', amount: 2100 }),
      mov({ category: 'comida', amount: 450 }),
      mov({ category: 'restaurantes', amount: 300 }),
      mov({ category: 'gasolina', amount: 50 }), // sin presupuesto, mismo grupo que transporte
    ];
    const r = groupSummary(lines, expenses, '2026-08', []);
    const ali = r.rows.find((x) => x.kind === 'expense' && x.group === 'Alimentación')!;
    expect(ali).toMatchObject({ planned: 700, actual: 750, diff: -50 }); // gasto de más
    const tra = r.rows.find((x) => x.kind === 'expense' && x.group === 'Transporte')!;
    expect(tra).toMatchObject({ planned: 300, actual: 50, diff: 250 });
    const emp = r.rows.find((x) => x.kind === 'income' && x.group === 'Empleo')!;
    expect(emp).toMatchObject({ planned: 2000, actual: 2100, diff: 100 }); // ingreso de más es bueno
    expect(r.planResult).toBe(1000); // 2000 − 1000
    expect(r.realResult).toBe(1300); // 2100 − 800
  });

  it('plannedExpenseTotal suma solo las líneas de gasto del mes', () => {
    const lines = [linea({ kind: 'income', limit: 9999 }), linea({ limit: 500 }), linea({ categoryId: 'ropa', limit: 100, plan: { '2026-08': 150 } })];
    expect(plannedExpenseTotal(lines, '2026-08')).toBe(650);
  });
});

describe('annualReport', () => {
  it('matriz categoría × 12 meses con total y promedio de los meses con movimiento', () => {
    const expenses = [
      mov({ category: 'comida', amount: 100, date: '2026-01-10' }),
      mov({ category: 'comida', amount: 300, date: '2026-03-10' }),
      mov({ category: 'comida', amount: 999, date: '2025-12-10' }), // otro año
      mov({ type: 'income', category: 'sueldo', amount: 1000, date: '2026-01-01' }),
    ];
    const r = annualReport(expenses, 2026, []);
    const comida = r.find((x) => x.kind === 'expense' && x.categoryId === 'comida')!;
    expect(comida.byMonth['2026-01']).toBe(100);
    expect(comida.byMonth['2026-03']).toBe(300);
    expect(comida.total).toBe(400);
    expect(comida.average).toBe(200); // dos meses con movimiento
    expect(r.find((x) => x.kind === 'income')!.total).toBe(1000);
  });
});
