// ================================================================
// SYNC SERVICE — pull-then-push con merge determinista por fila
// Singleton: un solo timer debounced (800ms), flush centralizado,
// single-flight, reintentos con backoff y modo local-only si el
// esquema de Supabase no fue migrado.
// ================================================================

import { supabase } from '@/config/supabase';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
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

// ── Marca de agua del push (DAT-01) ──
//
// pushAll() subía TODAS las filas vivas de las cinco tablas en cada ciclo, sin
// distinguir qué había cambiado. Con 200 movimientos es imperceptible; con
// 2000 —tres años de uso— cada guardado movía megabytes, y el debounce de
// 800ms hace que ocurra a menudo: batería, plan de datos y cuota de Supabase.
//
// Ahora solo se suben las filas con `updated_at` posterior al último push
// confirmado. Es deliberadamente conservador y solo se aplica al PUSH:
//
//   · Subir de más es inofensivo (el trigger keep_newest de la migración 0004
//     descarta lo rancio y el upsert es idempotente).
//   · Subir de menos sí perdería datos — por eso cada `attach` (login) fuerza
//     un push completo que reconcilia cualquier divergencia acumulada.
//   · El PULL sigue siendo completo: leer de menos dejaría al cliente con un
//     snapshot incompleto y el merge podría interpretar filas ausentes como
//     inexistentes. Ese lado necesita un diseño aparte.
let pushWatermark: string | null = null;

function watermarkKey(uid: string): string {
  return `foresight-sync-watermark:${uid}`;
}

function loadWatermark(uid: string): string | null {
  try {
    return localStorage.getItem(watermarkKey(uid));
  } catch {
    return null; // modo privado de Safari, cuota llena, etc.
  }
}

function saveWatermark(uid: string, at: string): void {
  pushWatermark = at;
  try {
    localStorage.setItem(watermarkKey(uid), at);
  } catch {
    // Sin persistencia solo se pierde la optimización: el próximo arranque
    // hará un push completo, que es el comportamiento anterior.
  }
}

function clearWatermark(uid: string): void {
  pushWatermark = null;
  try {
    localStorage.removeItem(watermarkKey(uid));
  } catch { /* ignorar */ }
}

/** ¿Error de esquema PERMANENTE? (tabla/columna inexistente — SQL de migración
 *  no ejecutado). Estos sí deben desactivar el sync hasta que se corrija a mano. */
export function isSchemaError(err: unknown): boolean {
  const e = err as { code?: string } | null;
  if (!e?.code) return false;
  return e.code === '42P01' || e.code === '42703';
}

/** ¿Caché de esquema de PostgREST desactualizada? (PGRST205). Es TRANSITORIO:
 *  ocurre tras cualquier DDL, redeploy o reinicio del proyecto Supabase y se
 *  resuelve solo en segundos/minutos. NUNCA debe desactivar el sync de forma
 *  permanente — antes lo hacía (bug), lo que dejaba a un usuario en modo
 *  local-only para siempre por un solo golpe transitorio. */
export function isTransientSchemaError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'PGRST205';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TableName = 'expenses' | 'categories' | 'savings_goals' | 'budgets';

// ── Pull ──

// PostgREST (Supabase) limita cualquier select sin `range` a 1000 filas por
// defecto. Sin paginar, una cuenta con más de 1000 movimientos pierde
// silenciosamente el resto del historial en cada pull — y sin `order by`
// estable, ni siquiera es determinista CUÁLES 1000 filas llegan entre un
// pull y el siguiente.
const PAGE_SIZE = 1000;

/** Trae TODAS las filas de una tabla para un usuario, paginando en bloques
 *  de PAGE_SIZE con un orden estable (para que el corte entre páginas sea
 *  siempre el mismo, incluso si hay escrituras concurrentes). */
