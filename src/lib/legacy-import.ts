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

function parseJsonField<T>(field: unknown, fallback: T): unknown {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as unknown;
    } catch {
      return fallback;
    }
  }
  return field ?? fallback;
}

interface ParsedBlobs {
  expenses: Transaction[];
  budgets: MonthlyBudget;
  reminders: PaymentReminder[];
  goals: SavingsGoal[];
  expenseCategories: Category[];
  incomeCategories: Category[];
}

/** Solo arrays pasan; cualquier otra forma (null, number, objeto) → []. */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Solo objetos planos pasan; cualquier otra forma → {}. */
function asRecord(value: unknown): MonthlyBudget {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MonthlyBudget)
    : {};
}

function parseBlobs(profile: LegacyProfileRow): ParsedBlobs {
  return {
    expenses: asArray<Transaction>(parseJsonField(profile.expenses, [])),
    budgets: asRecord(parseJsonField(profile.budgets, {})),
    reminders: asArray<PaymentReminder>(parseJsonField(profile.reminders, [])),
    // savings_goal es NUMERIC en la DB real (herencia de v5): el guard lo descarta
    goals: asArray<SavingsGoal>(parseJsonField(profile.savings_goal, [])),
    expenseCategories: asArray<Category>(parseJsonField(profile.custom_expense_categories, [])),
    incomeCategories: asArray<Category>(parseJsonField(profile.custom_income_categories, [])),
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

  // Montos pueden venir como string en blobs viejos — normalizar a number
  // para que el CHECK/numeric de Postgres no rechace la fila.
  const num = (value: unknown): number =>
    typeof value === 'number' ? value : (Number(value) || 0);

  const expenses = await Promise.all(
    blobs.expenses.map(async (t) => ({
      ...t,
      id: await uuidv5(`${userId}:expense:${t.id}`),
      amount: num(t.amount),
      updated_at: t.updated_at ?? fallbackStamp,
    })),
  );

  const reminders = await Promise.all(
    blobs.reminders.map(async (r) => ({
      ...r,
      id: await uuidv5(`${userId}:reminder:${r.id}`),
      amount: num(r.amount),
      updated_at: r.updated_at ?? fallbackStamp,
    })),
  );

  // Los goals legacy no tenían id: el índice dentro del blob es el seed.
  const goals = await Promise.all(
    blobs.goals.map(async (g, i) => ({
      ...g,
      id: await uuidv5(`${userId}:goal:${i}`),
      target: num(g.target),
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
    amount: num(amount),
    updated_at: fallbackStamp,
  }));

  return { expenses, reminders, expenseCategories, incomeCategories, goals, budgets };
}
