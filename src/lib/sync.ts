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
import { reportarError } from '@/lib/error-reporter';
import { getTodayISO } from '@/lib/utils';
import {
  shouldImportLegacy,
  buildImportRows,
  type LegacyProfileRow,
} from '@/lib/legacy-import';
import type {
  Recurrence,
  Frecuencia,
  Transaction,
  Category,
  SavingsGoal,
  Account,
  AccountKind,
  Debt,
  DebtKind,
  Settings,
  Asset,
  AssetGroup,
  NetWorthSnapshot,
  BudgetLine,
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

interface ExpenseRow {
  id: string;
  user_id: string;
  type: string | null;
  amount: number | null;
  concept: string | null;
  date: string | null;
  category: string | null;
  method: string | null;
  business_type: string | null;
  account_id: string | null;
  to_account_id: string | null;
  recurrence_id: string | null;
  /** 0018. Opcional en la forma: filas de antes de la migración no la traen. */
  debt_id?: string | null;
  created_at: string | null;
  updated_at: string;
  deleted_at: string | null;
}

interface AccountRow {
  id: string;
  user_id: string;
  name: string | null;
  kind: string | null;
  initial_balance: number | null;
  updated_at: string;
  deleted_at: string | null;
}

interface DebtRow {
  id: string;
  user_id: string;
  name: string | null;
  tag: string | null;
  kind: string | null;
  balance: number | null;
  annual_rate: number | null;
  min_payment: number | null;
  pay_day: number | null;
  updated_at: string;
  deleted_at: string | null;
}

interface AssetRow {
  id: string;
  user_id: string;
  name: string | null;
  tag: string | null;
  "group": string | null;
  value: number | null;
  updated_at: string;
  deleted_at: string | null;
}

interface NetWorthRow {
  user_id: string;
  month: string;
  assets: number | null;
  liabilities: number | null;
  net: number | null;
  updated_at: string;
}

interface BudgetLineRow {
  id: string;
  user_id: string;
  tag: string | null;
  kind: string | null;
  category_id: string | null;
  "limit": number | null;
  plan: Record<string, number> | null;
  updated_at: string;
  deleted_at: string | null;
}

interface RecurrenceRow {
  id: string;
  user_id: string;
  type: string | null;
  amount: number | null;
  concept: string | null;
  category: string | null;
  method: string | null;
  business_type: string | null;
  account_id: string | null;
  to_account_id: string | null;
  frecuencia: string | null;
  intervalo: number | null;
  dia_mes: number | null;
  desde: string | null;
  hasta: string | null;
  activa: boolean | null;
  ultima_generada: string | null;
  updated_at: string;
  deleted_at: string | null;
}

interface SettingsRow {
  user_id: string;
  debt_method: string | null;
  extra_payment: number | null;
  net_worth_goal: number | null;
  updated_at: string;
}

interface CategoryRow {
  id: string;
  user_id: string;
  kind: 'expense' | 'income';
  label: string | null;
  icon: string | null;
  color: string | null;
  "group": string | null;
  updated_at: string;
  deleted_at: string | null;
}

interface GoalRow {
  id: string;
  user_id: string;
  concept: string | null;
  target: number | null;
  tag: string | null;
  target_date: string | null;
  saved: number | null;
  saved_from_accounts: number | null;
  updated_at: string;
  deleted_at: string | null;
}

interface BudgetRow {
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
  accounts: AccountRow[];
  debts: DebtRow[];
  settings: SettingsRow[];
  assets: AssetRow[];
  networth: NetWorthRow[];
  budgetLines: BudgetLineRow[];
  recurrences: RecurrenceRow[];
}

// ── Convertidores locales ↔ filas ──

function expenseToRow(t: Transaction, userId: string): ExpenseRow {
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
    account_id: t.accountId ?? null,
    to_account_id: t.toAccountId ?? null,
    recurrence_id: t.recurrenceId ?? null,
    debt_id: t.debtId ?? null,
    created_at: t.created_at ?? null,
    updated_at: t.updated_at,
    deleted_at: null,
  };
}

function rowToExpense(r: ExpenseRow): Transaction {
  return {
    id: r.id,
    type: (r.type === 'income' || r.type === 'expense' || r.type === 'transfer' ? r.type : 'expense') as TransactionType,
    amount: r.amount ?? 0,
    concept: r.concept ?? '',
    date: r.date ?? getTodayISO(),
    category: r.category ?? 'general',
    method: (r.method === 'cash' || r.method === 'card' || r.method === 'transfer' ? r.method : 'cash') as PaymentMethod,
    businessType: (r.business_type === 'business' || r.business_type === 'personal' ? r.business_type : 'personal') as BusinessType,
    accountId: r.account_id ?? null,
    toAccountId: r.to_account_id ?? null,
    recurrenceId: r.recurrence_id ?? null,
    // Como created_at: la clave solo existe si hay deuda, para que un
    // movimiento sin deuda sea estructuralmente igual a su copia local.
    ...(r.debt_id ? { debtId: r.debt_id } : {}),
    // La clave solo aparece si hay valor: con `created_at: undefined` el objeto
    // tenía una clave más que su equivalente local y igualEstructural (que
    // compara el número de claves) daba "distinto" en cada ciclo, disparando
    // un setState inútil que volvía a marcar el estado como sucio.
    ...(r.created_at ? { created_at: r.created_at } : {}),
    updated_at: r.updated_at,
  };
}

