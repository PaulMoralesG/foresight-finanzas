// ================================================================
// FINANCE STORE - Zustand (finanzas: transactions, budgets, view)
// ================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeParseDate, roundMoney as roundMoneyLocal } from '@/lib/utils';
import { newId, nowIso } from '@/lib/ids';
import type { Transaction, MonthlyBudget, FilterType, Category, SavingsGoal, Account, Debt, Settings, Asset, NetWorthSnapshot, BudgetLine } from '@/types';
import { convertGlobalBudgets } from '@/lib/budget-lines';
import type { BackupData } from '@/lib/backup';

interface FinanceState {
  // --- Estado ---
  expenses: Transaction[];
  /** Presupuesto global antiguo (un número por mes). Desde la v12 solo se
   *  conserva para sync con clientes viejos; la UI usa `budgetLines`. */
  budgets: MonthlyBudget;
  budgetUpdatedAt: Record<string, string>; // monthKey 'YYYY-MM' → ISO (merge de sync)
  /** Presupuesto por categoría (fase 3.4). */
  budgetLines: BudgetLine[];
  savingsGoals: SavingsGoal[];
  accounts: Account[];
  debts: Debt[];
  assets: Asset[];
  /** Cierres mensuales del patrimonio; uno por mes, se arma solo. */
  networth: NetWorthSnapshot[];
  /** Ajustes sincronizados: método de deuda, aporte extra, meta de patrimonio. */
  settings: Settings;
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
  addBudgetLine: (l: Omit<BudgetLine, 'id' | 'updated_at'>) => string;
  updateBudgetLine: (id: string, partial: Partial<Omit<BudgetLine, 'id' | 'updated_at'>>) => void;
  deleteBudgetLine: (id: string) => void;
  /** Fija (o borra, con 0/NaN) el plan de un mes de una línea. */
  setBudgetPlan: (id: string, monthKey: string, value: number | null) => void;

  // --- Recordatorios de pago ---

  // --- Categorías personalizadas ---
  addCustomCategory: (type: 'expense' | 'income', category: Category) => void;
  updateCustomCategory: (type: 'expense' | 'income', id: string, updates: Partial<Category>) => void;
  deleteCustomCategory: (type: 'expense' | 'income', id: string) => void;

  // --- Metas de ahorro ---
  addSavingsGoal: (g: Omit<SavingsGoal, 'id' | 'updated_at'>) => string;
  updateSavingsGoal: (id: string, partial: Partial<Omit<SavingsGoal, 'id' | 'updated_at'>>) => void;
  deleteSavingsGoal: (id: string) => void;

  // --- Cuentas ---
  addAccount: (a: Omit<Account, 'id' | 'updated_at'>) => string;
  updateAccount: (id: string, partial: Partial<Omit<Account, 'id' | 'updated_at'>>) => void;
  deleteAccount: (id: string) => void;

  // --- Deudas ---
  addDebt: (d: Omit<Debt, 'id' | 'updated_at'>) => string;
  updateDebt: (id: string, partial: Partial<Omit<Debt, 'id' | 'updated_at'>>) => void;
  deleteDebt: (id: string) => void;
  /** Baja el saldo de la deuda y, si se pide, deja el pago como gasto del mes. */
  registerDebtPayment: (
    id: string,
    pago: { amount: number; date: string; accountId: string | null; asExpense: boolean },
  ) => void;

  // --- Activos y patrimonio ---
  addAsset: (a: Omit<Asset, 'id' | 'updated_at'>) => string;
  updateAsset: (id: string, partial: Partial<Omit<Asset, 'id' | 'updated_at'>>) => void;
  deleteAsset: (id: string) => void;
  /** Guarda o reemplaza el cierre de un mes. */
  saveNetWorthSnapshot: (snap: Omit<NetWorthSnapshot, 'updated_at'>) => void;

  // --- Ajustes ---
  setSettings: (partial: Partial<Omit<Settings, 'updated_at'>>) => void;

  // --- Copia de seguridad ---
  /** Reemplaza todas las entidades por las del respaldo. Las marcas
   *  `updated_at` se renuevan para que, con sync, lo importado gane. */
  importBackup: (data: BackupData) => void;

  // --- Selectores (getters) ---
  getMonthlyData: () => Transaction[];