async function fetchAllRows<T>(
  table: TableName,
  uid: string,
  orderColumns: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase!.from(table).select('*').eq('user_id', uid);
    for (const col of orderColumns) {
      query = query.order(col, { ascending: true });
    }
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

/** A partir de aquí el desfase deja de ser ruido de red y es el reloj. */
const DESFASE_TOLERADO_MS = 5 * 60_000;

/**
 * Minutos que el reloj local va por detrás, deducidos de los datos que ya
 * bajamos. Devuelve 0 si no hay motivo de alarma.
 *
 * `updated_at` lo pone el CLIENTE (`nowIso()`), no el servidor. Un dispositivo
 * con el reloj atrasado genera ediciones con marca anterior a la que ya hay en
 * la base; el trigger `keep_newest` las descarta —correctamente, según su
 * criterio— y el siguiente pull le pisa su propio cambio. Todo en silencio.
 *
 * Arreglarlo de raíz obliga a sellar la marca en el servidor, lo que cambia el
 * contrato del merge. Mientras tanto, al menos que no sea invisible: si en el
 * servidor hay filas con fecha futura respecto a este reloj, o vamos
 * atrasados, o hay otro dispositivo adelantado. Ambas cosas conviene saberlas.
 */
export function desfaseDeRelojMinutos(snapshot: Snapshot, ahoraMs = Date.now()): number {
  let masNueva = 0;
  const mirar = (filas: { updated_at?: string | null }[]) => {
    for (const f of filas) {
      if (!f.updated_at) continue;
      const t = Date.parse(f.updated_at);
      if (!Number.isNaN(t) && t > masNueva) masNueva = t;
    }
  };
  mirar(snapshot.expenses);
  mirar(snapshot.categories);
  mirar(snapshot.goals);
  mirar(snapshot.budgets);

  const adelanto = masNueva - ahoraMs;
  return adelanto > DESFASE_TOLERADO_MS ? Math.round(adelanto / 60_000) : 0;
}

/** Un aviso por sesión: repetirlo en cada sync sería insoportable. */
let avisoDeRelojDado = false;

function avisarSiElRelojVaMal(snapshot: Snapshot) {
  if (avisoDeRelojDado) return;
  const minutos = desfaseDeRelojMinutos(snapshot);
  if (minutos === 0) return;
  avisoDeRelojDado = true;
  console.warn(`[sync] Reloj local desfasado ~${minutos} min respecto a los datos del servidor.`);
  useUiStore
    .getState()
    .addToast(
      'La hora de este dispositivo parece incorrecta. Revísala: algunos cambios podrían no guardarse.',
      'error',
    );
}

async function pullAll(uid: string): Promise<Snapshot> {
  const [expenses, categories, goals, budgets] = await Promise.all([
    fetchAllRows<ExpenseRow>('expenses', uid, ['updated_at', 'id']),
    fetchAllRows<CategoryRow>('categories', uid, ['updated_at', 'id']),
    fetchAllRows<GoalRow>('savings_goals', uid, ['updated_at', 'id']),
    // budgets no tiene columna `id` (PK compuesta user_id+month) — `month`
    // ya es único por usuario, así que sirve como desempate estable.
    fetchAllRows<BudgetRow>('budgets', uid, ['month']),
  ]);

  const snapshot = { expenses, categories, goals, budgets };
  avisarSiElRelojVaMal(snapshot);
  return snapshot;
}

// ── Merge ──

interface MergeResult {
  expenses: MergeSet<Transaction>;
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
    ...goalsUniverse,
    ...expCatsUniverse,
    ...incCatsUniverse,
  ]);
  const flatTombstones = { ...state.tombstones };
  allUniverse.forEach((id) => delete flatTombstones[id]);
  Object.assign(
    flatTombstones,
    expenses.tombstones,
    goals.tombstones,
    expenseCategories.tombstones,
    incomeCategories.tombstones,
  );

  // Poda de tombstones antiguos (> 30 días) para evitar acumulación infinita.
  // Solo se podan los que el SERVIDOR ya confirmó como borrados (aparecen en
  // el snapshot remoto). Antes se podaba por antigüedad ciega: un dispositivo
  // que borra offline y no sincroniza en 30+ días perdía su tombstone local,
  // y al reconectar la fila viva del servidor ganaba el merge — el gasto
  // borrado resucitaba en silencio.
  const remoteTombstoneIds = new Set<string>([
    ...Object.keys(remoteExpenses.tombstones),
    ...Object.keys(remoteGoals.tombstones),
    ...Object.keys(remoteExpCats.tombstones),
    ...Object.keys(remoteIncCats.tombstones),
  ]);
  const PRUNE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
  const pruneBeforeIso = new Date(Date.now() - PRUNE_THRESHOLD_MS).toISOString();
  for (const [id, deletedAt] of Object.entries(flatTombstones)) {
    if (deletedAt < pruneBeforeIso && remoteTombstoneIds.has(id)) {
      delete flatTombstones[id];
    }
  }

  // Solo notificar si algo cambió (evita loops de sync subscribe→push)
  const next = {
    expenses: expenses.live,
    savingsGoals: goals.live,
    customExpenseCategories: expenseCategories.live,
    customIncomeCategories: incomeCategories.live,
    tombstones: flatTombstones,
    budgets: budgets.budgets,
    budgetUpdatedAt: budgets.updatedAt,
  };
  const current = {
    expenses: state.expenses,
    savingsGoals: state.savingsGoals,
    customExpenseCategories: state.customExpenseCategories,
    customIncomeCategories: state.customIncomeCategories,
    tombstones: state.tombstones,
    budgets: state.budgets,
    budgetUpdatedAt: state.budgetUpdatedAt,
  };
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    useFinanceStore.setState((currentState) => {
      // Preservar mutaciones locales que pudieron haber ocurrido mientras se
      // procesaba el merge: si una fila local no salió viva del merge y tampoco
      // tiene tombstone, es que se creó durante el ciclo — se conserva.
      const keepLocalAdditions = <T extends { id: string }>(merged: T[], local: T[]): T[] => {
        const mergedIds = new Set(merged.map((i) => i.id));
        const out = [...merged];
        for (const item of local) {
          if (!mergedIds.has(item.id) && !next.tombstones[item.id]) out.push(item);
        }
        return out;
      };

      return {
        ...next,
        expenses: keepLocalAdditions(next.expenses, currentState.expenses),
        savingsGoals: keepLocalAdditions(next.savingsGoals, currentState.savingsGoals),
        customExpenseCategories: keepLocalAdditions(
          next.customExpenseCategories,
          currentState.customExpenseCategories,
        ),
        customIncomeCategories: keepLocalAdditions(
          next.customIncomeCategories,
          currentState.customIncomeCategories,
        ),
      };
    });
  }

  return { expenses, goals, expenseCategories, incomeCategories, budgets, flatTombstones };
}

