// ================================================================
// LEGACY IMPORT — Migración one-time de los blobs JSON de `profiles`
// a las tablas por entidad. Idempotente: los ids son UUID v5
// deterministas (seed = userId:entidad:legacyId), así que re-ejecutar
// el import (crash, doble dispositivo) nunca duplica filas.
// ================================================================

import { uuidv5 } from '@/lib/ids';
import type { Transaction, PaymentReminder, MonthlyBudget, Category, SavingsGoal } from '@/types';

/** Fila de profiles con las columnas legacy (todas opcionales). */
export interface LegacyProfileRow {
  id?: string;
  email?: string;
  legacy_imported?: boolean;
  expenses?: Transaction[] | string;
  budgets?: MonthlyBudget | string;
  reminders?: PaymentReminder[] | string;
  savings_goal?: SavingsGoal[] | string;
  custom_expense_categories?: Category[] | string;
  custom_income_categories?: Category[] | string;
  last_synced_at?: string | null;
}

export interface LegacyImportRows {
  expenses: Transaction[];
  reminders: PaymentReminder[];
  expenseCategories: Category[];
  incomeCategories: Category[];
  goals: SavingsGoal[];
  budgets: Array<{ month: string; amount: number; updated_at: string }>;
}

function parseJsonField<T>(field: unknown, fallback: T): T {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return fallback;
    }
  }
  return (field as T) ?? fallback;
}

interface ParsedBlobs {
  expenses: Transaction[];
  budgets: MonthlyBudget;
  reminders: PaymentReminder[];
  goals: SavingsGoal[];
  expenseCategories: Category[];
  incomeCategories: Category[];
}

function parseBlobs(profile: LegacyProfileRow): ParsedBlobs {
  return {
    expenses: parseJsonField<Transaction[]>(profile.expenses, []),
    budgets: parseJsonField<MonthlyBudget>(profile.budgets, {}),
    reminders: parseJsonField<PaymentReminder[]>(profile.reminders, []),
    goals: parseJsonField<SavingsGoal[]>(profile.savings_goal, []),
    expenseCategories: parseJsonField<Category[]>(profile.custom_expense_categories, []),
    incomeCategories: parseJsonField<Category[]>(profile.custom_income_categories, []),
  };
}

/** ¿Hay que importar? Solo si el flag está pendiente, hay blobs y las tablas están vacías. */
export function shouldImportLegacy(profile: LegacyProfileRow, tablesEmpty: boolean): boolean {
  if (!tablesEmpty) return false;
  if (profile.legacy_imported) return false;
  const blobs = parseBlobs(profile);
  return (
    blobs.expenses.length > 0 ||
    blobs.reminders.length > 0 ||
    Object.keys(blobs.budgets).length > 0 ||
    blobs.goals.length > 0 ||
    blobs.expenseCategories.length > 0 ||
    blobs.incomeCategories.length > 0
  );
}

/**
 * Convierte los blobs legacy en filas locales listas para upsert.
 * Los ids de expenses/reminders/goals son UUID v5 deterministas;
 * las categorías conservan su slug (clave de merge). Los presupuestos
 * se expanden a filas (month, amount).
 */
export async function buildImportRows(
  profile: LegacyProfileRow,
  userId: string,
): Promise<LegacyImportRows> {
  const blobs = parseBlobs(profile);
  const fallbackStamp = profile.last_synced_at ?? new Date().toISOString();

  const expenses = await Promise.all(
    blobs.expenses.map(async (t) => ({
      ...t,
      id: await uuidv5(`${userId}:expense:${t.id}`),
      updated_at: t.updated_at ?? fallbackStamp,
    })),
  );

  const reminders = await Promise.all(
    blobs.reminders.map(async (r) => ({
      ...r,
      id: await uuidv5(`${userId}:reminder:${r.id}`),
      updated_at: r.updated_at ?? fallbackStamp,
    })),
  );

  // Los goals legacy no tenían id: el índice dentro del blob es el seed.
  const goals = await Promise.all(
    blobs.goals.map(async (g, i) => ({
      ...g,
      id: await uuidv5(`${userId}:goal:${i}`),
      updated_at: g.updated_at ?? fallbackStamp,
    })),
  );

  const expenseCategories = blobs.expenseCategories.map((c) => ({
    ...c,
    updated_at: c.updated_at ?? fallbackStamp,
  }));
  const incomeCategories = blobs.incomeCategories.map((c) => ({
    ...c,
    updated_at: c.updated_at ?? fallbackStamp,
  }));

  const budgets = Object.entries(blobs.budgets).map(([month, amount]) => ({
    month,
    amount,
    updated_at: fallbackStamp,
  }));

  return { expenses, reminders, expenseCategories, incomeCategories, goals, budgets };
}