  // --- Reset (logout) ---
  reset: () => void;
}

const emptyState = {
  expenses: [] as Transaction[],
  budgets: {} as MonthlyBudget,
  budgetUpdatedAt: {} as Record<string, string>,
  budgetLines: [] as BudgetLine[],
  savingsGoals: [] as SavingsGoal[],
  accounts: [] as Account[],
  debts: [] as Debt[],
  assets: [] as Asset[],
  networth: [] as NetWorthSnapshot[],
  settings: { debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' } as Settings,
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
  if (!state.tombstones || typeof state.tombstones !== 'object' || Array.isArray(state.tombstones)) {
    state.tombstones = {};
  }
  if (!state.budgetUpdatedAt || typeof state.budgetUpdatedAt !== 'object' || Array.isArray(state.budgetUpdatedAt)) {
    state.budgetUpdatedAt = {};
  }

  return state;
}

/**
 * Migración v9: cuentas (fase 3.1). Solo añade `accounts` vacío y
 * garantiza que ningún movimiento traiga `accountId`/`toAccountId` con un
 * tipo que no sea string. Idempotente: se aplica después de migrateV8
 * también a estados que ya estaban en v8.
 */
function migrateV9(state: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(state.accounts)) state.accounts = [];
  const limpiarId = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  state.expenses = (state.expenses as Array<Record<string, unknown>>).map((e) => ({
    ...e,
    accountId: limpiarId(e.accountId),
    toAccountId: limpiarId(e.toAccountId),
  }));
  return state;
}

/**
 * Migración v10: deudas y ajustes (fase 3.2). `settings.updated_at` vacío
 * significa "nunca tocado": en el merge pierde contra cualquier fila del
 * servidor.
 */
function migrateV10(state: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(state.debts)) state.debts = [];
  const s = (state.settings ?? {}) as Record<string, unknown>;
  state.settings = {
    debtMethod: s.debtMethod === 'avalanche' ? 'avalanche' : 'snowball',
    extraPayment: typeof s.extraPayment === 'number' ? s.extraPayment : 0,
    netWorthGoal: typeof s.netWorthGoal === 'number' ? s.netWorthGoal : 0,
    updated_at: typeof s.updated_at === 'string' ? s.updated_at : '',
  };
  return state;
}

/** Migración v11: activos y cierres de patrimonio (fase 3.3). */
function migrateV11(state: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(state.assets)) state.assets = [];
  if (!Array.isArray(state.networth)) state.networth = [];
  return state;
}

/**
 * Migración v12: presupuesto por categoría (fase 3.4). Si el estado no
 * trae `budgetLines`, el presupuesto global de cada mes se reparte entre
 * las categorías en proporción al gasto real de ese mes (ver
 * convertGlobalBudgets). El mapa global se conserva tal cual.
 */
