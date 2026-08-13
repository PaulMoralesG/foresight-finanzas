// ================================================================
// SYNC SERVICE — pull-then-push con merge determinista por fila
// Singleton: un solo timer debounced (800ms), flush centralizado,
// single-flight, reintentos con backoff y modo local-only si el
// esquema de Supabase no fue migrado.
// ================================================================

import { supabase } from '@/config/supabase';
import { useFinanceStore } from '@/stores/financeStore';
import { mergeById, mergeBudgets, type MergeSet } from '@/lib/merge';
import { nowIso } from '@/lib/ids';
import { getTodayISO } from '@/lib/utils';
import {
  shouldImportLegacy,
  buildImportRows,
  type LegacyProfileRow,
} from '@/lib/legacy-import';
import type {
  Transaction,
  PaymentReminder,
  Category,
  SavingsGoal,
  TransactionType,
  PaymentMethod,
  BusinessType,
} from '@/types';

const DEBOUNCE_MS = 800;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// ── Formas de fila del servidor (snake_case) ──
// Las columnas de negocio son NULLABLE en el schema: los upserts de
// tombstone solo llevan identidad + timestamps.

export interface ExpenseRow {
  id: string;
  user_id: string;
  type: string | null;
  amount: number | null;
  concept: string | null;
  date: string | null;
  category: string | null;
  method: string | null;
  business_type: string | null;
  created_at: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface ReminderRow {
  id: string;
  user_id: string;
  concept: string | null;
  amount: number | null;
  due_date: string | null;
  category: string | null;
  business_type: string | null;
  method: string | null;
  is_paid: boolean;
  notes: string | null;
  created_at: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface CategoryRow {
  id: string;
  user_id: string;
  kind: 'expense' | 'income';
  label: string | null;
  icon: string | null;
  color: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface GoalRow {
  id: string;
  user_id: string;
  concept: string | null;
  target: number | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface BudgetRow {
  user_id: string;
  month: string;
  amount: number;
  updated_at: string;
}

export interface Snapshot {
  expenses: ExpenseRow[];
  reminders: ReminderRow[];
  categories: CategoryRow[];
  goals: GoalRow[];
  budgets: BudgetRow[];
}

// ── Convertidores locales ↔ filas ──

export function expenseToRow(t: Transaction, userId: string): ExpenseRow {
  return {
    id: t.id,
    user_id: userId,
    type: t.type,
    amount: t.amount,
    concept: t.concept,
    date: t.date,
    category: t.category,
    method: t.method,
    business_type: t.businessType,
    created_at: t.created_at ?? null,
    updated_at: t.updated_at,
    deleted_at: null,
  };
}

export function rowToExpense(r: ExpenseRow): Transaction {
  return {
    id: r.id,
    type: (r.type === 'income' || r.type === 'expense' ? r.type : 'expense') as TransactionType,
    amount: r.amount ?? 0,
    concept: r.concept ?? '',
    date: r.date ?? getTodayISO(),
    category: r.category ?? 'general',
    method: (r.method === 'cash' || r.method === 'card' || r.method === 'transfer' ? r.method : 'cash') as PaymentMethod,
    businessType: (r.business_type === 'business' || r.business_type === 'personal' ? r.business_type : 'personal') as BusinessType,
    created_at: r.created_at ?? undefined,
    updated_at: r.updated_at,
  };
}

export function reminderToRow(r: PaymentReminder, userId: string): ReminderRow {
  return {
    id: r.id,
    user_id: userId,
    concept: r.concept,
    amount: r.amount,
    due_date: r.dueDate,
    category: r.category,
    business_type: r.businessType,
    method: r.method,
    is_paid: r.isPaid,
    notes: r.notes ?? null,
    created_at: r.createdAt,
    updated_at: r.updated_at,
    deleted_at: null,
  };
}

export function rowToReminder(r: ReminderRow): PaymentReminder {
  return {
    id: r.id,
    concept: r.concept ?? '',
    amount: r.amount ?? 0,
    dueDate: r.due_date ?? getTodayISO(),
    category: r.category ?? 'general',
    businessType: (r.business_type === 'business' || r.business_type === 'personal' ? r.business_type : 'personal') as BusinessType,
    method: (r.method === 'cash' || r.method === 'card' || r.method === 'transfer' ? r.method : 'cash') as PaymentMethod,
    isPaid: r.is_paid,
    notes: r.notes ?? undefined,
    createdAt: r.created_at ?? r.updated_at,
    updated_at: r.updated_at,
  };
}

export function categoryToRow(c: Category, userId: string, kind: 'expense' | 'income'): CategoryRow {
  return {
    id: c.id,
    user_id: userId,
    kind,
    label: c.label,
    icon: c.icon,
    color: c.color,
    updated_at: c.updated_at ?? nowIso(),
    deleted_at: null,
  };
}

export function rowToCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    label: r.label ?? '',
    icon: r.icon ?? '📌',
    color: r.color ?? 'bg-slate-100 text-slate-600',
    updated_at: r.updated_at,
  };
}

export function goalToRow(g: SavingsGoal, userId: string): GoalRow {
  return {
    id: g.id,
    user_id: userId,
    concept: g.concept,
    target: g.target,
    updated_at: g.updated_at,
    deleted_at: null,
  };
}

export function rowToGoal(r: GoalRow): SavingsGoal {
  return {
    id: r.id,
    concept: r.concept ?? '',
    target: r.target ?? 0,
    updated_at: r.updated_at,
  };
}

// ── Estado interno del singleton ──

let userId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight: Promise<boolean> | null = null;
let queuedAfterPush = false;
let isSyncing = false; // evita auto-schedule durante merges internos
let dirtyDuringSync = false; // el usuario editó mientras sincronizábamos
let syncDisabled = false; // esquema no migrado → modo local-only
let initialized = false;

/** ¿Error de esquema faltante? (SQL de migración no ejecutado) */
export function isSchemaError(err: unknown): boolean {
  const e = err as { code?: string } | null;
  if (!e?.code) return false;
  return e.code === '42P01' || e.code === '42703' || e.code === 'PGRST205';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Pull ──

async function pullAll(uid: string): Promise<Snapshot> {
  const [exp, rem, cats, goals, buds] = await Promise.all([
    supabase!.from('expenses').select('*').eq('user_id', uid),
    supabase!.from('reminders').select('*').eq('user_id', uid),
    supabase!.from('categories').select('*').eq('user_id', uid),
    supabase!.from('savings_goals').select('*').eq('user_id', uid),
    supabase!.from('budgets').select('*').eq('user_id', uid),
  ]);
  if (exp.error) throw exp.error;
  if (rem.error) throw rem.error;
  if (cats.error) throw cats.error;
  if (goals.error) throw goals.error;
  if (buds.error) throw buds.error;

  return {
    expenses: (exp.data ?? []) as ExpenseRow[],
    reminders: (rem.data ?? []) as ReminderRow[],
    categories: (cats.data ?? []) as CategoryRow[],
    goals: (goals.data ?? []) as GoalRow[],
    budgets: (buds.data ?? []) as BudgetRow[],
  };
}

// ── Merge ──

interface MergeResult {
  expenses: MergeSet<Transaction>;
  reminders: MergeSet<PaymentReminder>;
  goals: MergeSet<SavingsGoal>;
  expenseCategories: MergeSet<Category>;
  incomeCategories: MergeSet<Category>;
  budgets: { budgets: Record<string, number>; updatedAt: Record<string, string> };
  flatTombstones: Record<string, string>;
}

/** Arma el MergeSet remoto a partir de las filas (vivas + tombstones). */
function buildRemoteSet<R extends { id: string; updated_at: string; deleted_at: string | null }, T extends { id: string }>(
  rows: R[],
  toLocal: (row: R) => T,
): MergeSet<T> {
  const live: T[] = [];
  const tombstones: Record<string, string> = {};
  for (const row of rows) {
    if (row.deleted_at) tombstones[row.id] = row.deleted_at;
    else live.push(toLocal(row));
  }
  return { live, tombstones };
}

/** Tombstones locales restringidos a los ids que esta entidad conoce. */
function scopeTombstones(flat: Record<string, string>, ids: Set<string>): Record<string, string> {
  const scoped: Record<string, string> = {};
  for (const id of ids) {
    const at = flat[id];
    if (at) scoped[id] = at;
  }
  return scoped;
}

function universeOf<T extends { id: string }>(localLive: T[], remote: MergeSet<T>): Set<string> {
  return new Set<string>([
    ...localLive.map((i) => i.id),
    ...remote.live.map((i) => i.id),
    ...Object.keys(remote.tombstones),
  ]);
}

function applyMerge(snapshot: Snapshot): MergeResult {
  const state = useFinanceStore.getState();

  const remoteExpenses = buildRemoteSet(snapshot.expenses, rowToExpense);
  const expUniverse = universeOf(state.expenses, remoteExpenses);
  const expenses = mergeById(
    { live: state.expenses, tombstones: scopeTombstones(state.tombstones, expUniverse) },
    remoteExpenses,
  );

  const remoteReminders = buildRemoteSet(snapshot.reminders, rowToReminder);
  const remUniverse = universeOf(state.reminders, remoteReminders);
  const reminders = mergeById(
    { live: state.reminders, tombstones: scopeTombstones(state.tombstones, remUniverse) },
    remoteReminders,
  );

  const remoteGoals = buildRemoteSet(snapshot.goals, rowToGoal);
  const goalsUniverse = universeOf(state.savingsGoals, remoteGoals);
  const goals = mergeById(
    { live: state.savingsGoals, tombstones: scopeTombstones(state.tombstones, goalsUniverse) },
    remoteGoals,
  );

  // Categorías por kind: los slugs pueden repetirse entre tipos
  const expenseRows = snapshot.categories.filter((r) => r.kind === 'expense');
  const incomeRows = snapshot.categories.filter((r) => r.kind === 'income');
  const remoteExpCats = buildRemoteSet(expenseRows, rowToCategory);
  const remoteIncCats = buildRemoteSet(incomeRows, rowToCategory);
  const expCatsUniverse = universeOf(state.customExpenseCategories, remoteExpCats);
  const incCatsUniverse = universeOf(state.customIncomeCategories, remoteIncCats);
  const expenseCategories = mergeById(
    { live: state.customExpenseCategories, tombstones: scopeTombstones(state.tombstones, expCatsUniverse) },
    remoteExpCats,
  );
  const incomeCategories = mergeById(
    { live: state.customIncomeCategories, tombstones: scopeTombstones(state.tombstones, incCatsUniverse) },
    remoteIncCats,
  );

  const budgets = mergeBudgets(state.budgets, state.budgetUpdatedAt, snapshot.budgets);

  // Componer el mapa plano de tombstones (conserva entidades ajenas)
  const allUniverse = new Set<string>([
    ...expUniverse,
    ...remUniverse,
    ...goalsUniverse,
    ...expCatsUniverse,
    ...incCatsUniverse,
  ]);
  const flatTombstones = { ...state.tombstones };
  allUniverse.forEach((id) => delete flatTombstones[id]);
  Object.assign(
    flatTombstones,
    expenses.tombstones,
    reminders.tombstones,
    goals.tombstones,
    expenseCategories.tombstones,
    incomeCategories.tombstones,
  );

  // Solo notificar si algo cambió (evita loops de sync subscribe→push)
  const next = {
    expenses: expenses.live,
    reminders: reminders.live,
    savingsGoals: goals.live,
    customExpenseCategories: expenseCategories.live,
    customIncomeCategories: incomeCategories.live,
    tombstones: flatTombstones,
    budgets: budgets.budgets,
    budgetUpdatedAt: budgets.updatedAt,
  };
  const current = {
    expenses: state.expenses,
    reminders: state.reminders,
    savingsGoals: state.savingsGoals,
    customExpenseCategories: state.customExpenseCategories,
    customIncomeCategories: state.customIncomeCategories,
    tombstones: state.tombstones,
    budgets: state.budgets,
    budgetUpdatedAt: state.budgetUpdatedAt,
  };
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    useFinanceStore.setState(next);
  }

  return { expenses, reminders, goals, expenseCategories, incomeCategories, budgets, flatTombstones };
}

// ── Push ──

type TableName = 'expenses' | 'reminders' | 'categories' | 'savings_goals' | 'budgets';

async function upsert(table: TableName, rows: object[], onConflict: string): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase!.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

async function pushAll(uid: string, merged: MergeResult): Promise<void> {
  const tombstoneRows = (tombstones: Record<string, string>): object[] =>
    Object.entries(tombstones).map(([id, at]) => ({
      id,
      user_id: uid,
      updated_at: at,
      deleted_at: at,
    }));

  await upsert('expenses', [
    ...merged.expenses.live.map((t) => expenseToRow(t, uid)),
    ...tombstoneRows(merged.expenses.tombstones),
  ], 'id');

  await upsert('reminders', [
    ...merged.reminders.live.map((r) => reminderToRow(r, uid)),
    ...tombstoneRows(merged.reminders.tombstones),
  ], 'id');

  await upsert('categories', [
    ...merged.expenseCategories.live.map((c) => categoryToRow(c, uid, 'expense')),
    ...merged.incomeCategories.live.map((c) => categoryToRow(c, uid, 'income')),
    ...tombstoneRows(merged.expenseCategories.tombstones),
    ...tombstoneRows(merged.incomeCategories.tombstones),
  ], 'id');

  await upsert('savings_goals', [
    ...merged.goals.live.map((g) => goalToRow(g, uid)),
    ...tombstoneRows(merged.goals.tombstones),
  ], 'id');

  await upsert('budgets', Object.entries(merged.budgets.budgets).map(([month, amount]) => ({
    user_id: uid,
    month,
    amount,
    updated_at: merged.budgets.updatedAt[month] ?? nowIso(),
  })), 'user_id,month');
}

/** Pull → merge → push con reintentos por red. Los errores de esquema
 *  desactivan el sync (modo local-only) sin reintentar. */
async function pushWithRetry(uid: string): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const snapshot = await pullAll(uid);
      const merged = applyMerge(snapshot);
      await pushAll(uid, merged);
      return true;
    } catch (err) {
      if (isSchemaError(err)) {
        console.warn(
          '[sync] Esquema de Supabase no migrado — ejecutá supabase/migrations/0001_entities_and_rls.sql. Modo local-only activado.',
        );
        syncDisabled = true;
        return true;
      }
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[sync] Intento ${attempt + 1}/${MAX_RETRIES} fallido, reintentando en ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  console.error('[sync] Todos los reintentos fallaron:', lastError);
  return false;
}

// ── Import legacy ──

/** Marca el import como completado y limpia los blobs legacy del perfil.
 *  savings_goal es columna NUMERIC en la DB real (herencia de v5) → null, no []. */
async function clearLegacyBlobs(uid: string): Promise<void> {
  const { error: updateError } = await supabase!.from('profiles').update({
    legacy_imported: true,
    expenses: [],
    reminders: [],
    savings_goal: null,
    custom_expense_categories: [],
    custom_income_categories: [],
    budgets: {},
    last_synced_at: null,
  }).eq('id', uid);
  if (updateError) {
    console.warn('[sync] No se pudo limpiar profiles:', updateError);
  }
}

async function maybeImportLegacy(uid: string): Promise<boolean> {
  const { data: profile, error } = await supabase!.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!profile) return false;

