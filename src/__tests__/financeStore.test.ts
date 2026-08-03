// ================================================================
// TESTS — src/stores/financeStore.ts
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/stores/financeStore';
import type { Transaction, Category } from '@/types';

// Helper: crear una transacción de prueba
function makeTx(overrides: Partial<Transaction> = {}): Omit<Transaction, 'id' | 'created_at'> {
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
    expect(s.reminders).toEqual([]);
    expect(s.currentFilter).toBe('all');
    expect(s.nextId).toBe(1);
    expect(s.nextReminderId).toBe(1);
  });

  // ─── CRUD de transacciones ────────────────────────────────────

  it('addTransaction agrega y auto-incrementa id', () => {
    useFinanceStore.getState().addTransaction(makeTx());
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'Gasolina' }));

    const expenses = useFinanceStore.getState().expenses;
    expect(expenses).toHaveLength(2);
    expect(expenses[0].id).toBe(1);
    expect(expenses[1].id).toBe(2);
    expect(expenses[0].concept).toBe('Supermercado');
  });

  it('addTransaction asigna created_at', () => {
    useFinanceStore.getState().addTransaction(makeTx());
    const exp = useFinanceStore.getState().expenses[0];
    expect(exp.created_at).toBeDefined();
    expect(new Date(exp.created_at!).getTime()).toBeGreaterThan(0);
  });

  it('updateTransaction actualiza campos parciales', () => {
    useFinanceStore.getState().addTransaction(makeTx());
    useFinanceStore.getState().updateTransaction(1, { amount: 750, concept: 'Walmart' });

    const exp = useFinanceStore.getState().expenses[0];
    expect(exp.amount).toBe(750);
    expect(exp.concept).toBe('Walmart');
    expect(exp.category).toBe('food'); // sin cambios
  });

  it('updateTransaction no afecta otros items', () => {
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'A' }));
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'B' }));
    useFinanceStore.getState().updateTransaction(1, { concept: 'A-mod' });

    const expenses = useFinanceStore.getState().expenses;
    expect(expenses[0].concept).toBe('A-mod');
    expect(expenses[1].concept).toBe('B');
  });

  it('deleteTransaction elimina por id', () => {
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'A' }));
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'B' }));
    useFinanceStore.getState().deleteTransaction(1);

    const expenses = useFinanceStore.getState().expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0].id).toBe(2);
  });

  it('deleteTransactions elimina múltiples ids', () => {
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'A' }));
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'B' }));
    useFinanceStore.getState().addTransaction(makeTx({ concept: 'C' }));
    useFinanceStore.getState().deleteTransactions([1, 3]);

    const expenses = useFinanceStore.getState().expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0].id).toBe(2);
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

  // ─── Presupuestos ─────────────────────────────────────────────

  it('setBudget guarda presupuesto mensual', () => {
    useFinanceStore.getState().setBudget('2026-07', 10000);
    expect(useFinanceStore.getState().budgets['2026-07']).toBe(10000);
  });

  it('setBudget sobreescribe y no borra otras keys', () => {
    useFinanceStore.getState().setBudget('2026-07', 5000);
    useFinanceStore.getState().setBudget('2026-08', 8000);
    useFinanceStore.getState().setBudget('2026-07', 6000);

    const budgets = useFinanceStore.getState().budgets;
    expect(budgets['2026-07']).toBe(6000);
    expect(budgets['2026-08']).toBe(8000);
  });

  // ─── Recordatorios de pago ────────────────────────────────────

  it('addReminder agrega recordatorio con isPaid=false', () => {
    useFinanceStore.getState().addReminder({
      concept: 'Renta',
      amount: 8000,
      dueDate: '2026-08-01',
      category: 'rent',
      businessType: 'personal',
      method: 'transfer',
    });

    const reminders = useFinanceStore.getState().reminders;
    expect(reminders).toHaveLength(1);
    expect(reminders[0].concept).toBe('Renta');
    expect(reminders[0].isPaid).toBe(false);
    expect(reminders[0].id).toBe(1);
  });

  it('toggleReminderPaid alterna isPaid', () => {
    useFinanceStore.getState().addReminder({
      concept: 'Renta',
      amount: 8000,
      dueDate: '2026-08-01',
      category: 'rent',
      businessType: 'personal',
      method: 'transfer',
    });
    useFinanceStore.getState().toggleReminderPaid(1);
    expect(useFinanceStore.getState().reminders[0].isPaid).toBe(true);

    useFinanceStore.getState().toggleReminderPaid(1);
    expect(useFinanceStore.getState().reminders[0].isPaid).toBe(false);
  });

  it('deleteReminder elimina recordatorio', () => {
    useFinanceStore.getState().addReminder({
      concept: 'Renta',
      amount: 8000,
      dueDate: '2026-08-01',
      category: 'rent',
      businessType: 'personal',
      method: 'transfer',
    });
    useFinanceStore.getState().deleteReminder(1);
    expect(useFinanceStore.getState().reminders).toHaveLength(0);
  });

  it('updateReminder actualiza campos de recordatorio', () => {
    useFinanceStore.getState().addReminder({
      concept: 'Renta',
      amount: 8000,
      dueDate: '2026-08-01',
      category: 'rent',
      businessType: 'personal',
      method: 'transfer',
    });
    useFinanceStore.getState().updateReminder(1, { amount: 9000, notes: 'Subió' });
    const r = useFinanceStore.getState().reminders[0];
    expect(r.amount).toBe(9000);
    expect(r.notes).toBe('Subió');
  });

  it('getUpcomingReminders filtra pagados y fechas > 30 días', () => {
    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);
    const in60Days = new Date(today);
    in60Days.setDate(today.getDate() + 60);

    useFinanceStore.getState().addReminder({
      concept: 'Próximo',
      amount: 1000,
      dueDate: in7Days.toISOString().substring(0, 10),
      category: 'rent',
      businessType: 'personal',
      method: 'transfer',
    });
    useFinanceStore.getState().addReminder({
      concept: 'Lejano',
      amount: 2000,
      dueDate: in60Days.toISOString().substring(0, 10),
      category: 'rent',
      businessType: 'personal',
      method: 'transfer',
    });

    const upcoming = useFinanceStore.getState().getUpcomingReminders();
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].concept).toBe('Próximo');
  });

  // ─── Categorías personalizadas ────────────────────────────────

  it('addCustomCategory agrega categoría de gasto', () => {
    useFinanceStore.getState().addCustomCategory('expense', makeCat({ id: 'cat-1', label: 'Mascotas' }));
    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(1);
    expect(useFinanceStore.getState().customExpenseCategories[0].label).toBe('Mascotas');
  });

  it('addCustomCategory agrega categoría de ingreso', () => {
    useFinanceStore.getState().addCustomCategory('income', makeCat({ id: 'cat-2', label: 'Freelance' }));
    expect(useFinanceStore.getState().customIncomeCategories).toHaveLength(1);
  });

  it('deleteCustomCategory elimina categoría por id', () => {
    useFinanceStore.getState().addCustomCategory('expense', makeCat({ id: 'cat-x' }));
    useFinanceStore.getState().deleteCustomCategory('expense', 'cat-x');
    expect(useFinanceStore.getState().customExpenseCategories).toHaveLength(0);
  });

  // ─── Reset ────────────────────────────────────────────────────

  it('reset limpia todo el estado', () => {
    useFinanceStore.getState().addTransaction(makeTx());
    useFinanceStore.getState().setBudget('2026-07', 5000);
    useFinanceStore.getState().addCustomCategory('expense', makeCat());
    useFinanceStore.getState().setFilter('income');

    useFinanceStore.getState().reset();

    const s = useFinanceStore.getState();
    expect(s.expenses).toEqual([]);
    expect(s.budgets).toEqual({});
    expect(s.customExpenseCategories).toEqual([]);
    expect(s.currentFilter).toBe('all');
    expect(s.nextId).toBe(1);
  });
});