function migrateV12(state: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(state.budgetLines)) {
    const budgets = (state.budgets && typeof state.budgets === 'object' ? state.budgets : {}) as MonthlyBudget;
    const expenses = (Array.isArray(state.expenses) ? state.expenses : []) as Transaction[];
    state.budgetLines = convertGlobalBudgets(budgets, expenses);
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

      // ── Presupuesto por categoría ──
      addBudgetLine: (l) => {
        const id = newId();
        set((state) => ({ budgetLines: [...state.budgetLines, { ...l, id, updated_at: nowIso() }] }));
        return id;
      },

      updateBudgetLine: (id, partial) =>
        set((state) => ({
          budgetLines: state.budgetLines.map((l) => (l.id === id ? { ...l, ...partial, updated_at: nowIso() } : l)),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteBudgetLine: (id) =>
        set((state) => ({
          budgetLines: state.budgetLines.filter((l) => l.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      setBudgetPlan: (id, monthKey, value) =>
        set((state) => ({
          budgetLines: state.budgetLines.map((l) => {
            if (l.id !== id) return l;
            const plan = { ...l.plan };
            if (value == null || Number.isNaN(value) || value === 0) delete plan[monthKey];
            else plan[monthKey] = value;
            return { ...l, plan, updated_at: nowIso() };
          }),
        })),

      // ── Cuentas ──
      addAccount: (a) => {
        const id = newId();
        set((state) => ({
          accounts: [...state.accounts, { ...a, id, updated_at: nowIso() }],
        }));
        return id;
      },

      updateAccount: (id, partial) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? { ...a, ...partial, updated_at: nowIso() } : a
          ),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      // ── Deudas ──
      addDebt: (d) => {
        const id = newId();
        set((state) => ({ debts: [...state.debts, { ...d, id, updated_at: nowIso() }] }));
        return id;
      },

      updateDebt: (id, partial) =>
        set((state) => ({
          debts: state.debts.map((d) => (d.id === id ? { ...d, ...partial, updated_at: nowIso() } : d)),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteDebt: (id) =>
        set((state) => ({
          debts: state.debts.filter((d) => d.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      registerDebtPayment: (id, pago) =>
        set((state) => {
          const debt = state.debts.find((d) => d.id === id);
          if (!debt) return {};
          const debts = state.debts.map((d) =>
            d.id === id ? { ...d, balance: Math.max(0, roundMoneyLocal(d.balance - pago.amount)), updated_at: nowIso() } : d,
          );
          if (!pago.asExpense) return { debts };
          // Como en Balance Dual: el pago queda además como gasto del mes, en
          // la categoría que corresponde al tipo de deuda.
          const category = debt.kind === 'Tarjeta de crédito' ? 'pago-tarjetas' : 'prestamos';
          const tx: Transaction = {
            id: newId(),
            type: 'expense',
            amount: pago.amount,
            concept: `Pago ${debt.name}`,
            date: pago.date,
            category,
            method: pago.accountId ? 'transfer' : 'cash',
            businessType: debt.tag,
            accountId: pago.accountId,
            toAccountId: null,
            created_at: nowIso(),
            updated_at: nowIso(),
          };
          return { debts, expenses: [...state.expenses, tx] };
        }),

      // ── Activos y patrimonio ──
      addAsset: (a) => {
        const id = newId();
        set((state) => ({ assets: [...state.assets, { ...a, id, updated_at: nowIso() }] }));
        return id;
      },

      updateAsset: (id, partial) =>
        set((state) => ({
          assets: state.assets.map((a) => (a.id === id ? { ...a, ...partial, updated_at: nowIso() } : a)),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteAsset: (id) =>
        set((state) => ({
          assets: state.assets.filter((a) => a.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      saveNetWorthSnapshot: (snap) =>
        set((state) => ({
          networth: [
            ...state.networth.filter((n) => n.month !== snap.month),
            { ...snap, updated_at: nowIso() },
          ],
        })),

      // ── Ajustes ──
      setSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial, updated_at: nowIso() } })),

      // ── Copia de seguridad ──
      importBackup: (data) => {
        const ahora = nowIso();
        const sellar = <T extends { updated_at?: string }>(rows: T[]): T[] => rows.map((r) => ({ ...r, updated_at: ahora }));
        set({
          expenses: sellar(data.expenses),
          accounts: sellar(data.accounts),
          debts: sellar(data.debts),
          assets: sellar(data.assets),
          networth: sellar(data.networth),
          budgetLines: sellar(data.budgetLines),
          budgets: data.budgets,
          budgetUpdatedAt: Object.fromEntries(Object.keys(data.budgets).map((k) => [k, ahora])),
          savingsGoals: sellar(data.savingsGoals),
          customExpenseCategories: sellar(data.customExpenseCategories),
          customIncomeCategories: sellar(data.customIncomeCategories),
          settings: { ...data.settings, updated_at: ahora },
          // Lo que no venga en el respaldo pero existiera en el servidor
          // volverá con el próximo pull: sin tombstones no hay borrado.
          tombstones: {},
        });
      },

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
      version: 12,
      migrate: (persistedState: unknown, _version: number) => {
        try {
          return migrateV12(migrateV11(migrateV10(migrateV9(migrateV8(persistedState)))));
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
        budgetLines: state.budgetLines,
        currentViewDate: state.currentViewDate,
        currentFilter: state.currentFilter,
        savingsGoals: state.savingsGoals,
        accounts: state.accounts,
        debts: state.debts,
        assets: state.assets,
        networth: state.networth,
        settings: state.settings,
        customExpenseCategories: state.customExpenseCategories,
        customIncomeCategories: state.customIncomeCategories,
        tombstones: state.tombstones,
      }),
    }
  )
);
