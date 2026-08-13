// ================================================================
// FINANCE STORE - Zustand (finanzas: transactions, budgets, view)
// ================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeParseDate } from '@/lib/utils';
import { newId, nowIso } from '@/lib/ids';
import type { Transaction, MonthlyBudget, FilterType, PaymentReminder, Category, SavingsGoal } from '@/types';

interface FinanceState {
  // --- Estado ---
  expenses: Transaction[];
  budgets: MonthlyBudget;
  budgetUpdatedAt: Record<string, string>; // monthKey 'YYYY-MM' → ISO (merge de sync)
  reminders: PaymentReminder[];
  savingsGoals: SavingsGoal[];
  customExpenseCategories: Category[];
  customIncomeCategories: Category[];
  /** id → deleted_at ISO. Borrados lógicos: permiten propagar deletes en el sync. */
  tombstones: Record<string, string>;
  currentViewDate: string; // ISO string para que serialize bien
  currentFilter: FilterType;

  // --- Acciones de fecha y filtro ---
  setViewDate: (step: number) => void;
  setFilter: (filter: FilterType) => void;
  ensureCurrentMonth: () => void;

  // --- CRUD de transacciones ---
  addTransaction: (t: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) => string;
  updateTransaction: (id: string, partial: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>) => void;
  deleteTransaction: (id: string) => void;
  deleteTransactions: (ids: string[]) => void;
  restoreTransactions: (items: Transaction[]) => void;

  // --- Presupuestos ---
  setBudget: (monthKey: string, value: number) => void;

  // --- Recordatorios de pago ---
  addReminder: (r: Omit<PaymentReminder, 'id' | 'createdAt' | 'isPaid' | 'updated_at'>) => string;
  updateReminder: (id: string, partial: Partial<Omit<PaymentReminder, 'id' | 'createdAt' | 'updated_at'>>) => void;
  deleteReminder: (id: string) => void;
  toggleReminderPaid: (id: string) => void;
  getUpcomingReminders: () => PaymentReminder[];

  // --- Categorías personalizadas ---
  addCustomCategory: (type: 'expense' | 'income', category: Category) => void;
  updateCustomCategory: (type: 'expense' | 'income', id: string, updates: Partial<Category>) => void;
  deleteCustomCategory: (type: 'expense' | 'income', id: string) => void;

  // --- Metas de ahorro ---
  addSavingsGoal: (g: Omit<SavingsGoal, 'id' | 'updated_at'>) => string;
  updateSavingsGoal: (id: string, partial: Partial<Omit<SavingsGoal, 'id' | 'updated_at'>>) => void;
  deleteSavingsGoal: (id: string) => void;

  // --- Selectores (getters) ---
  getMonthlyData: () => Transaction[];

  // --- Reset (logout) ---
  reset: () => void;
}

const emptyState = {
  expenses: [] as Transaction[],
  budgets: {} as MonthlyBudget,
  budgetUpdatedAt: {} as Record<string, string>,
  reminders: [] as PaymentReminder[],
  savingsGoals: [] as SavingsGoal[],
  customExpenseCategories: [] as Category[],
  customIncomeCategories: [] as Category[],
  tombstones: {} as Record<string, string>,
  currentViewDate: new Date().toISOString(),
  currentFilter: 'all' as FilterType,
};

/** Marca un id como borrado (borrado lógico para sync). */
function tombstoned(tombstones: Record<string, string>, id: string): Record<string, string> {
  return { ...tombstones, [id]: nowIso() };
}

/** Quita el tombstone de un id (resurrección local al editar/recrear). */
function clearedTombstone(tombstones: Record<string, string>, id: string): Record<string, string> {
  if (!(id in tombstones)) return tombstones;
  const next = { ...tombstones };
  delete next[id];
  return next;
}

/**
 * Migración v8 del estado persistido.
 * Migraciones anteriores: v5→v6 savingsGoal (number) → savingsGoals (array)
 * y v6→v7 dedup de IDs + recálculo de contadores. v8: IDs → strings únicos
 * ('legacy-<n>' determinista), updated_at en cada entidad y sin contadores.
 */
