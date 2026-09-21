// ================================================================
// CUENTAS — aritmética pura (portada de accountBalance() de Balance Dual)
// ================================================================

import { roundMoney } from './utils';
import type { Account, AccountKind, Transaction } from '@/types';

export const ACCOUNT_KINDS: AccountKind[] = ['Efectivo', 'Banco', 'Tarjeta', 'Ahorros'];

/** Categoría ficticia que llevan las transferencias en `Transaction.category`. */
export const TRANSFER_CATEGORY = 'transferencia';

/**
 * Saldo de una cuenta: saldo inicial + ingresos − gastos de esa cuenta.
 * Una transferencia resta en el origen y suma en el destino, y no cuenta
 * como gasto ni como ingreso en ninguna de las dos.
 */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  let bal = account.initialBalance || 0;
  for (const t of transactions) {
    if (t.type === 'transfer') {
      if (t.accountId === account.id) bal -= t.amount;
      if (t.toAccountId === account.id) bal += t.amount;
      continue;
    }
    if (t.accountId !== account.id) continue;
    bal += t.type === 'income' ? t.amount : -t.amount;
  }
  return roundMoney(bal);
}

export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  return roundMoney(accounts.reduce((s, a) => s + accountBalance(a, transactions), 0));
}

export function accountName(accounts: Account[], id: string | null | undefined): string {
  if (!id) return '—';
  return accounts.find((a) => a.id === id)?.name ?? '—';
}

/** ¿Hay movimientos que la usen (como origen o como destino)? Si sí, no se borra. */
export function accountIsUsed(id: string, transactions: Transaction[]): boolean {
  return transactions.some((t) => t.accountId === id || t.toAccountId === id);
}