// ── Push ──
// (TableName está definido arriba, junto a fetchAllRows/pullAll — se reutiliza acá)

async function upsert(
  table: TableName,
  rows: object[],
  onConflict: string,
  ignoreDuplicates = false,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase!.from(table).upsert(rows, { onConflict, ignoreDuplicates });
  if (error) throw error;
}

/**
 * @param since  marca de agua: solo se suben filas con `updated_at` posterior.
 *               `null` = push completo (primer push de la sesión).
 */
async function pushAll(uid: string, merged: MergeResult, since: string | null): Promise<void> {
  // Comparación lexicográfica: los ISO-8601 en UTC ordenan igual como texto
  // que como fecha, así que no hace falta parsear.
  //
  // `>=` y no `>`: una fila modificada en el MISMO milisegundo en que se tomó
  // la marca de agua quedaría fuera con la comparación estricta y no se
  // subiría nunca. Con `>=` esa fila se reenvía una vez de más —inofensivo,
  // el upsert es idempotente y keep_newest descarta lo rancio— en vez de
  // perderse.
  const changed = (updatedAt: string): boolean => since === null || updatedAt >= since;

  const tombstoneRows = (tombstones: Record<string, string>): object[] =>
    Object.entries(tombstones)
      .filter(([, at]) => changed(at))
      .map(([id, at]) => ({
        id,
        user_id: uid,
        updated_at: at,
        deleted_at: at,
      }));

  // onConflict 'user_id,id' en las cuatro tablas: desde la migración 0005 la
  // PK es compuesta, de modo que dos cuentas pueden compartir un mismo `id`
  // sin que el upsert de una choque contra la fila —invisible por RLS— de la otra.
  await upsert('expenses', [
    ...merged.expenses.live.filter((t) => changed(t.updated_at)).map((t) => expenseToRow(t, uid)),
    ...tombstoneRows(merged.expenses.tombstones),
  ], 'user_id,id');

  await upsert('categories', [
    ...merged.expenseCategories.live
      .filter((c) => changed(c.updated_at ?? ''))
      .map((c) => categoryToRow(c, uid, 'expense')),
    ...merged.incomeCategories.live
      .filter((c) => changed(c.updated_at ?? ''))
      .map((c) => categoryToRow(c, uid, 'income')),
    ...tombstoneRows(merged.expenseCategories.tombstones),
    ...tombstoneRows(merged.incomeCategories.tombstones),
  ], 'user_id,id');

  await upsert('savings_goals', [
    ...merged.goals.live.filter((g) => changed(g.updated_at)).map((g) => goalToRow(g, uid)),
    ...tombstoneRows(merged.goals.tombstones),
  ], 'user_id,id');

  await upsert('budgets', Object.entries(merged.budgets.budgets)
    .filter(([month]) => changed(merged.budgets.updatedAt[month] ?? ''))
    .map(([month, amount]) => ({
      user_id: uid,
      month,
      amount,
      updated_at: merged.budgets.updatedAt[month] ?? nowIso(),
    })), 'user_id,month');
}

