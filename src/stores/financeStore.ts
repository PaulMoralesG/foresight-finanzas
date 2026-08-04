// ================================================================
// FINANCE STORE - Zustand (finanzas: transactions, budgets, view)
// ================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeParseDate } from '@/lib/utils';
import type { Transaction, MonthlyBudget, FilterType, PaymentReminder, Category, SavingsGoal } from '@/types';

interface FinanceState {
  // --- Estado ---
  expenses: Transaction[];
  budgets: MonthlyBudget;
  reminders: PaymentReminder[];
  currentViewDate: string; // ISO string para que serialize bien
  currentFilter: FilterType;
  nextId: number;
  nextReminderId: number;
  savingsGoals: SavingsGoal[];
  customExpenseCategories: Category[];
  customIncomeCategories: Category[];

  // --- Acciones de fecha y filtro ---
  setViewDate: (step: number) => void;
  setFilter: (filter: FilterType) => void;
  ensureCurrentMonth: () => void;

  // --- CRUD de transacciones ---
  addTransaction: (t: Omit<Transaction, 'id' | 'created_at'>) => void;
  updateTransaction: (id: number, partial: Partial<Transaction>) => void;
  deleteTransaction: (id: number) => void;
  deleteTransactions: (ids: number[]) => void;

  // --- Presupuestos ---
  setBudget: (monthKey: string, value: number) => void;

  // --- Recordatorios de pago ---
  addReminder: (r: Omit<PaymentReminder, 'id' | 'createdAt' | 'isPaid'>) => void;
  updateReminder: (id: number, partial: Partial<PaymentReminder>) => void;
  deleteReminder: (id: number) => void;
  toggleReminderPaid: (id: number) => void;
  getUpcomingReminders: () => PaymentReminder[];

  // --- Categorías personalizadas ---
  addCustomCategory: (type: 'expense' | 'income', category: Category) => void;
  updateCustomCategory: (type: 'expense' | 'income', id: string, updates: Partial<Category>) => void;
  deleteCustomCategory: (type: 'expense' | 'income', id: string) => void;

  // --- Selectores (getters) ---
  getMonthlyData: () => Transaction[];

  // --- Reset (logout) ---
  reset: () => void;
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      expenses: [],
      budgets: {},
      reminders: [],
      currentViewDate: new Date().toISOString(),
      currentFilter: 'all',
      nextId: 1,
      nextReminderId: 1,
      savingsGoals: [],
      customExpenseCategories: [],
      customIncomeCategories: [],

      reset: () =>
        set({
          expenses: [],
          budgets: {},
          reminders: [],
          currentViewDate: new Date().toISOString(),
          nextId: 1,
          nextReminderId: 1,
          savingsGoals: [],
          customExpenseCategories: [],
          customIncomeCategories: [],
          currentFilter: 'all',
        }),

      setViewDate: (step) => {
        const state = get();
        const d = new Date(state.currentViewDate);
        // Ir al día 1 del mes actual para evitar rollover de setMonth
        d.setDate(1);
        d.setMonth(d.getMonth() + step);
        const newViewDate = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
        set({ currentViewDate: newViewDate });
      },

      setFilter: (filter) => set({ currentFilter: filter }),

      // Auto-avanza el mes actual si la fecha guardada es de un mes anterior
      ensureCurrentMonth: () => {
        const { currentViewDate } = get();
        const stored = new Date(currentViewDate);
        const now = new Date();
        const storedMonth = stored.getFullYear() * 12 + stored.getMonth();
        const nowMonth = now.getFullYear() * 12 + now.getMonth();
        if (storedMonth < nowMonth) {
          const newDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          set({ currentViewDate: newDate });
        }
      },

      addTransaction: (t) =>
        set((state) => ({
          expenses: [
            ...state.expenses,
            { ...t, id: state.nextId, created_at: new Date().toISOString() },
          ],
          nextId: state.nextId + 1,
        })),

