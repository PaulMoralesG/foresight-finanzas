// ================================================================
// TESTS — lib/accounts.ts (saldo por cuenta, con transferencias)
// Portado de accountBalance() de Balance Dual.
// ================================================================

import { describe, it, expect } from 'vitest';
import { accountBalance, totalBalance, accountName, accountIsUsed } from '@/lib/accounts';
import { useFinanceStore } from '@/stores/financeStore';
import type { Account, Transaction } from '@/types';

const cuenta = (id: string, initialBalance = 0): Account => ({
  id,
  name: `Cuenta ${id}`,
  kind: 'Banco',
  initialBalance,
  updated_at: '2026-09-01T00:00:00.000Z',
});

let n = 0;
const mov = (overrides: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100,
  concept: '',
  date: '2026-09-10',
  category: 'comida',
  method: 'card',
  businessType: 'personal',
  updated_at: '2026-09-10T00:00:00.000Z',
  ...overrides,
});

describe('accountBalance', () => {
  it('parte del saldo inicial y suma ingresos / resta gastos de esa cuenta', () => {
    const a = cuenta('a', 150);
    const tx = [
      mov({ type: 'income', amount: 1000, accountId: 'a' }),
      mov({ type: 'expense', amount: 250, accountId: 'a' }),
      mov({ type: 'expense', amount: 999, accountId: 'otra' }), // no cuenta
      mov({ type: 'expense', amount: 999 }), // sin cuenta: no cuenta
    ];
    expect(accountBalance(a, tx)).toBe(900);
  });

  it('una transferencia resta en el origen y suma en el destino, sin ser gasto ni ingreso', () => {
    const banco = cuenta('banco', 820);
    const efectivo = cuenta('efectivo', 150);
    const tx = [mov({ type: 'transfer', amount: 300, accountId: 'banco', toAccountId: 'efectivo' })];
    expect(accountBalance(banco, tx)).toBe(520);
    expect(accountBalance(efectivo, tx)).toBe(450);
    // El total no cambia: el dinero solo cambia de sitio
    expect(totalBalance([banco, efectivo], tx)).toBe(970);
  });

  it('redondea a centavos', () => {
    const a = cuenta('a', 0.1);
    expect(accountBalance(a, [mov({ type: 'income', amount: 0.2, accountId: 'a' })])).toBe(0.3);
  });

  it('un saldo puede quedar negativo (tarjeta de crédito)', () => {
    const t = cuenta('t', 0);
    expect(accountBalance(t, [mov({ type: 'expense', amount: 80, accountId: 't' })])).toBe(-80);
  });
});

describe('helpers', () => {
  it('accountName devuelve "—" si la cuenta no existe', () => {
    expect(accountName([cuenta('a')], 'a')).toBe('Cuenta a');
    expect(accountName([cuenta('a')], 'zzz')).toBe('—');
    expect(accountName([cuenta('a')], null)).toBe('—');
  });

  it('accountIsUsed detecta movimientos de origen y de destino', () => {
    const tx = [mov({ type: 'transfer', amount: 1, accountId: 'x', toAccountId: 'y' })];
    expect(accountIsUsed('x', tx)).toBe(true);
    expect(accountIsUsed('y', tx)).toBe(true);
    expect(accountIsUsed('z', tx)).toBe(false);
  });
});

describe('financeStore.deleteAccount', () => {
  it('no borra una cuenta con movimientos (ni como origen ni como destino) y no deja tombstone', () => {
    const s = useFinanceStore.getState();
    s.reset();
    const origen = s.addAccount({ name: 'Origen', kind: 'Banco', initialBalance: 0 });
    const destino = s.addAccount({ name: 'Destino', kind: 'Efectivo', initialBalance: 0 });
    const libre = s.addAccount({ name: 'Libre', kind: 'Ahorros', initialBalance: 0 });
    useFinanceStore.setState((st) => ({
      expenses: [...st.expenses, mov({ type: 'transfer', amount: 10, accountId: origen, toAccountId: destino })],
    }));

    s.deleteAccount(origen);
    s.deleteAccount(destino);
    s.deleteAccount(libre);

    const { accounts, tombstones } = useFinanceStore.getState();
    expect(accounts.map((a) => a.id).sort()).toEqual([origen, destino].sort());
    expect(Object.keys(tombstones)).toEqual([libre]);
  });
});

describe('migración v9 del estado persistido (cuentas)', () => {
  it('añade accounts vacío y normaliza accountId/toAccountId en movimientos viejos', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBeGreaterThanOrEqual(9);
    const migrado = opciones.migrate!(
      {
        expenses: [{ id: 'e1', type: 'expense', amount: 1, updated_at: '2026-01-01T00:00:00.000Z', accountId: 42 }],
        savingsGoals: [],
        customExpenseCategories: [],
        customIncomeCategories: [],
        tombstones: {},
        budgetUpdatedAt: {},
      },
      8,
    ) as { accounts: unknown[]; expenses: Array<{ accountId: unknown; toAccountId: unknown }> };
    expect(migrado.accounts).toEqual([]);
    expect(migrado.expenses[0].accountId).toBeNull();
    expect(migrado.expenses[0].toAccountId).toBeNull();
  });

  it('conserva las cuentas de un estado ya en v9', () => {
    const opciones = useFinanceStore.persist.getOptions();
    const cuentas = [{ id: 'a', name: 'Banco', kind: 'Banco', initialBalance: 10, updated_at: '2026-01-01T00:00:00.000Z' }];
    const migrado = opciones.migrate!({ expenses: [], accounts: cuentas, savingsGoals: [] }, 9) as { accounts: unknown[] };
    expect(migrado.accounts).toEqual(cuentas);
  });
});