/** Pull → merge → push con reintentos por red. Los errores de esquema
 *  desactivan el sync (modo local-only) sin reintentar. */
async function pushWithRetry(uid: string, fullPush = false): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Se marca ANTES del pull: cualquier edición que ocurra durante el ciclo
      // queda por encima de la marca y entra en el push siguiente en vez de
      // caer en la grieta entre "ya sincronizado" y "aún no".
      const startedAt = nowIso();
      const since = fullPush ? null : pushWatermark;

      const snapshot = await pullAll(uid);
      const merged = applyMerge(snapshot);
      await pushAll(uid, merged, since);

      saveWatermark(uid, startedAt);
      return true;
    } catch (err) {
      if (isSchemaError(err)) {
        console.warn(
          '[sync] Esquema de Supabase no migrado — ejecutá supabase/migrations/0001_entities_and_rls.sql. Modo local-only activado.',
        );
        syncDisabled = true;
        useUiStore.getState().setSyncState('local-only');
        return true;
      }
      lastError = err;
      if (isTransientSchemaError(err)) {
        // Caché de esquema de PostgREST desactualizada: NO se desactiva el
        // sync, solo se reintenta como cualquier otro error de red.
        console.warn(`[sync] Caché de esquema desactualizada (transitorio), reintento ${attempt + 1}/${MAX_RETRIES}...`);
      }
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

/** Marca el import como completado. Las columnas de blobs legacy se
 *  eliminaron en la migración 0003: solo queda fijar el flag. */
async function clearLegacyBlobs(uid: string): Promise<void> {
  const { error: updateError } = await supabase!.from('profiles').update({
    legacy_imported: true,
  }).eq('id', uid);
  if (updateError) {
    console.warn('[sync] No se pudo marcar el import en profiles:', updateError);
  }
}

async function maybeImportLegacy(uid: string): Promise<boolean> {
  const { data: profile, error } = await supabase!.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!profile) return false;

  if (!shouldImportLegacy(profile as LegacyProfileRow)) {
    // Nada que migrar (o ya migrado): si el flag quedó pendiente, marcarlo
    if (!profile.legacy_imported) {
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

  // Idempotente por clave: los ids son UUID v5 deterministas y los upserts usan
  // ignoreDuplicates — filas existentes (vivas o tombstone) NO se pisan ni se
  // resucitan; solo se inserta lo que falta (cubre imports parciales fallidos).
  await upsert('expenses', rows.expenses.map((t) => expenseToRow(t, uid)), 'user_id,id', true);
  await upsert('categories', [
    ...rows.expenseCategories.map((c) => categoryToRow(c, uid, 'expense')),
    ...rows.incomeCategories.map((c) => categoryToRow(c, uid, 'income')),
  ], 'user_id,id', true);
  await upsert('savings_goals', rows.goals.map((g) => goalToRow(g, uid)), 'user_id,id', true);
  await upsert('budgets', rows.budgets.map((b) => ({
    user_id: uid,
    month: b.month,
    amount: b.amount,
    updated_at: b.updated_at,
  })), 'user_id,month', true);

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
    pushWatermark = loadWatermark(uid);
    try {
      await maybeImportLegacy(uid);
      // Push COMPLETO al iniciar sesión: reconcilia cualquier fila que el
      // filtrado incremental pudiera haber dejado atrás (un push fallido tras
      // agotar reintentos, un dispositivo que estuvo offline mucho tiempo).
      // Es la red de seguridad que hace defendible el filtrado del resto de
      // los ciclos.
      await performPush(true);
    } catch (err) {
      console.error('[sync] attach falló:', err);
      if (isSchemaError(err)) {
        console.warn(
          '[sync] Esquema de Supabase no migrado — ejecutá supabase/migrations/0001_entities_and_rls.sql. Modo local-only activado.',
        );
        syncDisabled = true;
        useUiStore.getState().setSyncState('local-only');
      } else if (isTransientSchemaError(err)) {
        console.warn('[sync] Caché de esquema desactualizada (transitorio) al adjuntar — se reintentará en el próximo cambio.');
        useUiStore.getState().setSyncState('error');
      } else {
        useUiStore.getState().setSyncState('error');
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
   *  explícito va antes en signOut). Resetea syncDisabled: es un flag por
   *  SESIÓN — antes sobrevivía al logout y contaminaba la cuenta siguiente
   *  que iniciara sesión en la misma pestaña. */
  detach(): void {
    syncService.cancel();
    queuedAfterPush = false;
    dirtyDuringSync = false;
    // Borrar la marca de agua junto con el resto del estado de sesión: el
    // logout limpia los datos locales, así que conservarla solo abriría la
    // puerta a que el próximo login filtrara contra una referencia obsoleta.
    if (userId) clearWatermark(userId);
    pushWatermark = null;
    userId = null;
    syncDisabled = false;
    useUiStore.getState().setSyncState('idle');
  },

  /** Desactiva el sync definitivamente (esquema no migrado). */
  disable(): void {
    syncDisabled = true;
    syncService.cancel();
    useUiStore.getState().setSyncState('local-only');
  },
};

async function performPush(fullPush = false): Promise<boolean> {
  if (pushInFlight) {
    queuedAfterPush = true;
    return pushInFlight;
  }
  if (!supabase || syncDisabled) return true;
  const uid = userId;
  if (!uid) return true;

  pushInFlight = (async (): Promise<boolean> => {
    let ok = false;
    useUiStore.getState().setSyncState('syncing');
    try {
      isSyncing = true;
      ok = await pushWithRetry(uid, fullPush);
    } catch (err) {
      console.error('[sync] push falló:', err);
    } finally {
      isSyncing = false;
      pushInFlight = null;
      // pushWithRetry ya dejó 'local-only' si el esquema no está migrado —
      // no pisarlo con 'idle'/'error' en ese caso.
      if (!syncDisabled) {
        useUiStore.getState().setSyncState(ok ? 'idle' : 'error');
      }
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