function migrateV8(persistedState: unknown): Record<string, unknown> {
  const state = (persistedState ?? {}) as Record<string, unknown>;

  const stampIds = (rows: unknown): Array<Record<string, unknown>> =>
    (Array.isArray(rows) ? rows : [])
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({
        ...row,
        id: typeof row.id === 'number' ? `legacy-${row.id}` : String(row.id),
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : nowIso(),
      }));

  // Dedup por id (conserva la primera ocurrencia) + conversión a string
  const dedupe = (rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = String(r.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  state.expenses = dedupe(stampIds(state.expenses));
  state.reminders = dedupe(stampIds(state.reminders));

  // Metas de ahorro: garantizar array, id y updated_at (limpiar key vieja)
  if (!Array.isArray(state.savingsGoals)) state.savingsGoals = [];
  delete state.savingsGoal;
  state.savingsGoals = (state.savingsGoals as Array<Record<string, unknown>>).map((g) => ({
    ...g,
    id: typeof g.id === 'string' ? g.id : newId(),
    updated_at: typeof g.updated_at === 'string' ? g.updated_at : nowIso(),
  }));

  // Categorías custom: garantizar updated_at
  (['customExpenseCategories', 'customIncomeCategories'] as const).forEach((key) => {
    if (!Array.isArray(state[key])) state[key] = [];
    state[key] = (state[key] as Array<Record<string, unknown>>).map((c) => ({
      ...c,
      updated_at: typeof c.updated_at === 'string' ? c.updated_at : nowIso(),
    }));
  });

  // Contadores numéricos: fuera. Campos nuevos del merge: inicializados.
  delete state.nextId;
  delete state.nextReminderId;
  if (!state.tombstones || typeof state.tombstones !== 'object' || Array.isArray(state.tombstones)) {
    state.tombstones = {};
  }
  if (!state.budgetUpdatedAt || typeof state.budgetUpdatedAt !== 'object' || Array.isArray(state.budgetUpdatedAt)) {
    state.budgetUpdatedAt = {};
  }

  return state;
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...emptyState,

      reset: () => set({ ...emptyState, currentViewDate: new Date().toISOString() }),

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

      addTransaction: (t) => {
        const id = newId();
        set((state) => ({
          expenses: [...state.expenses, { ...t, id, created_at: nowIso(), updated_at: nowIso() }],
        }));
        return id;
      },

      updateTransaction: (id, partial) =>
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, ...partial, updated_at: nowIso() } : e
          ),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteTransaction: (id) =>
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      deleteTransactions: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          let tombstones = state.tombstones;
          ids.forEach((id) => {
            tombstones = tombstoned(tombstones, id);
          });
          return {
            expenses: state.expenses.filter((e) => !idSet.has(e.id)),
            tombstones,
          };
        }),

      // Undo de borrado masivo: conserva ids y timestamps originales
      restoreTransactions: (items) =>
        set((state) => {
          const tombstones = { ...state.tombstones };
          items.forEach((item) => delete tombstones[item.id]);
          return {
            expenses: [...state.expenses, ...items],
            tombstones,
          };
        }),

      setBudget: (monthKey, value) =>
        set((state) => ({
          budgets: { ...state.budgets, [monthKey]: value },
          budgetUpdatedAt: { ...state.budgetUpdatedAt, [monthKey]: nowIso() },
        })),

      // ── Recordatorios de pago ──
      addReminder: (r) => {
        const id = newId();
        set((state) => ({
          reminders: [
            ...state.reminders,
            { ...r, id, createdAt: nowIso(), isPaid: false, updated_at: nowIso() },
          ],
        }));
        return id;
      },

      updateReminder: (id, partial) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, ...partial, updated_at: nowIso() } : r
          ),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteReminder: (id) =>
        set((state) => ({
          reminders: state.reminders.filter((r) => r.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      toggleReminderPaid: (id) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, isPaid: !r.isPaid, updated_at: nowIso() } : r
          ),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      getUpcomingReminders: () => {
        const { reminders } = get();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return reminders
          .filter((r) => {
            if (r.isPaid) return false;
            const due = new Date(r.dueDate);
            due.setHours(0, 0, 0, 0);
            const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            return diffDays <= 30;
          })
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      },

      // ── Categorías personalizadas ──
      addCustomCategory: (type, category) =>
        set((state) => {
          const withStamp: Category = { ...category, updated_at: category.updated_at ?? nowIso() };
          if (type === 'expense') {
            return {
              customExpenseCategories: [...state.customExpenseCategories, withStamp],
              tombstones: clearedTombstone(state.tombstones, withStamp.id),
            };
          }
          return {
            customIncomeCategories: [...state.customIncomeCategories, withStamp],
            tombstones: clearedTombstone(state.tombstones, withStamp.id),
          };
        }),

      updateCustomCategory: (type, id, updates) =>
        set((state) => {
          const key = type === 'expense' ? 'customExpenseCategories' as const : 'customIncomeCategories' as const;
          return {
            [key]: state[key].map((c) =>
              c.id === id ? { ...c, ...updates, updated_at: nowIso() } : c
            ),
            tombstones: clearedTombstone(state.tombstones, id),
          } as Partial<FinanceState>;
        }),

      deleteCustomCategory: (type, id) =>
        set((state) => {
          if (type === 'expense') {
            return {
              customExpenseCategories: state.customExpenseCategories.filter((c) => c.id !== id),
              tombstones: tombstoned(state.tombstones, id),
            };
          }
          return {
            customIncomeCategories: state.customIncomeCategories.filter((c) => c.id !== id),
            tombstones: tombstoned(state.tombstones, id),
          };
        }),

      // ── Metas de ahorro ──
      addSavingsGoal: (g) => {
        const id = newId();
        set((state) => ({
          savingsGoals: [...state.savingsGoals, { ...g, id, updated_at: nowIso() }],
        }));
        return id;
      },

      updateSavingsGoal: (id, partial) =>
        set((state) => ({
          savingsGoals: state.savingsGoals.map((g) =>
            g.id === id ? { ...g, ...partial, updated_at: nowIso() } : g
          ),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteSavingsGoal: (id) =>
        set((state) => ({
          savingsGoals: state.savingsGoals.filter((g) => g.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

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
      version: 8,
      migrate: (persistedState: unknown, _version: number) => {
        try {
          return migrateV8(persistedState);
        } catch (err) {
          // Estado inesperado: arrancar limpio antes que romper la app
          console.error('[financeStore] Migración de estado persistido fallida — reseteando:', err);
          return { ...emptyState, currentViewDate: new Date().toISOString() };
        }
      },

      partialize: (state) => ({
        expenses: state.expenses,
        budgets: state.budgets,
        budgetUpdatedAt: state.budgetUpdatedAt,
        reminders: state.reminders,
        currentViewDate: state.currentViewDate,
        currentFilter: state.currentFilter,
        savingsGoals: state.savingsGoals,
        customExpenseCategories: state.customExpenseCategories,
        customIncomeCategories: state.customIncomeCategories,
        tombstones: state.tombstones,
      }),
    }
  )
);