      updateTransaction: (id, partial) =>
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, ...partial } : e
          ),
        })),

      deleteTransaction: (id) =>
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
        })),

      deleteTransactions: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          return {
            expenses: state.expenses.filter((e) => !idSet.has(e.id)),
          };
        }),

      setBudget: (monthKey, value) =>
        set((state) => ({
          budgets: { ...state.budgets, [monthKey]: value },
        })),

      // ── Recordatorios de pago ──
      addReminder: (r) =>
        set((state) => ({
          reminders: [
            ...state.reminders,
            { ...r, id: state.nextReminderId, createdAt: new Date().toISOString(), isPaid: false },
          ],
          nextReminderId: state.nextReminderId + 1,
        })),

      updateReminder: (id, partial) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, ...partial } : r
          ),
        })),

      deleteReminder: (id) =>
        set((state) => ({
          reminders: state.reminders.filter((r) => r.id !== id),
        })),

      toggleReminderPaid: (id) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, isPaid: !r.isPaid } : r
          ),
        })),

      getUpcomingReminders: () => {
        const { reminders } = get();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return reminders
          .filter((r) => {
            if (r.isPaid) return false;
            const due = safeParseDate(r.dueDate);
            const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            return diffDays <= 30;
          })
          .sort((a, b) => safeParseDate(a.dueDate).getTime() - safeParseDate(b.dueDate).getTime());
      },

      // ── Categorías personalizadas ──
      addCustomCategory: (type, category) =>
        set((state) => {
          if (type === 'expense') {
            return { customExpenseCategories: [...state.customExpenseCategories, category] };
          }
          return { customIncomeCategories: [...state.customIncomeCategories, category] };
        }),

      updateCustomCategory: (type, id, updates) =>
        set((state) => {
          const key = type === 'expense' ? 'customExpenseCategories' as const : 'customIncomeCategories' as const;
          return {
            [key]: state[key].map((c) => (c.id === id ? { ...c, ...updates } : c)),
          } as Partial<FinanceState>;
        }),

      deleteCustomCategory: (type, id) =>
        set((state) => {
          if (type === 'expense') {
            return { customExpenseCategories: state.customExpenseCategories.filter((c) => c.id !== id) };
          }
          return { customIncomeCategories: state.customIncomeCategories.filter((c) => c.id !== id) };
        }),

      getMonthlyData: () => {
        const { expenses, currentViewDate } = get();
        const d = new Date(currentViewDate);
        const month = d.getMonth();
        const year = d.getFullYear();

        return expenses.filter((item) => {
          const id = safeParseDate(item.date);
          return id.getMonth() === month && id.getFullYear() === year;
        });
      },
    }),
    {
      name: 'foresight-finance-storage',
      version: 7,
      migrate: (persistedState: any, _version: number) => {
        const state = persistedState as any;
        // Migración v5 → v6: savingsGoal (number) → savingsGoals (array)
        // Migración v6 → v7: dedup IDs duplicados + recalcular nextId
        if (state.expenses && Array.isArray(state.expenses)) {
          // Eliminar duplicados por ID (conserva la primera ocurrencia)
          const seen = new Set<number>();
          state.expenses = state.expenses.filter((e: any) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          });
        }
        if (!Array.isArray(state.savingsGoals)) {
          state.savingsGoals = [];
        }
        // Limpiar key vieja
        delete state.savingsGoal;
        // Recalcular nextId/nextReminderId desde los datos reales
        const maxExpId = (state.expenses || []).reduce((max: number, e: any) => Math.max(max, e.id || 0), 0);
        const maxRemId = (state.reminders || []).reduce((max: number, r: any) => Math.max(max, r.id || 0), 0);
        state.nextId = maxExpId + 1;
        state.nextReminderId = maxRemId + 1;
        return state;
      },
      partialize: (state) => ({
        expenses: state.expenses,
        budgets: state.budgets,
        reminders: state.reminders,
        currentViewDate: state.currentViewDate,
        currentFilter: state.currentFilter,
        nextId: state.nextId,
        nextReminderId: state.nextReminderId,
        savingsGoals: state.savingsGoals,
        customExpenseCategories: state.customExpenseCategories,
        customIncomeCategories: state.customIncomeCategories,
      }),
    }
  )
);
