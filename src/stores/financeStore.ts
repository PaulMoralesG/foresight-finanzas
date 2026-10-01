// ================================================================
// FINANCE STORE - Zustand (finanzas: transactions, budgets, view)
// ================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { roundMoney as roundMoneyLocal, getTodayISO } from '@/lib/utils';
import { filtrarPorMes } from '@/lib/month-keys';
import { computeSavingsByConcept, savingsForGoal } from '@/lib/savings';
import { newId, nowIso, uuidv5 } from '@/lib/ids';
import type { Transaction, MonthlyBudget, FilterType, Ambito, Category, SavingsGoal, Account, Debt, Settings, Asset, NetWorthSnapshot, BudgetLine, BusinessType, Recurrence } from '@/types';
import { convertGlobalBudgets } from '@/lib/budget-lines';
import { accountIsUsed, TRANSFER_CATEGORY } from '@/lib/accounts';
import { fechasPendientes } from '@/lib/recurrence';
import { aplicarCambioDePagos, enlazarPagosAntiguos, type DescuentosDePago } from '@/lib/debt-payments';
import { normalizarDeuda } from '@/lib/credit-card';
import { recalcularSaldos, anclarDeuda, rebasarDeuda } from '@/lib/debt-balance';
import type { BackupData } from '@/lib/backup';

/** Ids que pudieron perder claves de v16 (cutDay, debtId...) por un cliente
 *  antiguo; el sync los hidrata desde el remoto y luego vacía las listas. */
export interface PendienteHidratar {
  debts: string[];
  expenses: string[];
}

interface FinanceState {
  // --- Estado ---
  expenses: Transaction[];
  /** Presupuesto global antiguo (un número por mes). Desde la v12 solo se
   *  conserva para sync con clientes viejos; la UI usa `budgetLines`. */
  budgets: MonthlyBudget;
  budgetUpdatedAt: Record<string, string>; // monthKey 'YYYY-MM' → ISO (merge de sync)
  /** Presupuesto por categoría (fase 3.4). */
  budgetLines: BudgetLine[];
  recurrences: Recurrence[];
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
  /** Ámbito global: filtra Resumen, Movimientos, Presupuestos, Deudas y Metas. */
  ambito: Ambito;
  /** Ids por hidratar en el próximo ciclo completo de sync (ver migrateV16). */
  pendienteHidratar: PendienteHidratar;
  /** Lo que cada pago descontó de verdad de su deuda (id del movimiento → descuento).
   *  Local: se persiste pero no se sincroniza (ver `DescuentoPago`). */
  descuentosDePago: DescuentosDePago;

  // --- Acciones de fecha y filtro ---
  setViewDate: (step: number) => void;
  setFilter: (filter: FilterType) => void;
  setAmbito: (ambito: Ambito) => void;
  ensureCurrentMonth: () => void;

  // --- CRUD de transacciones ---
  addTransaction: (t: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) => string;
  updateTransaction: (id: string, partial: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>) => void;
  deleteTransaction: (id: string) => void;
  deleteTransactions: (ids: string[]) => void;
  restoreTransactions: (items: Transaction[]) => void;

  // --- Presupuestos ---
  addBudgetLine: (l: Omit<BudgetLine, 'id' | 'updated_at'>) => string;
  updateBudgetLine: (id: string, partial: Partial<Omit<BudgetLine, 'id' | 'updated_at'>>) => void;
  deleteBudgetLine: (id: string) => void;
  /** Fija (o borra, con 0/NaN) el plan de un mes de una línea. */
  setBudgetPlan: (id: string, monthKey: string, value: number | null) => void;

  // --- Movimientos recurrentes ---
  addRecurrence: (r: Omit<Recurrence, 'id' | 'updated_at' | 'ultimaGenerada'>) => string;
  updateRecurrence: (id: string, partial: Partial<Omit<Recurrence, 'id' | 'updated_at'>>) => void;
  deleteRecurrence: (id: string) => void;
  /**
   * Registra los movimientos que las recurrencias activas deban haber creado
   * hasta hoy. Idempotente: volver a llamarla no duplica nada.
   */
  materializarRecurrencias: () => Promise<number>;

  // --- Categorías personalizadas ---
  addCustomCategory: (type: 'expense' | 'income', category: Category) => void;
  updateCustomCategory: (type: 'expense' | 'income', id: string, updates: Partial<Category>) => void;
  deleteCustomCategory: (type: 'expense' | 'income', id: string) => void;