const ACCOUNT_KINDS_VALIDOS: AccountKind[] = ['Efectivo', 'Banco', 'Tarjeta', 'Ahorros'];

function accountToRow(a: Account, userId: string): AccountRow {
  return {
    id: a.id,
    user_id: userId,
    name: a.name,
    kind: a.kind,
    initial_balance: a.initialBalance,
    updated_at: a.updated_at,
    deleted_at: null,
  };
}

const DEBT_KINDS_VALIDOS: DebtKind[] = ['Tarjeta de crédito', 'Préstamo', 'Hipoteca', 'Otro'];

function debtToRow(d: Debt, userId: string): DebtRow {
  return {
    id: d.id,
    user_id: userId,
    name: d.name,
    tag: d.tag,
    kind: d.kind,
    balance: d.balance,
    annual_rate: d.annualRate,
    min_payment: d.minPayment,
    pay_day: d.payDay,
    updated_at: d.updated_at,
    deleted_at: null,
  };
}

function rowToDebt(r: DebtRow): Debt {
  return {
    id: r.id,
    name: r.name ?? '',
    tag: r.tag === 'business' ? 'business' : 'personal',
    kind: (DEBT_KINDS_VALIDOS.includes(r.kind as DebtKind) ? r.kind : 'Otro') as DebtKind,
    balance: Number(r.balance ?? 0),
    annualRate: Number(r.annual_rate ?? 0),
    minPayment: Number(r.min_payment ?? 0),
    payDay: r.pay_day ?? null,
    updated_at: r.updated_at,
  };
}

const ASSET_GROUPS_VALIDOS: AssetGroup[] = ['Inversiones', 'Propiedades', 'Otros activos'];

function assetToRow(a: Asset, userId: string): AssetRow {
  return { id: a.id, user_id: userId, name: a.name, tag: a.tag, group: a.group, value: a.value, updated_at: a.updated_at, deleted_at: null };
}

function rowToAsset(r: AssetRow): Asset {
  return {
    id: r.id,
    name: r.name ?? '',
    tag: r.tag === 'business' ? 'business' : 'personal',
    group: (ASSET_GROUPS_VALIDOS.includes(r.group as AssetGroup) ? r.group : 'Otros activos') as AssetGroup,
    value: Number(r.value ?? 0),
    updated_at: r.updated_at,
  };
}

function netWorthToRow(n: NetWorthSnapshot, userId: string): NetWorthRow {
  return { user_id: userId, month: n.month, assets: n.assets, liabilities: n.liabilities, net: n.net, updated_at: n.updated_at };
}

function rowToNetWorth(r: NetWorthRow): NetWorthSnapshot {
  return { month: r.month, assets: Number(r.assets ?? 0), liabilities: Number(r.liabilities ?? 0), net: Number(r.net ?? 0), updated_at: r.updated_at };
}