  const snapshot = await pullAll(uid);
  const tablesEmpty =
    snapshot.expenses.length === 0 &&
    snapshot.reminders.length === 0 &&
    snapshot.categories.length === 0 &&
    snapshot.goals.length === 0 &&
    snapshot.budgets.length === 0;

  if (!shouldImportLegacy(profile as LegacyProfileRow, tablesEmpty)) {
    // ¿La data ya está en las tablas pero la limpieza quedó pendiente?
    // (caso del import cuya fase de datos completó pero el update de perfiles
    // falló antes del fix de savings_goal null). Limpiar SIN re-importar.
    if (!profile.legacy_imported && !tablesEmpty) {
      await clearLegacyBlobs(uid);
    }
    return false;
  }

  let rows: Awaited<ReturnType<typeof buildImportRows>>;
  try {
    rows = await buildImportRows(profile as LegacyProfileRow, uid);
  } catch (err) {
    // Nunca limpiar blobs si el import no completó: se reintenta en el próximo login
    console.error('[sync] Import legacy falló — los blobs NO se limpiaron (se reintentará):', err);
    return false;
  }
  await upsert('expenses', rows.expenses.map((t) => expenseToRow(t, uid)), 'id');
  await upsert('reminders', rows.reminders.map((r) => reminderToRow(r, uid)), 'id');
  await upsert('categories', [
    ...rows.expenseCategories.map((c) => categoryToRow(c, uid, 'expense')),
    ...rows.incomeCategories.map((c) => categoryToRow(c, uid, 'income')),
  ], 'id');
  await upsert('savings_goals', rows.goals.map((g) => goalToRow(g, uid)), 'id');
  await upsert('budgets', rows.budgets.map((b) => ({
    user_id: uid,
    month: b.month,
    amount: b.amount,
    updated_at: b.updated_at,
  })), 'user_id,month');