  // --- Metas de ahorro ---
  /** tag/targetDate/saved son opcionales: quien no los pase obtiene una
   *  meta personal, sin fecha y en cero, como antes de la 3.8. */
  addSavingsGoal: (
    g: { concept: string; target: number; tag?: BusinessType; targetDate?: string | null; saved?: number },
  ) => string;
  updateSavingsGoal: (id: string, partial: Partial<Omit<SavingsGoal, 'id' | 'updated_at'>>) => void;
  deleteSavingsGoal: (id: string) => void;
  /** Registrar aporte (contribForm de la referencia): suma a `saved` y, si
   *  se elige cuenta, también a `savedFromAccounts` y deja el aporte como
   *  gasto del mes en categoría 'ahorro' con esa cuenta. */
  contributeToGoal: (
    id: string,
    contrib: { amount: number; date: string; accountId: string | null },
  ) => void;

  // --- Cuentas ---
  addAccount: (a: Omit<Account, 'id' | 'updated_at'>) => string;
  updateAccount: (id: string, partial: Partial<Omit<Account, 'id' | 'updated_at'>>) => void;
  /** No borra (ni deja tombstone) si algún movimiento o recurrencia usa la cuenta. */
  deleteAccount: (id: string) => void;

  // --- Deudas ---
  addDebt: (d: Omit<Debt, 'id' | 'updated_at'>) => string;
  updateDebt: (id: string, partial: Partial<Omit<Debt, 'id' | 'updated_at'>>) => void;
  deleteDebt: (id: string) => void;
  /** Registra un pago: una transferencia sin destino enlazada a la deuda
   *  (no es gasto) que resta de la cuenta de origen y baja el saldo. */
  registerDebtPayment: (
    id: string,
    pago: { amount: number; date: string; accountId: string | null },
  ) => void;
  /** Enlaza un movimiento antiguo (sin deuda) a una deuda SIN cambiar ningún
   *  saldo. Queda marcado `debtHistorico` (sincronizado): borrarlo o editarlo
   *  tampoco lo mueve, en ningún dispositivo. */
  vincularPagoHistorico: (txId: string, debtId: string) => void;
  /** Quita el enlace de un pago a su deuda SIN cambiar el saldo mostrado
   *  (en una anclada, si el pago descontaba, rebasa para conservarlo). */
  desvincularPago: (txId: string) => void;
  /** Ancla una deuda (su saldo pasa a derivarse de sus pagos) preservando el
   *  saldo mostrado. No-op si ya estaba anclada o no existe. */
  confirmarSaldoDeuda: (id: string) => void;
  /** Vacía `pendienteHidratar` tras un ciclo completo de sync confirmado. */
  limpiarPendienteHidratar: () => void;

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

/** v14: entra `recurrences` (movimientos que se repiten). */
function migrateV14(state: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(state.recurrences)) state.recurrences = [];
  return state;
}

/** v15: entra `Transaction.debtId`. Los «Pago <deuda>» que ya creaba
 *  «Registrar pago» se enlazan a su deuda para que aparezcan en su historial.
 *  No toca saldos: ya se habían descontado al registrarlos. */
export function migrateV15(state: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(state.expenses) && Array.isArray(state.debts) && state.debts.length > 0) {
    state.expenses = enlazarPagosAntiguos(state.expenses as Transaction[], state.debts as Debt[], nowIso());
  }
  return state;
}

/** v16: entra `pendienteHidratar`. Un dispositivo con la PWA anterior pudo dejar
 *  deudas sin cutDay/statementBalance/creditLimit y movimientos sin debtId
 *  aunque el remoto los tenga: se anotan los ids que existían al migrar
 *  (todas las deudas y los movimientos sin debtId) para que el sync los
 *  hidrate en el primer ciclo completo. Idempotente. */
export function migrateV16(state: Record<string, unknown>): Record<string, unknown> {
  const ids = (rows: unknown, soloSinDebtId: boolean): string[] =>
    (Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [])
      .filter((r) => !!r && typeof r.id === 'string' && (!soloSinDebtId || !r.debtId))
      .map((r) => r.id as string);
  // `descuentosDePago` también nace en la v16 (aún sin publicar): sin versión aparte.
  if (!state.descuentosDePago || typeof state.descuentosDePago !== 'object') state.descuentosDePago = {};
  const previo = state.pendienteHidratar as Partial<PendienteHidratar> | undefined;
  if (previo && Array.isArray(previo.debts) && Array.isArray(previo.expenses)) return state;
  state.pendienteHidratar = { debts: ids(state.debts, false), expenses: ids(state.expenses, true) };
  return state;
}

