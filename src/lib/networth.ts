// ================================================================
// PATRIMONIO — aritmética pura (portado de netWorthNow() de Balance Dual)
// ================================================================

import { roundMoney } from './utils';
import { accountBalance } from './accounts';
import type { Account, Asset, AssetGroup, Debt, NetWorthSnapshot, Transaction } from '@/types';

export const ASSET_GROUPS: AssetGroup[] = ['Inversiones', 'Propiedades', 'Otros activos'];

export interface NetWorth {
  /** Saldos positivos de las cuentas. */
  liquid: number;
  /** Activos registrados a mano. */
  manual: number;
  /** Lo apartado en metas que salió de una cuenta: sigue siendo tuyo. */
  goals: number;
  /** Saldos negativos de las cuentas (una tarjeta registrada como cuenta). */
  accountsDebt: number;
  /** Deudas registradas. */
  debts: number;
  assets: number;
  liabilities: number;
  net: number;
}

interface Entrada {
  accounts: Account[];
  expenses: Transaction[];
  assets: Asset[];
  debts: Debt[];
}

export function netWorthNow({ accounts, expenses, assets, debts }: Entrada): NetWorth {
  let liquid = 0;
  let owed = 0;
  for (const a of accounts) {
    const b = accountBalance(a, expenses);
    if (b >= 0) liquid += b;
    else owed += Math.abs(b);
  }
  const manual = assets.reduce((s, a) => s + (a.value || 0), 0);
  const debtTotal = debts.reduce((s, d) => s + (d.balance || 0), 0);
  // Lo apartado en metas que ya salió de una cuenta sigue siendo tuyo: cuenta
  // como activo. Un aporte sin cuenta no restó de ningún saldo, así que no se
  // suma (se contaría dos veces).
  const goals = expenses
    .filter((t) => t.type === 'expense' && t.category === 'ahorro' && !!t.accountId)
    .reduce((s, t) => s + t.amount, 0);

  const totalAssets = roundMoney(liquid + manual + goals);
  const liabilities = roundMoney(owed + debtTotal);
  return {
    liquid: roundMoney(liquid),
    manual: roundMoney(manual),
    goals: roundMoney(goals),
    accountsDebt: roundMoney(owed),
    debts: roundMoney(debtTotal),
    assets: totalAssets,
    liabilities,
    net: roundMoney(totalAssets - liabilities),
  };
}

/** Los últimos `n` cierres, en orden cronológico. */
export function netWorthHistory(snapshots: NetWorthSnapshot[], n = 12): NetWorthSnapshot[] {
  return [...snapshots].sort((a, b) => a.month.localeCompare(b.month)).slice(-n);
}

/**
 * ¿Hace falta guardar (o reemplazar) el cierre del mes? Solo si no existe o
 * si activos o pasivos cambiaron más de medio centavo: así la curva se arma
 * sola sin escribir en cada render.
 */
export function needsSnapshot(existing: NetWorthSnapshot | undefined, now: NetWorth): boolean {
  if (!existing) return true;
  return Math.abs(existing.assets - now.assets) >= 0.005 || Math.abs(existing.liabilities - now.liabilities) >= 0.005;
}