/** Cierres por mes: unión, y en cada mes gana el updated_at más nuevo. */
function mergeNetWorth(local: NetWorthSnapshot[], remote: NetWorthSnapshot[]): NetWorthSnapshot[] {
  const porMes = new Map<string, NetWorthSnapshot>();
  for (const n of local) porMes.set(n.month, n);
  for (const r of remote) {
    const l = porMes.get(r.month);
    if (!l || r.updated_at > l.updated_at) porMes.set(r.month, r);
  }
  return [...porMes.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function budgetLineToRow(l: BudgetLine, userId: string): BudgetLineRow {
  return { id: l.id, user_id: userId, tag: l.tag, kind: l.kind, category_id: l.categoryId, limit: l.limit, plan: l.plan, updated_at: l.updated_at, deleted_at: null };
}

function rowToBudgetLine(r: BudgetLineRow): BudgetLine {
  const plan: Record<string, number> = {};
  if (r.plan && typeof r.plan === 'object') {
    for (const [k, v] of Object.entries(r.plan)) {
      const n = Number(v);
      if (/^\d{4}-\d{2}$/.test(k) && Number.isFinite(n) && n > 0) plan[k] = n;
    }
  }
  return {
    id: r.id,
    tag: r.tag === 'business' ? 'business' : 'personal',
    kind: r.kind === 'income' ? 'income' : 'expense',
    categoryId: r.category_id ?? 'general',
    limit: Number(r.limit ?? 0),
    plan,
    updated_at: r.updated_at,
  };
}

const FRECUENCIAS_VALIDAS: Frecuencia[] = ['daily', 'weekly', 'monthly'];

function recurrenceToRow(r: Recurrence, userId: string): RecurrenceRow {
  return {
    id: r.id,
    user_id: userId,
    type: r.type,
    amount: r.amount,
    concept: r.concept,
    category: r.category,
    method: r.method,
    business_type: r.businessType,
    account_id: r.accountId ?? null,
    to_account_id: r.toAccountId ?? null,
    frecuencia: r.frecuencia,
    intervalo: r.intervalo,
    dia_mes: r.diaMes,
    desde: r.desde,
    hasta: r.hasta,
    activa: r.activa,
    ultima_generada: r.ultimaGenerada,
    updated_at: r.updated_at,
    deleted_at: null,
  };
}

function rowToRecurrence(r: RecurrenceRow): Recurrence {
  const dia = Number(r.dia_mes);
  return {
    id: r.id,
    type: (r.type === 'income' || r.type === 'expense' || r.type === 'transfer' ? r.type : 'expense') as TransactionType,
    amount: Number(r.amount ?? 0),
    concept: r.concept ?? '',
    category: r.category ?? 'general',
    method: (r.method === 'cash' || r.method === 'card' || r.method === 'transfer' ? r.method : 'cash') as PaymentMethod,
    businessType: (r.business_type === 'business' ? 'business' : 'personal') as BusinessType,
    accountId: r.account_id ?? null,
    toAccountId: r.to_account_id ?? null,
    frecuencia: (FRECUENCIAS_VALIDAS.includes(r.frecuencia as Frecuencia) ? r.frecuencia : 'monthly') as Frecuencia,
    intervalo: Math.max(1, Math.floor(Number(r.intervalo ?? 1)) || 1),
    diaMes: Number.isFinite(dia) && dia >= 1 && dia <= 31 ? dia : null,
    desde: r.desde ?? getTodayISO(),
    hasta: r.hasta ?? null,
    activa: r.activa !== false,
    ultimaGenerada: r.ultima_generada ?? null,
    updated_at: r.updated_at,
  };
}

function settingsToRow(s: Settings, userId: string): SettingsRow {
  return {
    user_id: userId,
    debt_method: s.debtMethod,
    extra_payment: s.extraPayment,
    net_worth_goal: s.netWorthGoal,
    updated_at: s.updated_at,
  };
}

function rowToSettings(r: SettingsRow): Settings {
  return {
    debtMethod: r.debt_method === 'avalanche' ? 'avalanche' : 'snowball',
    extraPayment: Number(r.extra_payment ?? 0),
    netWorthGoal: Number(r.net_worth_goal ?? 0),
    updated_at: r.updated_at,
  };
}

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name ?? '',
    kind: (ACCOUNT_KINDS_VALIDOS.includes(r.kind as AccountKind) ? r.kind : 'Banco') as AccountKind,
    initialBalance: Number(r.initial_balance ?? 0),
    updated_at: r.updated_at,
  };
}

function categoryToRow(c: Category, userId: string, kind: 'expense' | 'income'): CategoryRow {
  return {
    id: c.id,
    user_id: userId,
    kind,
    label: c.label,
    icon: c.icon,
    color: c.color,
    group: c.group ?? null,
    updated_at: c.updated_at ?? nowIso(),
    deleted_at: null,
  };
}

function rowToCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    label: r.label ?? '',
    icon: r.icon ?? '📌',
    color: r.color ?? 'bg-slate-100 text-slate-600',
    group: r.group ?? undefined,
    updated_at: r.updated_at,
  };
}

function goalToRow(g: SavingsGoal, userId: string): GoalRow {
  return {
    id: g.id,
    user_id: userId,
    concept: g.concept,
    target: g.target,
    tag: g.tag,
    target_date: g.targetDate,
    saved: g.saved,
    saved_from_accounts: g.savedFromAccounts,
    updated_at: g.updated_at,
    deleted_at: null,
  };
}

function rowToGoal(r: GoalRow): SavingsGoal {
  return {
    id: r.id,
    concept: r.concept ?? '',
    target: r.target ?? 0,
    tag: r.tag === 'business' ? 'business' : 'personal',
    targetDate: r.target_date ?? null,
    saved: Number(r.saved ?? 0),
    savedFromAccounts: Number(r.saved_from_accounts ?? 0),
    updated_at: r.updated_at,
  };
}

// ── Estado interno del singleton ──