/** Añade a `base` los ids de `nuevos` que no estén ya, conservando el orden. */
function unirIds(base: string[], nuevos: string[]): string[] {
  const vistos = new Set(base);
  const out = [...base];
  for (const id of nuevos) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push(id);
  }
  return out;
}

/**
 * v17 (spec sync-saldo-deudas §5.5): las marcas «vinculado» locales de
 * `descuentosDePago` pasan a `debtHistorico` en el propio movimiento (con
 * `updated_at` renovado para que el sync las suba). Solo codifica una
 * decisión que el usuario ya tomó al pulsar «Vincular»: no cambia montos ni
 * saldos y NO ancla ninguna deuda (§11.1).
 *
 * Además anota en `pendienteHidratar` todas las deudas (`saldoBase`,
 * `contadoBase`) y los movimientos CON `debtId` (`debtHistorico`): otro
 * dispositivo ya en v17 pudo fijarlos en el remoto, y si la copia local
 * empatara el merge sin ellos, el push los borraría. migrateV16 solo anotaba
 * los movimientos sin `debtId`. Solo añade ids (sin duplicar): el sync los
 * hidrata en el próximo ciclo completo y vacía la lista. Idempotente.
 */
export function migrateV17(state: Record<string, unknown>): Record<string, unknown> {
  const idsDe = (rows: unknown, soloConDebtId: boolean): string[] =>
    (Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [])
      .filter((r) => !!r && typeof r.id === 'string' && (!soloConDebtId || !!r.debtId))
      .map((r) => r.id as string);
  const deudas = idsDe(state.debts, false);
  const gastos = idsDe(state.expenses, true);
  const previo = state.pendienteHidratar as Partial<PendienteHidratar> | undefined;
  const valido = !!previo && Array.isArray(previo.debts) && Array.isArray(previo.expenses);
  if (valido || deudas.length > 0 || gastos.length > 0) {
    const cadenas = (xs: unknown): string[] => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string') : []);
    state.pendienteHidratar = {
      debts: unirIds(valido ? cadenas(previo?.debts) : [], deudas),
      expenses: unirIds(valido ? cadenas(previo?.expenses) : [], gastos),
    };
  }

  const descuentos = state.descuentosDePago;
  if (!descuentos || typeof descuentos !== 'object' || !Array.isArray(state.expenses)) return state;
  const vinculados = new Set(
    Object.entries(descuentos as DescuentosDePago)
      .filter(([, rec]) => !!rec && rec.vinculado === true)
      .map(([id]) => id),
  );
  if (vinculados.size === 0) return state;
  const ahora = nowIso();
  state.expenses = (state.expenses as Transaction[]).map((e) =>
    vinculados.has(e.id) && e.debtId && !e.debtHistorico ? { ...e, debtHistorico: true as const, updated_at: ahora } : e,
  );
  return state;
}

const emptyState = {
  expenses: [] as Transaction[],
  budgets: {} as MonthlyBudget,
  budgetUpdatedAt: {} as Record<string, string>,
  budgetLines: [] as BudgetLine[],
  recurrences: [] as Recurrence[],
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
  ambito: 'all' as Ambito,
  pendienteHidratar: { debts: [], expenses: [] } as PendienteHidratar,
  descuentosDePago: {} as DescuentosDePago,
};

/**
 * Ajusta las deudas al pasar de `antes` a `despues` (invariante de deudas):
 * las no ancladas por el camino legado (`aplicarCambioDePagos`, con su
 * registro de descuentos) y las ancladas recalculando su saldo derivado con
 * `expensesNuevo`, el array de movimientos que queda tras la acción. Las
 * ancladas nunca cambian `updated_at` aquí: un pago no reescribe la deuda.
 */
function ajustarDeudas(
  state: Pick<FinanceState, 'debts' | 'descuentosDePago'>,
  antes: Transaction[],
  despues: Transaction[],
  expensesNuevo: Transaction[],
): Pick<FinanceState, 'debts' | 'descuentosDePago'> {
  const r = aplicarCambioDePagos(state.debts, state.descuentosDePago ?? {}, antes, despues, nowIso());
  return { debts: recalcularSaldos(r.debts, expensesNuevo), descuentosDePago: r.descuentos };
}

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
 * Quita el id de un movimiento de `pendienteHidratar.expenses` (no-op si no
 * estaba). Se usa cuando el usuario cambia explícitamente el vínculo de un
 * pago con su deuda (vincular/desvincular, o `debtId` en updateTransaction):
 * esa decisión no debe perderse si el sync hidrata el valor viejo del
 * servidor antes del primer ciclo completo tras la migración v17 (spec
 * sync-saldo-deudas, fix integración).
 */
