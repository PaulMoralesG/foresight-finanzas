// ================================================================
// LEGACY IMPORT — Migración one-time de los blobs JSON de `profiles`
// a las tablas por entidad. Idempotente: los ids son UUID v5
// deterministas (seed = userId:entidad:legacyId), así que re-ejecutar
// el import (crash, doble dispositivo) nunca duplica filas.
// ================================================================

import { uuidv5 } from '@/lib/ids';
import { getTodayISO } from '@/lib/utils';
import type {
  Transaction,
  PaymentReminder,
  MonthlyBudget,
  Category,
  SavingsGoal,
  TransactionType,
  PaymentMethod,
  BusinessType,
} from '@/types';

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
 *
 * Tolerante a datos malformados de versiones viejas: normaliza montos,
 * enums (CHECK de Postgres), fechas y deduplica ids repetidos — así el
 * import no aborta por una sola fila sucia.
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

  // Los CHECK de las tablas nuevas exigen valores del enum; blobs viejos
  // pueden traer cualquier cosa.
  const txType = (v: unknown): TransactionType =>
    v === 'income' || v === 'expense' ? v : 'expense';
  const txMethod = (v: unknown): PaymentMethod =>
    v === 'cash' || v === 'card' || v === 'transfer' ? v : 'cash';
  const txBusiness = (v: unknown): BusinessType =>
    v === 'business' || v === 'personal' ? v : 'personal';

  // date column de Postgres: quedarse con YYYY-MM-DD, fallback hoy si no es fecha
  const normalizeDate = (v: unknown): string => {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    return getTodayISO();
  };

  // Ids numéricos repetidos (collisiones de la versión vieja) generarían el
  // mismo uuid v5 → PK duplicada en el upsert → aborta el import. Deduplicar.
  const dedupeById = <T extends { id?: unknown }>(rows: T[]): T[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = String(r.id ?? '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const expenses = await Promise.all(
    dedupeById(blobs.expenses).map(async (t) => ({
      ...t,
      id: await uuidv5(`${userId}:expense:${t.id}`),
      amount: num(t.amount),
      type: txType(t.type),
      method: txMethod(t.method),
      businessType: txBusiness(t.businessType),
      date: normalizeDate(t.date),
      updated_at: t.updated_at ?? fallbackStamp,
    })),
  );

  const reminders = await Promise.all(
    dedupeById(blobs.reminders).map(async (r) => ({
      ...r,
      id: await uuidv5(`${userId}:reminder:${r.id}`),
      amount: num(r.amount),
      method: txMethod(r.method),
      businessType: txBusiness(r.businessType),
      dueDate: normalizeDate(r.dueDate),
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

  // Categorías: solo items con slug válido (id string no vacío)
  const cleanCategory = (c: Category) => ({
    ...c,
    id: typeof c.id === 'string' && c.id ? c.id : '',
    label: typeof c.label === 'string' ? c.label : String(c.label ?? ''),
    updated_at: c.updated_at ?? fallbackStamp,
  });
  const expenseCategories = dedupeById(blobs.expenseCategories)
    .map(cleanCategory)
    .filter((c) => c.id);
  const incomeCategories = dedupeById(blobs.incomeCategories)
    .map(cleanCategory)
    .filter((c) => c.id);

  const budgets = Object.entries(blobs.budgets).map(([month, amount]) => ({
    month,
    amount: num(amount),
    updated_at: fallbackStamp,
  }));

  return { expenses, reminders, expenseCategories, incomeCategories, goals, budgets };
}