let userId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
// Promesa compartida del ciclo debounced en curso: sin esto, cada schedule()
// creaba su propia promesa pero solo el temporizador de la ÚLTIMA llamada
// dentro de la ráfaga llegaba a resolver algo — las anteriores quedaban
// pendientes para siempre (ni resueltas ni rechazadas), así que sus
// llamadores nunca se enteraban de si el push terminó bien o mal.
let pendingResolve: ((ok: boolean) => void) | null = null;
let pendingSchedule: Promise<boolean> | null = null;
let pushInFlight: Promise<boolean> | null = null;
let queuedAfterPush = false;
let queuedFull = false; // el ciclo encolado debe ser completo
let isSyncing = false; // evita auto-schedule durante merges internos
let dirtyDuringSync = false; // el usuario editó mientras sincronizábamos
let syncDisabled = false; // esquema no migrado → modo local-only
let initialized = false;

// ── Marca de agua del ciclo (DAT-01) ──
//
// pushAll() subía y pullAll() bajaba TODAS las filas de todas las tablas en
// cada ciclo, sin distinguir qué había cambiado. Con 200 movimientos es
// imperceptible; con 2000 —tres años de uso— cada guardado movía megabytes,
// y el debounce de 800ms hace que ocurra a menudo: batería, plan de datos y
// cuota de Supabase.
//
// La marca es el instante en que ARRANCÓ el último ciclo confirmado. Con ella:
//
//   · PUSH: solo se suben filas con `updated_at >= marca`. Subir de más es
//     inofensivo (keep_newest descarta lo rancio, el upsert es idempotente).
//   · PULL: solo se bajan filas con `updated_at >= marca − 5 min`. El merge
//     tolera un snapshot parcial: una fila que no llega es "sin novedad
//     remota" y gana la copia local, que es exactamente la que el servidor
//     tiene. El margen cubre a otro dispositivo con el reloj algo atrasado
//     (sus escrituras llevan marca de SU reloj). Un desfase mayor ya dispara
//     el aviso de avisarSiElRelojVaMal.
//   · Bajar o subir de menos sí perdería datos: por eso cada `attach`
//     (login), cada vuelta a la pestaña y cada reconexión hacen un ciclo
//     COMPLETO que reconcilia lo que el filtrado haya dejado atrás.
let pushWatermark: string | null = null;

/** Margen del pull incremental frente a relojes desfasados entre dispositivos. */
const MARGEN_PULL_MS = 5 * 60_000;

function marcaDePull(marca: string | null): string | null {
  if (!marca) return null;
  const t = Date.parse(marca);
  return Number.isNaN(t) ? null : new Date(t - MARGEN_PULL_MS).toISOString();
}

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

/**
 * Reporta un fallo de sync a `error_log` (solo producción; la puerta está
 * dentro de reportarError). Hasta ahora estos catches solo hacían
 * console.warn/error: un problema real de Supabase en producción —una
 * migración sin aplicar, RLS mal configurada, la tabla `budgets` rechazando
 * escrituras— era invisible salvo que el propio usuario lo reportara. `tag`
 * distingue el motivo en la tabla sin tener que leer el mensaje de cada fila.
 */