function sinPendienteHidratar(pendiente: PendienteHidratar, txId: string): PendienteHidratar {
  if (!pendiente.expenses.includes(txId)) return pendiente;
  return { ...pendiente, expenses: pendiente.expenses.filter((id) => id !== txId) };
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

/**
 * Migración v13: metas de ahorro con el modelo de Balance Dual (fase 3.8).
 * Antes el progreso se derivaba buscando gastos categoría 'ahorro' cuyo
 * concepto de texto coincidiera con el nombre de la meta; ahora cada meta
 * lleva su propio `saved`. Para no perder el progreso ya hecho, una meta
 * sin `saved`/`tag` todavía (v12 o anterior) recibe como `saved` inicial
 * el histórico completo por concepto (savingsForGoal), calculado una sola
 * vez aquí. `savedFromAccounts` arranca en 0: el histórico no distinguía
 * qué parte de esos aportes salió de una cuenta y cuál no, así que no hay
 * un valor correcto que reconstruir — es una simplificación consciente.
 */
function migrateV13(state: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(state.savingsGoals)) {
    state.savingsGoals = [];
    return state;
  }
  const expenses = (Array.isArray(state.expenses) ? state.expenses : []) as Transaction[];
  const byConcept = computeSavingsByConcept(expenses);
  state.savingsGoals = (state.savingsGoals as Array<Record<string, unknown>>).map((g) => {
    if (typeof g.saved === 'number' && typeof g.tag === 'string') return g; // ya en v13
    const concept = typeof g.concept === 'string' ? g.concept : '';
    return {
      ...g,
      tag: typeof g.tag === 'string' ? g.tag : 'personal',
      targetDate: typeof g.targetDate === 'string' ? g.targetDate : null,
      saved: typeof g.saved === 'number' ? g.saved : savingsForGoal(byConcept, concept),
      savedFromAccounts: typeof g.savedFromAccounts === 'number' ? g.savedFromAccounts : 0,
    };
  });
  return state;
}

/** Pasos de la cadena posteriores a v8: [versión que introduce, migración]. */
const MIGRACIONES: ReadonlyArray<readonly [number, (state: Record<string, unknown>) => Record<string, unknown>]> = [
  [9, migrateV9],
  [10, migrateV10],
  [11, migrateV11],
  [12, migrateV12],
  [13, migrateV13],
  [14, migrateV14],
  [15, migrateV15],
  [16, migrateV16],
  [17, migrateV17],
];

/**
 * Migración incremental: cada paso corre solo si la versión persistida es
 * anterior a la que lo introduce. Re-aplicar un paso ya aplicado no es
 * inocuo: migrateV15 revincularía un pago que el usuario desvinculó a mano.
 * migrateV8 recoge además todo lo anterior a v8 (v5→v6, v6→v7).
 */
function migrarEstadoPersistido(persistedState: unknown, version: number): Record<string, unknown> {
  let state = version < 8 ? migrateV8(persistedState) : ((persistedState ?? {}) as Record<string, unknown>);
  for (const [introducida, paso] of MIGRACIONES) {
    if (version < introducida) state = paso(state);
  }
  return state;
}

const CLAVE_PERSISTENCIA = 'foresight-finance-storage';
/** Copia del estado persistido tomada cuando una migración falla. */
export const CLAVE_RESPALDO_MIGRACION = `${CLAVE_PERSISTENCIA}.backup`;

function respaldarEstadoPersistido(persistedState: unknown): void {
  try {
    // Al migrar, persist aún no ha reescrito la clave: ahí sigue el original
    // intacto (con su versión). Si no se puede leer, el estado ya parseado.
    const crudo = localStorage.getItem(CLAVE_PERSISTENCIA) ?? JSON.stringify(persistedState);
    localStorage.setItem(CLAVE_RESPALDO_MIGRACION, crudo);
  } catch (e: unknown) {
    console.error('[financeStore] No se pudo guardar el respaldo del estado persistido:', e instanceof Error ? e.message : e);
  }
}