  // Marcar completado y limpiar blobs SOLO al final (el import es idempotente)
  await clearLegacyBlobs(uid);
  return true;
}

// ── Servicio público ──

export const syncService = {
  /** Registra listeners de ciclo de vida y la suscripción al store (una sola vez). */
  init(): void {
    if (initialized) return;
    initialized = true;

    // ALT-3: flush del último cambio al cerrar/ocultar la pestaña o al volver online
    window.addEventListener('pagehide', () => {
      void syncService.flush();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void syncService.flush();
    });
    window.addEventListener('online', () => {
      void syncService.flush();
    });

    // Auto-save: cualquier cambio de datos agenda un push (debounced)
    useFinanceStore.subscribe((state, prev) => {
      if (!userId || syncDisabled) return;
      const dataChanged =
        state.expenses !== prev.expenses ||
        state.budgets !== prev.budgets ||
        state.budgetUpdatedAt !== prev.budgetUpdatedAt ||
        state.reminders !== prev.reminders ||
        state.savingsGoals !== prev.savingsGoals ||
        state.customExpenseCategories !== prev.customExpenseCategories ||
        state.customIncomeCategories !== prev.customIncomeCategories ||
        state.tombstones !== prev.tombstones;
      if (!dataChanged) return;
      if (isSyncing) {
        dirtyDuringSync = true;
        return;
      }
      void syncService.schedule();
    });
  },

  /** Login: import legacy (si aplica) → pull → merge → push. */
  async attach(uid: string): Promise<void> {
    userId = uid;
    if (!supabase || syncDisabled) return;
    try {
      await maybeImportLegacy(uid);
      await performPush();
    } catch (err) {
      console.error('[sync] attach falló:', err);
      if (isSchemaError(err)) {
        console.warn(
          '[sync] Esquema de Supabase no migrado — ejecutá supabase/migrations/0001_entities_and_rls.sql. Modo local-only activado.',
        );
        syncDisabled = true;
      }
    }
  },

  /** Agenda un push (debounce 800ms). Misma firma que el saveData original. */
  schedule(): Promise<boolean> {
    if (!supabase || syncDisabled) return Promise.resolve(true);
    if (!userId) return Promise.resolve(true);
    if (timer) clearTimeout(timer);
    return new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        timer = null;
        void performPush().then(resolve);
      }, DEBOUNCE_MS);
    });
  },

  /** Cancela el timer pendiente y pushea de inmediato (single-flight). */
  flush(): Promise<boolean> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return performPush();
  },

  /** Cancela el timer sin pushear. */
  cancel(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  },

  /** Logout: cancela pendientes y suelta el usuario. NO pushea (el flush
   *  explícito va antes en signOut). */
  detach(): void {
    syncService.cancel();
    queuedAfterPush = false;
    dirtyDuringSync = false;
    userId = null;
  },

  /** Desactiva el sync definitivamente (esquema no migrado). */
  disable(): void {
    syncDisabled = true;
    syncService.cancel();
  },
};

async function performPush(): Promise<boolean> {
  if (pushInFlight) {
    queuedAfterPush = true;
    return pushInFlight;
  }
  if (!supabase || syncDisabled) return true;
  const uid = userId;
  if (!uid) return true;

  pushInFlight = (async (): Promise<boolean> => {
    let ok = false;
    try {
      isSyncing = true;
      ok = await pushWithRetry(uid);
    } catch (err) {
      console.error('[sync] push falló:', err);
    } finally {
      isSyncing = false;
      pushInFlight = null;
      if (queuedAfterPush) {
        queuedAfterPush = false;
        void performPush();
      } else if (dirtyDuringSync) {
        dirtyDuringSync = false;
        void syncService.schedule();
      }
    }
    return ok;
  })();

  return pushInFlight;
}