function reportarErrorSync(err: unknown, tag: string): void {
  reportarError(err, { tag });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TableName = 'expenses' | 'categories' | 'savings_goals' | 'budgets' | 'accounts' | 'debts' | 'settings' | 'assets' | 'networth' | 'budget_lines' | 'recurrences';

// ── Pull ──

// PostgREST (Supabase) limita cualquier select sin `range` a 1000 filas por
// defecto. Sin paginar, una cuenta con más de 1000 movimientos pierde
// silenciosamente el resto del historial en cada pull — y sin `order by`
// estable, ni siquiera es determinista CUÁLES 1000 filas llegan entre un
// pull y el siguiente.
const PAGE_SIZE = 1000;

/** Trae las filas de una tabla para un usuario (todas, o solo las
 *  modificadas desde `since`), paginando en bloques de PAGE_SIZE con un
 *  orden estable (para que el corte entre páginas sea siempre el mismo,
 *  incluso si hay escrituras concurrentes). */
async function fetchAllRows<T>(
  table: TableName,
  uid: string,
  orderColumns: string[],
  since: string | null,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase!.from(table).select('*').eq('user_id', uid);
    if (since) query = query.gte('updated_at', since);
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
  mirar(snapshot.accounts);
  mirar(snapshot.debts);
  mirar(snapshot.assets);
  mirar(snapshot.budgetLines);
  mirar(snapshot.recurrences);

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

/** @param since  null = pull completo; si no, solo filas con `updated_at >= since`. */
async function pullAll(uid: string, since: string | null): Promise<Snapshot> {
  const [expenses, categories, goals, budgets, accounts, debts, settings, assets, networth, budgetLines, recurrences] = await Promise.all([
    fetchAllRows<ExpenseRow>('expenses', uid, ['updated_at', 'id'], since),
    fetchAllRows<CategoryRow>('categories', uid, ['updated_at', 'id'], since),
    fetchAllRows<GoalRow>('savings_goals', uid, ['updated_at', 'id'], since),
    // budgets no tiene columna `id` (PK compuesta user_id+month) — `month`
    // ya es único por usuario, así que sirve como desempate estable.
    fetchAllRows<BudgetRow>('budgets', uid, ['month'], since),
    fetchAllRows<AccountRow>('accounts', uid, ['updated_at', 'id'], since),
    fetchAllRows<DebtRow>('debts', uid, ['updated_at', 'id'], since),
    // settings es una fila por usuario (PK user_id): 0 o 1 resultados.
    fetchAllRows<SettingsRow>('settings', uid, ['user_id'], since),
    fetchAllRows<AssetRow>('assets', uid, ['updated_at', 'id'], since),
    // networth: PK (user_id, month); `month` es único por usuario.
    fetchAllRows<NetWorthRow>('networth', uid, ['month'], since),
    fetchAllRows<BudgetLineRow>('budget_lines', uid, ['updated_at', 'id'], since),
    fetchAllRows<RecurrenceRow>('recurrences', uid, ['updated_at', 'id'], since),
  ]);

  const snapshot = { expenses, categories, goals, budgets, accounts, debts, settings, assets, networth, budgetLines, recurrences };
  avisarSiElRelojVaMal(snapshot);
  return snapshot;
}

// ── Merge ──

interface MergeResult {
  expenses: MergeSet<Transaction>;
  goals: MergeSet<SavingsGoal>;
  accounts: MergeSet<Account>;
  debts: MergeSet<Debt>;
  assets: MergeSet<Asset>;
  networth: NetWorthSnapshot[];
  budgetLines: MergeSet<BudgetLine>;
  recurrences: MergeSet<Recurrence>;
  /** Ajustes ganadores tras el merge (el updated_at más nuevo). */
  settings: Settings;
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

/**
 * Igualdad profunda que corta en cuanto encuentra la misma referencia.
 * Tras un merge sin novedades cada item ganador ES el objeto local, así que
 * el recorrido se queda en el `===` de cada elemento; solo baja al detalle
 * en lo que de verdad cambió. Reemplaza a comparar `JSON.stringify` de todo
 * el estado, que serializaba dos veces el historial completo en cada ciclo.
 */
export function igualEstructural(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arrB = b as unknown[];
    if (a.length !== arrB.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!igualEstructural(a[i], arrB[i])) return false;
    }
    return true;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  for (const k of keysA) {
    if (!(k in objB) || !igualEstructural(objA[k], objB[k])) return false;
  }
  return true;
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

  const remoteAccounts = buildRemoteSet(snapshot.accounts, rowToAccount);
  const accountsUniverse = universeOf(state.accounts, remoteAccounts);
  const accounts = mergeById(
    { live: state.accounts, tombstones: scopeTombstones(state.tombstones, accountsUniverse) },
    remoteAccounts,
  );

  const remoteDebts = buildRemoteSet(snapshot.debts, rowToDebt);
  const debtsUniverse = universeOf(state.debts, remoteDebts);
  const debts = mergeById(
    { live: state.debts, tombstones: scopeTombstones(state.tombstones, debtsUniverse) },
    remoteDebts,
  );

  const remoteAssets = buildRemoteSet(snapshot.assets, rowToAsset);
  const assetsUniverse = universeOf(state.assets, remoteAssets);
  const assets = mergeById(
    { live: state.assets, tombstones: scopeTombstones(state.tombstones, assetsUniverse) },
    remoteAssets,
  );

  const networth = mergeNetWorth(state.networth, snapshot.networth.map(rowToNetWorth));

  const remoteLines = buildRemoteSet(snapshot.budgetLines, rowToBudgetLine);
  const linesUniverse = universeOf(state.budgetLines, remoteLines);
  const budgetLines = mergeById(
    { live: state.budgetLines, tombstones: scopeTombstones(state.tombstones, linesUniverse) },
    remoteLines,
  );

  // Deduplicación semántica de BudgetLines por (tag, kind, categoryId)
  // Evita filas duplicadas por carreras de red cuando dos dispositivos crean la línea a la vez.
  const linesByKey = new Map<string, BudgetLine[]>();
  for (const line of budgetLines.live) {
    const key = `${line.tag}|${line.kind}|${line.categoryId}`;
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key)!.push(line);
  }

  const deduplicatedLines: BudgetLine[] = [];
  const extraTombstones: Record<string, string> = {};

  for (const group of linesByKey.values()) {
    if (group.length === 1) {
      deduplicatedLines.push(group[0]);
    } else {
      group.sort((a, b) => ((b.updated_at ?? '') > (a.updated_at ?? '') ? 1 : (b.updated_at ?? '') < (a.updated_at ?? '') ? -1 : 0));
      let winner = group[0];
      let merged = false;
      let newPlan = { ...(winner.plan || {}) };

      for (let i = 1; i < group.length; i++) {
        const loser = group[i];
        if (loser.plan) {
          newPlan = { ...loser.plan, ...newPlan };
          merged = true;
        }
        extraTombstones[loser.id] = nowIso();
      }

      if (merged) {
        winner = { ...winner, plan: newPlan, updated_at: nowIso() };
      }
      deduplicatedLines.push(winner);
    }
  }
  budgetLines.live = deduplicatedLines;
  Object.assign(budgetLines.tombstones, extraTombstones);

  const remoteRecurrences = buildRemoteSet(snapshot.recurrences, rowToRecurrence);
  const recUniverse = universeOf(state.recurrences, remoteRecurrences);
  const recurrences = mergeById(
    { live: state.recurrences, tombstones: scopeTombstones(state.tombstones, recUniverse) },
    remoteRecurrences,
  );

  // Ajustes: una sola fila, gana la marca más nueva. Un updated_at local
  // vacío significa "nunca tocado" y pierde contra cualquier fila remota.
  const remoteSettings = snapshot.settings[0] ? rowToSettings(snapshot.settings[0]) : null;
  const settings =
    remoteSettings && remoteSettings.updated_at > (state.settings.updated_at || '')
      ? remoteSettings
      : state.settings;

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
    ...accountsUniverse,
    ...debtsUniverse,
    ...assetsUniverse,
    ...linesUniverse,
    ...recUniverse,
    ...expCatsUniverse,
    ...incCatsUniverse,
  ]);
  const flatTombstones = { ...state.tombstones };
  allUniverse.forEach((id) => delete flatTombstones[id]);
  Object.assign(
    flatTombstones,
    expenses.tombstones,
    goals.tombstones,
    accounts.tombstones,
    debts.tombstones,
    assets.tombstones,
    budgetLines.tombstones,
    recurrences.tombstones,
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
    ...Object.keys(remoteAccounts.tombstones),
    ...Object.keys(remoteDebts.tombstones),
    ...Object.keys(remoteAssets.tombstones),
    ...Object.keys(remoteLines.tombstones),
    ...Object.keys(remoteRecurrences.tombstones),
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
    accounts: accounts.live,
    debts: debts.live,
    assets: assets.live,
    networth,
    budgetLines: budgetLines.live,
    recurrences: recurrences.live,
    settings,
    customExpenseCategories: expenseCategories.live,
    customIncomeCategories: incomeCategories.live,
    tombstones: flatTombstones,
    budgets: budgets.budgets,
    budgetUpdatedAt: budgets.updatedAt,
  };
  const current = {
    expenses: state.expenses,
    savingsGoals: state.savingsGoals,
    accounts: state.accounts,
    debts: state.debts,
    assets: state.assets,
    networth: state.networth,
    budgetLines: state.budgetLines,
    recurrences: state.recurrences,
    settings: state.settings,
    customExpenseCategories: state.customExpenseCategories,
    customIncomeCategories: state.customIncomeCategories,
    tombstones: state.tombstones,
    budgets: state.budgets,
    budgetUpdatedAt: state.budgetUpdatedAt,
  };
  if (!igualEstructural(next, current)) {
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
        accounts: keepLocalAdditions(next.accounts, currentState.accounts),
        debts: keepLocalAdditions(next.debts, currentState.debts),
        assets: keepLocalAdditions(next.assets, currentState.assets),
        budgetLines: keepLocalAdditions(next.budgetLines, currentState.budgetLines),
        recurrences: keepLocalAdditions(next.recurrences, currentState.recurrences),
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

  return { expenses, goals, accounts, debts, assets, networth, budgetLines, recurrences, settings, expenseCategories, incomeCategories, budgets, flatTombstones };
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

/** ¿Violación de NOT NULL (23502)? */
export function esViolacionNotNull(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23502';
}

interface FilaTombstone { id: string; user_id: string; updated_at: string; deleted_at: string }

/**
 * Sube las filas vivas y, APARTE, los tombstones de una tabla.
 *
 * Un tombstone solo lleva identidad + timestamps. Las tablas de la 0001 tienen
 * las columnas de negocio nullable y lo aceptan por upsert, pero las de la
 * 0009–0014 nacieron con NOT NULL sin default (`recurrences.type`,
 * `debts.name`, `accounts.name`…). Postgres comprueba el NOT NULL de la fila
 * propuesta ANTES de resolver el ON CONFLICT, así que el upsert de un borrado
 * fallaba aunque la fila ya existiera, el ciclo entero se reintentaba hasta
 * agotarse y NADA más se sincronizaba: todo quedaba en el dispositivo.
 *
 * Por eso:
 *  - Los tombstones van en su propia llamada. Mezclados con filas vivas,
 *    PostgREST rellena con NULL las columnas que el tombstone no trae, incluso
 *    las que tienen default (así fallaba `budget_lines.limit`).
 *  - Si aun así el esquema los rechaza por NOT NULL, se marcan con UPDATE:
 *    solo toca `deleted_at`/`updated_at` de filas que ya existen. Una fila que
 *    nunca llegó al servidor no necesita borrado remoto.
 */
async function upsertConTombstones(
  table: TableName,
  vivas: object[],
  tombstones: FilaTombstone[],
): Promise<void> {
  await upsert(table, vivas, 'user_id,id');
  if (tombstones.length === 0) return;
  try {
    await upsert(table, tombstones, 'user_id,id');
  } catch (err: unknown) {
    if (!esViolacionNotNull(err)) throw err;
    for (const t of tombstones) {
      const { error } = await supabase!
        .from(table)
        .update({ deleted_at: t.deleted_at, updated_at: t.updated_at })
        .eq('user_id', t.user_id)
        .eq('id', t.id);
      if (error) throw error;
    }
  }
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

  const tombstoneRows = (tombstones: Record<string, string>): FilaTombstone[] =>
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
  await upsertConTombstones('expenses',
    merged.expenses.live.filter((t) => changed(t.updated_at)).map((t) => expenseToRow(t, uid)),
    tombstoneRows(merged.expenses.tombstones),
  );

  await upsertConTombstones('categories', [
    ...merged.expenseCategories.live
      .filter((c) => changed(c.updated_at ?? ''))
      .map((c) => categoryToRow(c, uid, 'expense')),
    ...merged.incomeCategories.live
      .filter((c) => changed(c.updated_at ?? ''))
      .map((c) => categoryToRow(c, uid, 'income')),
  ], [
    ...tombstoneRows(merged.expenseCategories.tombstones),
    ...tombstoneRows(merged.incomeCategories.tombstones),
  ]);

  await upsertConTombstones('savings_goals',
    merged.goals.live.filter((g) => changed(g.updated_at)).map((g) => goalToRow(g, uid)),
    tombstoneRows(merged.goals.tombstones),
  );

  await upsertConTombstones('accounts',
    merged.accounts.live.filter((a) => changed(a.updated_at)).map((a) => accountToRow(a, uid)),
    tombstoneRows(merged.accounts.tombstones),
  );

  await upsertConTombstones('debts',
    merged.debts.live.filter((d) => changed(d.updated_at)).map((d) => debtToRow(d, uid)),
    tombstoneRows(merged.debts.tombstones),
  );

  await upsertConTombstones('assets',
    merged.assets.live.filter((a) => changed(a.updated_at)).map((a) => assetToRow(a, uid)),
    tombstoneRows(merged.assets.tombstones),
  );

  await upsertConTombstones('budget_lines',
    merged.budgetLines.live.filter((l) => changed(l.updated_at)).map((l) => budgetLineToRow(l, uid)),
    tombstoneRows(merged.budgetLines.tombstones),
  );

  await upsertConTombstones('recurrences',
    merged.recurrences.live.filter((r) => changed(r.updated_at)).map((r) => recurrenceToRow(r, uid)),
    tombstoneRows(merged.recurrences.tombstones),
  );

  await upsert('networth', merged.networth
    .filter((n) => changed(n.updated_at))
    .map((n) => netWorthToRow(n, uid)), 'user_id,month');

  // Ajustes nunca tocados (updated_at vacío) no se suben: no hay nada que decir.
  if (merged.settings.updated_at && changed(merged.settings.updated_at)) {
    await upsert('settings', [settingsToRow(merged.settings, uid)], 'user_id');
  }

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

      const snapshot = await pullAll(uid, marcaDePull(since));
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
  reportarErrorSync(lastError, 'reintentos-agotados');
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

    // ALT-3: flush del último cambio al cerrar/ocultar la pestaña. Al volver a
    // la pestaña o recuperar la red, ciclo COMPLETO: es el momento en que otro
    // dispositivo pudo haber escrito mucho, y la red de seguridad del pull
    // incremental (ver marca de agua).
    window.addEventListener('pagehide', () => {
      void syncService.flush();
    });
    document.addEventListener('visibilitychange', () => {
      void syncService.flush(document.visibilityState === 'visible');
    });
    window.addEventListener('online', () => {
      void syncService.flush(true);
    });

    // Auto-save: cualquier cambio de datos agenda un push (debounced)
    useFinanceStore.subscribe((state, prev) => {
      if (!userId || syncDisabled) return;
      const dataChanged =
        state.expenses !== prev.expenses ||
        state.budgets !== prev.budgets ||
        state.budgetUpdatedAt !== prev.budgetUpdatedAt ||
        state.savingsGoals !== prev.savingsGoals ||
        state.accounts !== prev.accounts ||
        state.debts !== prev.debts ||
        state.assets !== prev.assets ||
        state.networth !== prev.networth ||
        state.budgetLines !== prev.budgetLines ||
        state.recurrences !== prev.recurrences ||
        state.settings !== prev.settings ||
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
        // Modo degradado intencional, pero si pasa en producción es señal de
        // un deploy sin migrar: vale la pena saberlo aunque la app siga viva.
        reportarErrorSync(err, 'esquema-no-migrado');
      } else if (isTransientSchemaError(err)) {
        console.warn('[sync] Caché de esquema desactualizada (transitorio) al adjuntar — se reintentará en el próximo cambio.');
        useUiStore.getState().setSyncState('error');
      } else {
        useUiStore.getState().setSyncState('error');
        reportarErrorSync(err, 'attach-fallo');
      }
    }
  },

  /** Agenda un push (debounce 800ms). Misma firma que el saveData original.
   *  Varias llamadas dentro de la ventana comparten la misma promesa: todas
   *  se resuelven juntas cuando el ciclo debounced finalmente corre, en vez
   *  de que solo la última llamada de la ráfaga reciba el resultado. */
  schedule(): Promise<boolean> {
    if (!supabase || syncDisabled) return Promise.resolve(true);
    if (!userId) return Promise.resolve(true);
    if (timer) clearTimeout(timer);
    if (!pendingSchedule) {
      pendingSchedule = new Promise<boolean>((resolve) => { pendingResolve = resolve; });
    }
    timer = setTimeout(() => {
      timer = null;
      const resolve = pendingResolve!;
      pendingResolve = null;
      pendingSchedule = null;
      void performPush().then(resolve);
    }, DEBOUNCE_MS);
    return pendingSchedule;
  },

  /**
   * Cancela el timer pendiente y sincroniza de inmediato. Resuelve cuando no
   * queda NADA en vuelo: si mientras esperábamos se encoló otro ciclo (una
   * edición que llegó con un push a medias), también lo espera. Antes
   * devolvía la promesa del ciclo en curso, y signOut() borraba el estado
   * local con esa última edición todavía sin subir.
   *
   * @param full  ciclo completo (pull y push sin marca de agua).
   */
  async flush(full = false): Promise<boolean> {
    // Si al cancelar el timer había un schedule() pendiente, su promesa
    // compartida se resuelve con el resultado de este mismo push — de lo
    // contrario, sus llamadores quedarían esperando para siempre (el mismo
    // bug que schedule() tenía consigo mismo, aquí por partida de flush()).
    const tomarResolucionPendiente = () => {
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingSchedule = null;
      return resolve;
    };

    if (timer) clearTimeout(timer);
    timer = null;
    let resolverPendiente = tomarResolucionPendiente();

    // Con un ciclo en vuelo, performPush encola uno y devuelve el actual.
    let ok = await performPush(full);
    resolverPendiente?.(ok);
    // Al resolverse, el finally del ciclo pudo arrancar el encolado
    // (pushInFlight) o agendar otro (timer) por una edición en vuelo: se
    // esperan directamente —llamar a performPush encolaría uno más— hasta
    // que un ciclo termine sin dejar nada detrás.
    while (timer || pushInFlight) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        resolverPendiente = tomarResolucionPendiente();
        ok = pushInFlight ? await pushInFlight : await performPush();
        resolverPendiente?.(ok);
      } else {
        ok = await pushInFlight!;
      }
    }
    return ok;
  },

  /** Cancela el timer sin pushear. Cualquier schedule() que quedara
   *  esperando este ciclo se resuelve en `false` — no se va a pushear —
   *  en vez de quedarse pendiente para siempre. */
  cancel(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingSchedule = null;
      resolve(false);
    }
  },

  /** Logout: cancela pendientes y suelta el usuario. NO pushea (el flush
   *  explícito va antes en signOut). Resetea syncDisabled: es un flag por
   *  SESIÓN — antes sobrevivía al logout y contaminaba la cuenta siguiente
   *  que iniciara sesión en la misma pestaña. */
  detach(): void {
    syncService.cancel();
    queuedAfterPush = false;
    queuedFull = false;
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
    queuedFull = queuedFull || fullPush;
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
        // El ciclo que arranca ahora ya ve todo lo editado durante éste.
        dirtyDuringSync = false;
        const full = queuedFull;
        queuedFull = false;
        void performPush(full);
      } else if (dirtyDuringSync) {
        dirtyDuringSync = false;
        void syncService.schedule();
      }
    }
    return ok;
  })();

  return pushInFlight;
}