/** Borra el respaldo de una migración fallida (logout: no dejar datos de la cuenta). */
export function borrarRespaldoMigracion(): void {
  try {
    localStorage.removeItem(CLAVE_RESPALDO_MIGRACION);
  } catch (e: unknown) {
    console.warn('[financeStore] No se pudo borrar el respaldo de migración:', e instanceof Error ? e.message : e);
  }
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...emptyState,

      reset: () =>
        set({ ...emptyState, pendienteHidratar: { debts: [], expenses: [] }, descuentosDePago: {}, currentViewDate: new Date().toISOString() }),

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
      setAmbito: (ambito) => set({ ambito }),

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

      // Invariante de deudas: un movimiento con `debtId` ES un pago de esa
      // deuda. Toda acción que lo crea, cambia, borra o restaura ajusta el
      // saldo en el MISMO set() (ajustarDeudas): las no ancladas por el camino
      // legado, las ancladas recalculando su saldo derivado.
      addTransaction: (t) => {
        const id = newId();
        set((state) => {
          const nuevo: Transaction = { ...t, id, created_at: nowIso(), updated_at: nowIso() };
          const expenses = [...state.expenses, nuevo];
          return { expenses, ...ajustarDeudas(state, [], [nuevo], expenses) };
        });
        return id;
      },

      updateTransaction: (id, partial) =>
        set((state) => {
          const viejo = state.expenses.find((e) => e.id === id);
          if (!viejo) return { tombstones: clearedTombstone(state.tombstones, id) };
          let nuevo: Transaction = { ...viejo, ...partial, updated_at: nowIso() };
          // Sin deuda no hay «histórico»: la marca viaja con debtId (spec §4).
          if (!nuevo.debtId && nuevo.debtHistorico) {
            const { debtHistorico: _historico, ...resto } = nuevo;
            nuevo = resto;
          }
          const expenses = state.expenses.map((e) => (e.id === id ? nuevo : e));
          // El vínculo con la deuda cambió de verdad (no solo que la clave
          // viaje en el partial: TransactionModal siempre la manda al editar,
          // aunque no se haya tocado) — null y undefined cuentan como "sin
          // deuda" para esta comparación.
          const cambiaDeuda = 'debtId' in partial && (partial.debtId ?? null) !== (viejo.debtId ?? null);
          return {
            expenses,
            tombstones: clearedTombstone(state.tombstones, id),
            // El vínculo con la deuda cambió explícitamente: no hay nada que
            // hidratar para este movimiento (ver sinPendienteHidratar).
            ...(cambiaDeuda ? { pendienteHidratar: sinPendienteHidratar(state.pendienteHidratar, id) } : {}),
            ...ajustarDeudas(state, [viejo], [nuevo], expenses),
          };
        }),

      deleteTransaction: (id) =>
        set((state) => {
          const borrados = state.expenses.filter((e) => e.id === id);
          const expenses = state.expenses.filter((e) => e.id !== id);
          return {
            expenses,
            tombstones: tombstoned(state.tombstones, id),
            ...ajustarDeudas(state, borrados, [], expenses),
          };
        }),

      deleteTransactions: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          let tombstones = state.tombstones;
          ids.forEach((id) => {
            tombstones = tombstoned(tombstones, id);
          });
          const borrados = state.expenses.filter((e) => idSet.has(e.id));
          const expenses = state.expenses.filter((e) => !idSet.has(e.id));
          return {
            expenses,
            tombstones,
            ...ajustarDeudas(state, borrados, [], expenses),
          };
        }),

      // Undo de borrado masivo: conserva ids y timestamps originales. Un pago
      // restaurado vuelve a descontarse de su deuda.
      restoreTransactions: (items) =>
        set((state) => {
          const tombstones = { ...state.tombstones };
          items.forEach((item) => delete tombstones[item.id]);
          const expenses = [...state.expenses, ...items];
          return {
            expenses,
            tombstones,
            ...ajustarDeudas(state, [], items, expenses),
          };
        }),

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
          savingsGoals: [
            ...state.savingsGoals,
            {
              concept: g.concept,
              target: g.target,
              tag: g.tag ?? 'personal',
              targetDate: g.targetDate ?? null,
              saved: g.saved ?? 0,
              savedFromAccounts: 0,
              id,
              updated_at: nowIso(),
            },
          ],
        }));
        return id;
      },

      updateSavingsGoal: (id, partial) =>
        set((state) => ({
          savingsGoals: state.savingsGoals.map((g) => {
            if (g.id !== id) return g;
            const next = { ...g, ...partial, updated_at: nowIso() };
            // `savedFromAccounts` es la parte de `saved` que salió de una
            // cuenta y la única que el patrimonio cuenta como activo. Editar
            // la meta a mano podía bajar `saved` dejándolo por encima, y el
            // patrimonio quedaba inflado por la diferencia — y el cierre
            // mensual lo dejaba grabado en la curva histórica.
            return { ...next, savedFromAccounts: Math.min(next.savedFromAccounts, next.saved) };
          }),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteSavingsGoal: (id) =>
        set((state) => ({
          savingsGoals: state.savingsGoals.filter((g) => g.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      contributeToGoal: (id, contrib) =>
        set((state) => {
          const goal = state.savingsGoals.find((g) => g.id === id);
          if (!goal) return {};
          const savingsGoals = state.savingsGoals.map((g) =>
            g.id === id
              ? {
                  ...g,
                  saved: roundMoneyLocal(g.saved + contrib.amount),
                  savedFromAccounts: roundMoneyLocal(
                    g.savedFromAccounts + (contrib.accountId ? contrib.amount : 0),
                  ),
                  updated_at: nowIso(),
                }
              : g,
          );
          // Sin cuenta: solo se registra el avance, no hay movimiento que crear
          // (como en la referencia: "Solo registrar el avance").
          if (!contrib.accountId) return { savingsGoals };
          const tx: Transaction = {
            id: newId(),
            type: 'expense',
            amount: contrib.amount,
            concept: `Aporte a ${goal.concept}`,
            date: contrib.date,
            category: 'ahorro',
            method: 'transfer',
            businessType: goal.tag,
            accountId: contrib.accountId,
            toAccountId: null,
            created_at: nowIso(),
            updated_at: nowIso(),
          };
          return { savingsGoals, expenses: [...state.expenses, tx] };
        }),

      // ── Presupuesto por categoría ──
      addRecurrence: (r) => {
        const id = newId();
        set((state) => ({
          recurrences: [...state.recurrences, { ...r, id, ultimaGenerada: null, updated_at: nowIso() }],
        }));
        return id;
      },

      updateRecurrence: (id, partial) =>
        set((state) => ({
          recurrences: state.recurrences.map((r) => (r.id === id ? { ...r, ...partial, updated_at: nowIso() } : r)),
          tombstones: clearedTombstone(state.tombstones, id),
        })),

      deleteRecurrence: (id) =>
        set((state) => ({
          recurrences: state.recurrences.filter((r) => r.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      materializarRecurrencias: async () => {
        const hoy = getTodayISO();
        const { recurrences } = get();
        if (recurrences.length === 0) return 0;

        // Los ids se calculan fuera del `set` porque uuidv5 es asíncrono
        // (Web Crypto). El estado se escribe después, de una sola vez.
        const nuevas: Array<{ regla: string; fecha: string; id: string }> = [];
        for (const regla of recurrences) {
          for (const fecha of fechasPendientes(regla, hoy)) {
            nuevas.push({ regla: regla.id, fecha, id: await uuidv5(`recurrencia:${regla.id}:${fecha}`) });
          }
        }
        if (nuevas.length === 0) return 0;

        let creadas = 0;
        set((state) => {
          const existentes = new Set(state.expenses.map((e) => e.id));
          const movimientos: Transaction[] = [];
          const marca: Record<string, string> = {};

          for (const { regla: reglaId, fecha, id } of nuevas) {
            const regla = state.recurrences.find((r) => r.id === reglaId);
            if (!regla) continue;
            // La marca de agua avanza aunque la ocurrencia no se cree: si el
            // usuario borró ese movimiento (tombstone) y no avanzáramos, se
            // volvería a crear en cada arranque.
            marca[reglaId] = fecha;
            if (existentes.has(id) || id in state.tombstones) continue;
            movimientos.push({
              id,
              type: regla.type,
              amount: regla.amount,
              concept: regla.concept,
              date: fecha,
              category: regla.category,
              method: regla.method,
              businessType: regla.businessType,
              accountId: regla.accountId ?? null,
              toAccountId: regla.toAccountId ?? null,
              recurrenceId: regla.id,
              created_at: nowIso(),
              // Compromiso aceptado: generada sin red, pisa una edición/borrado de otro dispositivo (gana el updated_at más nuevo).
              updated_at: nowIso(),
            });
          }
          creadas = movimientos.length;

          return {
            expenses: movimientos.length > 0 ? [...state.expenses, ...movimientos] : state.expenses,
            recurrences: state.recurrences.map((r) =>
              marca[r.id] ? { ...r, ultimaGenerada: marca[r.id], updated_at: nowIso() } : r
            ),
          };
        });
        return creadas;
      },

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

      // No-op si tiene movimientos o recurrencias: el invariante "ningún
      // accountId huérfano" lo garantiza el store, no solo la pantalla que hoy
      // lo comprueba.
      deleteAccount: (id) =>
        set((state) => {
          if (accountIsUsed(id, state.expenses, state.recurrences)) return {};
          return {
            accounts: state.accounts.filter((a) => a.id !== id),
            tombstones: tombstoned(state.tombstones, id),
          };
        }),

      // ── Deudas ──
      // Una deuda nueva nace ANCLADA (spec §5.4.3): su saldo se deriva de sus
      // pagos, así que pagos concurrentes en dos dispositivos se suman.
      addDebt: (d) => {
        const id = newId();
        set((state) => {
          const base = normalizarDeuda({ ...d, id, updated_at: nowIso() });
          const saldoBase = roundMoneyLocal(Math.max(0, base.balance));
          const nueva: Debt = { ...base, balance: saldoBase, saldoBase };
          delete nueva.contadoBase;
          if (base.statementBalance !== undefined) nueva.contadoBase = base.statementBalance;
          return { debts: [...state.debts, nueva] };
        });
        return id;
      },

      // Saldo y contado solo se REBASAN si el valor recibido difiere del
      // derivado actual (el formulario siempre reenvía el saldo: editar la tasa
      // no debe tocar la base, spec §3.A.2). Cambiar el saldo de una deuda no
      // anclada la ancla con el valor nuevo (§5.4.2). Vaciar el contado quita
      // también su base (normalizarDeuda).
      updateDebt: (id, partial) =>
        set((state) => {
          const actual = state.debts.find((d) => d.id === id);
          if (!actual) return { tombstones: clearedTombstone(state.tombstones, id) };
          const { balance, statementBalance, saldoBase: _saldoBase, contadoBase: _contadoBase, ...resto } = partial;
          let n: Debt = { ...actual, ...resto };
          n = rebasarDeuda(
            n,
            state.expenses,
            {
              ...(balance !== undefined ? { balance } : {}),
              ...(statementBalance !== undefined ? { statementBalance } : {}),
            },
            state.descuentosDePago,
          );
          if ('statementBalance' in partial && statementBalance === undefined) {
            delete n.statementBalance;
            delete n.contadoBase;
          }
          const normalizada = normalizarDeuda({ ...n, updated_at: nowIso() });
          return {
            debts: state.debts.map((d) => (d.id === id ? normalizada : d)),
            tombstones: clearedTombstone(state.tombstones, id),
          };
        }),

      deleteDebt: (id) =>
        set((state) => ({
          debts: state.debts.filter((d) => d.id !== id),
          tombstones: tombstoned(state.tombstones, id),
        })),

      // Un pago de deuda NO es gasto: va siempre como salida de cuenta sin
      // destino (transferencia + debtId). Resta de la cuenta de origen, no
      // suma a los gastos y es el historial de la deuda. addTransaction baja
      // el saldo en el mismo set() (invariante de deudas).
      registerDebtPayment: (id, pago) => {
        const debt = get().debts.find((d) => d.id === id);
        if (!debt) return;
        get().addTransaction({
          type: 'transfer',
          amount: pago.amount,
          concept: `Pago ${debt.name}`,
          date: pago.date,
          category: TRANSFER_CATEGORY,
          method: pago.accountId ? 'transfer' : 'cash',
          businessType: debt.tag,
          accountId: pago.accountId,
          toAccountId: null,
          debtId: debt.id,
        });
      },

      // Vincular/desvincular NO mueven el saldo mostrado. Lo vinculado queda
      // marcado `debtHistorico` en el propio movimiento (sincronizado), así
      // borrarlo o editarlo tampoco devuelve nada a la deuda en ningún
      // dispositivo. Ya no se escribe en `descuentosDePago`.
      vincularPagoHistorico: (txId, debtId) =>
        set((state) => {
          if (!state.debts.some((d) => d.id === debtId)) return {};
          const tx = state.expenses.find((e) => e.id === txId);
          // Un movimiento que ya paga una deuda no se puede vincular encima.
          if (!tx || tx.debtId) return {};
          return {
            expenses: state.expenses.map((e) =>
              e.id === txId ? { ...e, debtId, debtHistorico: true as const, updated_at: nowIso() } : e,
            ),
            tombstones: clearedTombstone(state.tombstones, txId),
            pendienteHidratar: sinPendienteHidratar(state.pendienteHidratar, txId),
          };
        }),

      desvincularPago: (txId) =>
        set((state) => {
          const { [txId]: _descuento, ...descuentosDePago } = state.descuentosDePago;
          const tx = state.expenses.find((e) => e.id === txId);
          if (!tx || !tx.debtId) return { descuentosDePago };
          const { debtId: _quitado, debtHistorico: _historico, ...resto } = tx;
          const expenses = state.expenses.map((e) => (e.id === txId ? { ...resto, updated_at: nowIso() } : e));
          let debts = state.debts;
          const deuda = state.debts.find((d) => d.id === tx.debtId);
          // Un pago que descontaba de una anclada: sin él el saldo derivado
          // subiría, así que se rebasa al saldo que se mostraba.
          if (deuda && deuda.saldoBase !== undefined && !tx.debtHistorico) {
            const conservada = rebasarDeuda(deuda, expenses, {
              balance: deuda.balance,
              ...(deuda.statementBalance !== undefined ? { statementBalance: deuda.statementBalance } : {}),
            });
            if (conservada !== deuda) {
              debts = state.debts.map((d) => (d.id === deuda.id ? { ...conservada, updated_at: nowIso() } : d));
            }
          }
          return {
            expenses,
            descuentosDePago,
            debts: recalcularSaldos(debts, expenses),
            pendienteHidratar: sinPendienteHidratar(state.pendienteHidratar, txId),
          };
        }),

      confirmarSaldoDeuda: (id) =>
        set((state) => {
          const deuda = state.debts.find((d) => d.id === id);
          if (!deuda || deuda.saldoBase !== undefined) return {};
          const anclada = normalizarDeuda({ ...anclarDeuda(deuda, state.expenses, state.descuentosDePago), updated_at: nowIso() });
          const debts = state.debts.map((d) => (d.id === id ? anclada : d));
          return { debts: recalcularSaldos(debts, state.expenses) };
        }),

      limpiarPendienteHidratar: () => set({ pendienteHidratar: { debts: [], expenses: [] } }),

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
        const expenses = sellar(data.expenses);
        set({
          expenses,
          accounts: sellar(data.accounts),
          // Un respaldo viejo trae deudas sin saldoBase: entran no ancladas.
          // normalizarDeuda sanea cada deuda importada (igual que cualquier
          // otro camino de escritura) antes de recalcular sus saldos.
          debts: recalcularSaldos(sellar(data.debts).map(normalizarDeuda), expenses),
          assets: sellar(data.assets),
          networth: sellar(data.networth),
          budgetLines: sellar(data.budgetLines),
          recurrences: sellar(data.recurrences),
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
        return filtrarPorMes(expenses, currentViewDate);
      },
    }),
    {
      name: CLAVE_PERSISTENCIA,
      version: 17,
      migrate: (persistedState: unknown, version: number) => {
        try {
          return migrarEstadoPersistido(persistedState, version);
        } catch (err: unknown) {
          // Estado inesperado: arrancar limpio antes que romper la app. Pero
          // persist guardará enseguida el estado vacío encima del original,
          // así que antes se copia el crudo a un respaldo recuperable a mano.
          console.error('[financeStore] Migración de estado persistido fallida — reseteando:', err);
          respaldarEstadoPersistido(persistedState);
          return { ...emptyState, currentViewDate: new Date().toISOString() };
        }
      },

      partialize: (state) => ({
        expenses: state.expenses,
        budgets: state.budgets,
        budgetUpdatedAt: state.budgetUpdatedAt,
        budgetLines: state.budgetLines,
        recurrences: state.recurrences,
        currentViewDate: state.currentViewDate,
        currentFilter: state.currentFilter,
        ambito: state.ambito,
        savingsGoals: state.savingsGoals,
        accounts: state.accounts,
        debts: state.debts,
        assets: state.assets,
        networth: state.networth,
        settings: state.settings,
        customExpenseCategories: state.customExpenseCategories,
        customIncomeCategories: state.customIncomeCategories,
        tombstones: state.tombstones,
        pendienteHidratar: state.pendienteHidratar,
        descuentosDePago: state.descuentosDePago,
      }),
    }
  )
);
