// ================================================================
// TESTS — src/stores/financeStore.ts
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/stores/financeStore';
import type { Transaction, Category } from '@/types';

// Helper: crear una transacción de prueba
function makeTx(overrides: Partial<Transaction> = {}): Omit<Transaction, 'id' | 'created_at' | 'updated_at'> {
  return {
    type: 'expense',
    amount: 500,
    concept: 'Supermercado',
    date: '2026-07-15',
    category: 'food',
    method: 'card',
    businessType: 'personal',
    ...overrides,
  };
}

// Helper: crear una categoría personalizada
function makeCat(overrides: Partial<Category> = {}): Category {
  return {
    id: 'custom-1',
    label: 'Freelance',
    icon: '💻',
    color: 'bg-blue-500',
    ...overrides,
  };
}

describe('financeStore', () => {
  beforeEach(() => {
    useFinanceStore.getState().reset();
  });

  // ─── Estado inicial ───────────────────────────────────────────

  it('tiene estado inicial vacío', () => {
    const s = useFinanceStore.getState();
    expect(s.expenses).toEqual([]);
    expect(s.budgets).toEqual({});
    expect(s.budgetLines).toEqual([]);
    expect(s.savingsGoals).toEqual([]);
    expect(s.tombstones).toEqual({});
    expect(s.budgetUpdatedAt).toEqual({});
    expect(s.currentFilter).toBe('all');
  });

  // ─── CRUD de transacciones ────────────────────────────────────

  it('addTransaction genera ids únicos', () => {
    const id1 = useFinanceStore.getState().addTransaction(makeTx());
    const id2 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'Gasolina' }));

    const expenses = useFinanceStore.getState().expenses;
    expect(expenses).toHaveLength(2);
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(expenses[0].id).toBe(id1);
    expect(expenses[1].id).toBe(id2);
    expect(expenses[0].concept).toBe('Supermercado');
  });

  it('addTransaction asigna created_at y updated_at', () => {
    useFinanceStore.getState().addTransaction(makeTx());
    const exp = useFinanceStore.getState().expenses[0];
    expect(exp.created_at).toBeDefined();
    expect(new Date(exp.created_at!).getTime()).toBeGreaterThan(0);
    expect(exp.updated_at).toBeDefined();
    expect(new Date(exp.updated_at).getTime()).toBeGreaterThan(0);
  });

  it('updateTransaction actualiza campos parciales', () => {
    const id = useFinanceStore.getState().addTransaction(makeTx());
    useFinanceStore.getState().updateTransaction(id, { amount: 750, concept: 'Walmart' });

    const exp = useFinanceStore.getState().expenses[0];
    expect(exp.amount).toBe(750);
    expect(exp.concept).toBe('Walmart');
    expect(exp.category).toBe('food'); // sin cambios
  });

  it('updateTransaction no afecta otros items', () => {
    const id1 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'A' }));
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'B' }));
    useFinanceStore.getState().updateTransaction(id1, { concept: 'A-mod' });

    const expenses = useFinanceStore.getState().expenses;
    expect(expenses[0].concept).toBe('A-mod');
    expect(expenses[1].concept).toBe('B');
  });

  it('deleteTransaction elimina por id y registra tombstone', () => {
    const id1 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'A' }));
    const id2 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'B' }));
    useFinanceStore.getState().deleteTransaction(id1);

    const s = useFinanceStore.getState();
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0].id).toBe(id2);
    expect(s.tombstones[id1]).toBeDefined();
    expect(s.tombstones[id2]).toBeUndefined();
  });

  it('updateTransaction limpia el tombstone del id (resurrección local)', () => {
    const id = useFinanceStore.getState().addTransaction(makeTx());
    const item = useFinanceStore.getState().expenses[0];
    useFinanceStore.getState().deleteTransaction(id);
    expect(useFinanceStore.getState().tombstones[id]).toBeDefined();

    // Undo (restore) y luego update → el tombstone debe limpiarse
    useFinanceStore.getState().restoreTransactions([item]);
    useFinanceStore.getState().updateTransaction(id, { concept: 'X' });
    expect(useFinanceStore.getState().tombstones[id]).toBeUndefined();
    expect(useFinanceStore.getState().expenses[0].concept).toBe('X');
  });

  it('deleteTransactions elimina múltiples ids', () => {
    const id1 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'A' }));
    const id2 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'B' }));
    const id3 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'C' }));
    useFinanceStore.getState().deleteTransactions([id1, id3]);

    const s = useFinanceStore.getState();
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0].id).toBe(id2);
    expect(s.tombstones[id1]).toBeDefined();
    expect(s.tombstones[id3]).toBeDefined();
  });

  it('restoreTransactions restaura items conservando ids y tombstones limpios', () => {
    const id1 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'A' }));
    const id2 = useFinanceStore.getState().addTransaction(makeTx({ concept: 'B' }));
    const deleted = useFinanceStore.getState().expenses.filter((e) => e.id === id1 || e.id === id2);
    useFinanceStore.getState().deleteTransactions([id1, id2]);
    expect(useFinanceStore.getState().expenses).toHaveLength(0);

    useFinanceStore.getState().restoreTransactions(deleted);

    const s = useFinanceStore.getState();
    expect(s.expenses).toHaveLength(2);
    expect(s.expenses.map((e) => e.id).sort()).toEqual([id1, id2].sort());
    expect(s.tombstones[id1]).toBeUndefined();
    expect(s.tombstones[id2]).toBeUndefined();
  });

  // ─── Navegación de mes ────────────────────────────────────────

  it('setViewDate avanza y retrocede meses', () => {
    const initial = new Date(useFinanceStore.getState().currentViewDate);
    const initialMonth = initial.getMonth();
    const initialYear = initial.getFullYear();

    // Avanzar 1 mes
    useFinanceStore.getState().setViewDate(1);
    const next = new Date(useFinanceStore.getState().currentViewDate);
    expect(next.getMonth()).toBe((initialMonth + 1) % 12);

    // Retroceder 1 mes (volver al original)
    useFinanceStore.getState().setViewDate(-1);
    const back = new Date(useFinanceStore.getState().currentViewDate);
    expect(back.getMonth()).toBe(initialMonth);
    expect(back.getFullYear()).toBe(initialYear);
  });

  it('setFilter cambia el filtro activo', () => {
    useFinanceStore.getState().setFilter('income');
    expect(useFinanceStore.getState().currentFilter).toBe('income');
  });

  // ─── getMonthlyData ───────────────────────────────────────────

  it('getMonthlyData filtra por mes actual', () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;

    useFinanceStore.getState().addTransaction(makeTx({ date: thisMonth, concept: 'Este mes' }));
    useFinanceStore.getState().addTransaction(makeTx({
      date: '2020-01-15',
      concept: 'Año pasado',
    }));

    const monthly = useFinanceStore.getState().getMonthlyData();
    expect(monthly).toHaveLength(1);
    expect(monthly[0].concept).toBe('Este mes');
  });

  // ─── Categorías personalizadas ────────────────────────────────

  it('addCustomCategory agrega categoría de gasto', () => {
    useFinanceStore.getState().addCustomCategory('expense', makeCat({ id: 'cat-1', label: 'Mascotas' }));
    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(1);
    expect(useFinanceStore.getState().customExpenseCategories[0].label).toBe('Mascotas');
    expect(useFinanceStore.getState().customExpenseCategories[0].updated_at).toBeDefined();
  });

  it('addCustomCategory agrega categoría de ingreso', () => {
    useFinanceStore.getState().addCustomCategory('income', makeCat({ id: 'cat-2', label: 'Freelance' }));
    expect(useFinanceStore.getState().customIncomeCategories).toHaveLength(1);
  });

  it('deleteCustomCategory elimina categoría por id y registra tombstone', () => {
    useFinanceStore.getState().addCustomCategory('expense', makeCat({ id: 'cat-x' }));
    useFinanceStore.getState().deleteCustomCategory('expense', 'cat-x');
    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(0);
    expect(useFinanceStore.getState().tombstones['cat-x']).toBeDefined();
  });

  it('updateCustomCategory actualiza y limpia tombstone', () => {
    useFinanceStore.getState().addCustomCategory('expense', makeCat({ id: 'cat-x' }));
    useFinanceStore.getState().deleteCustomCategory('expense', 'cat-x');
    useFinanceStore.getState().addCustomCategory('expense', makeCat({ id: 'cat-x' }));
    expect(useFinanceStore.getState().tombstones['cat-x']).toBeUndefined();
  });

  // ─── Metas de ahorro ──────────────────────────────────────────

  it('addSavingsGoal agrega meta con id y updated_at', () => {
    const id = useFinanceStore.getState().addSavingsGoal({ concept: 'Casa', target: 100000 });
    const goals = useFinanceStore.getState().savingsGoals;
    expect(goals).toHaveLength(1);
    expect(goals[0].id).toBe(id);
    expect(goals[0].concept).toBe('Casa');
    expect(goals[0].target).toBe(100000);
    expect(goals[0].updated_at).toBeDefined();
  });

  it('updateSavingsGoal actualiza campos parciales', () => {
    const id = useFinanceStore.getState().addSavingsGoal({ concept: 'Casa', target: 100000 });
    useFinanceStore.getState().updateSavingsGoal(id, { target: 150000 });
    expect(useFinanceStore.getState().savingsGoals[0].target).toBe(150000);
    expect(useFinanceStore.getState().savingsGoals[0].concept).toBe('Casa');
  });

  it('deleteSavingsGoal elimina y registra tombstone', () => {
    const id = useFinanceStore.getState().addSavingsGoal({ concept: 'Casa', target: 100000 });
    useFinanceStore.getState().deleteSavingsGoal(id);
    expect(useFinanceStore.getState().savingsGoals).toHaveLength(0);
    expect(useFinanceStore.getState().tombstones[id]).toBeDefined();
  });

  // ─── Reset ────────────────────────────────────────────────────

  it('reset limpia todo el estado', () => {
    useFinanceStore.getState().addTransaction(makeTx());
    useFinanceStore.getState().addBudgetLine({ tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 5000, plan: {} });
    useFinanceStore.getState().addCustomCategory('expense', makeCat());
    useFinanceStore.getState().addSavingsGoal({ concept: 'Casa', target: 100000 });
    useFinanceStore.getState().setFilter('income');

    useFinanceStore.getState().reset();

    const s = useFinanceStore.getState();
    expect(s.expenses).toEqual([]);
    expect(s.budgets).toEqual({});
    expect(s.budgetLines).toEqual([]);
    expect(s.customExpenseCategories).toEqual([]);
    expect(s.savingsGoals).toEqual([]);
    expect(s.tombstones).toEqual({});
    expect(s.budgetUpdatedAt).toEqual({});
    expect(s.currentFilter).toBe('all');
  });
});
