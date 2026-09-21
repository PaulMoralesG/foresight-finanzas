// ================================================================
// COPIA DE SEGURIDAD — exportar e importar todo en un JSON
//
// Portado de "Copia de seguridad" de Balance Dual. Exporta las entidades
// del store (no la vista ni los filtros) con una cabecera que identifica
// el archivo; la importación valida esa cabecera y la forma mínima de
// cada colección antes de reemplazar lo que haya.
// ================================================================

import type {
  Account, Asset, BudgetLine, Category, Debt, MonthlyBudget, NetWorthSnapshot, SavingsGoal, Settings, Transaction,
} from '@/types';

export const BACKUP_APP = 'foresight';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  expenses: Transaction[];
  accounts: Account[];
  debts: Debt[];
  assets: Asset[];
  networth: NetWorthSnapshot[];
  budgetLines: BudgetLine[];
  budgets: MonthlyBudget;
  budgetUpdatedAt: Record<string, string>;
  savingsGoals: SavingsGoal[];
  customExpenseCategories: Category[];
  customIncomeCategories: Category[];
  settings: Settings;
}

export type BackupData = Omit<Backup, 'app' | 'version' | 'exportedAt'>;

export function buildBackup(data: BackupData, ahora = new Date()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: ahora.toISOString(), ...data };
}

/** Nombre de archivo: foresight-2026-09-21.json */
export function backupFilename(ahora = new Date()): string {
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${BACKUP_APP}-${y}-${m}-${d}.json`;
}

const esLista = (v: unknown): v is unknown[] => Array.isArray(v);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const conId = (v: unknown): boolean => esObjeto(v) && typeof v.id === 'string' && v.id.length > 0;

/**
 * Valida un respaldo. Devuelve los datos listos para el store o lanza un
 * Error con un mensaje para el usuario. Las colecciones ausentes se toman
 * como vacías (un respaldo viejo puede no traer entidades nuevas); las
 * presentes tienen que tener la forma mínima.
 */
export function parseBackup(texto: string): BackupData {
  let obj: unknown;
  try {
    obj = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!esObjeto(obj) || obj.app !== BACKUP_APP) {
    throw new Error('Ese archivo no parece un respaldo de Foresight.');
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app. Actualiza la app e inténtalo de nuevo.');
  }

  const lista = <T>(clave: string): T[] => {
    const v = obj[clave];
    if (v === undefined) return [];
    if (!esLista(v) || !v.every(conId)) throw new Error(`La colección "${clave}" del respaldo está dañada.`);
    return v as T[];
  };
  const mapa = <T>(clave: string): T => {
    const v = obj[clave];
    if (v === undefined) return {} as T;
    if (!esObjeto(v)) throw new Error(`La colección "${clave}" del respaldo está dañada.`);
    return v as T;
  };

  const networthRaw = obj.networth;
  if (networthRaw !== undefined && (!esLista(networthRaw) || !networthRaw.every((n) => esObjeto(n) && typeof n.month === 'string'))) {
    throw new Error('La colección "networth" del respaldo está dañada.');
  }

  const s = esObjeto(obj.settings) ? obj.settings : {};
  const settings: Settings = {
    debtMethod: s.debtMethod === 'avalanche' ? 'avalanche' : 'snowball',
    extraPayment: typeof s.extraPayment === 'number' ? s.extraPayment : 0,
    netWorthGoal: typeof s.netWorthGoal === 'number' ? s.netWorthGoal : 0,
    updated_at: typeof s.updated_at === 'string' ? s.updated_at : '',
  };

  return {
    expenses: lista<Transaction>('expenses'),
    accounts: lista<Account>('accounts'),
    debts: lista<Debt>('debts'),
    assets: lista<Asset>('assets'),
    networth: (networthRaw ?? []) as NetWorthSnapshot[],
    budgetLines: lista<BudgetLine>('budgetLines'),
    budgets: mapa<MonthlyBudget>('budgets'),
    budgetUpdatedAt: mapa<Record<string, string>>('budgetUpdatedAt'),
    savingsGoals: lista<SavingsGoal>('savingsGoals'),
    customExpenseCategories: lista<Category>('customExpenseCategories'),
    customIncomeCategories: lista<Category>('customIncomeCategories'),
    settings,
  };
}
