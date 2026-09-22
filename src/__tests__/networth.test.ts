// ================================================================
// TESTS — lib/networth.ts (portado de netWorthNow() de Balance Dual)
// ================================================================

import { describe, it, expect } from 'vitest';
import { netWorthNow, netWorthHistory, needsSnapshot, netWorthHistoryToCsv } from '@/lib/networth';
import type { Account, Asset, Debt, SavingsGoal, Transaction } from '@/types';

const at = '2026-09-01T00:00:00.000Z';
const cuenta = (id: string, initialBalance: number): Account => ({ id, name: id, kind: 'Banco', initialBalance, updated_at: at });
const activo = (value: number): Asset => ({ id: `a${value}`, name: 'Moto', tag: 'personal', group: 'Otros activos', value, updated_at: at });
const deuda = (balance: number): Debt => ({ id: `d${balance}`, name: 'Tarjeta', tag: 'personal', kind: 'Tarjeta de crédito', balance, annualRate: 0, minPayment: 0, payDay: null, updated_at: at });
const meta = (savedFromAccounts: number): SavingsGoal => ({ id: `g${savedFromAccounts}`, concept: 'Meta', tag: 'personal', target: 1000, targetDate: null, saved: savedFromAccounts, savedFromAccounts, updated_at: at });
let n = 0;
const mov = (o: Partial<Transaction>): Transaction => ({ id: `t${++n}`, type: 'expense', amount: 100, concept: '', date: '2026-09-10', category: 'comida', method: 'card', businessType: 'personal', updated_at: at, ...o });

describe('netWorthNow', () => {
  it('activos = cuentas positivas + activos manuales + metas desde cuentas; pasivos = deudas + cuentas negativas', () => {
    const nw = netWorthNow({
      accounts: [cuenta('banco', 1000), cuenta('tarjeta', -200)],
      expenses: [mov({ type: 'expense', amount: 150, category: 'ahorro', accountId: 'banco' })],
      assets: [activo(3000)],
      debts: [deuda(2400)],
      // savedFromAccounts=150 es lo que salió de la cuenta 'banco'; el resto
      // del aporte a la meta (si lo hubiera, sin cuenta) no cuenta dos veces.
      savingsGoals: [meta(150)],
    });
    expect(nw.liquid).toBe(850); // 1000 − 150
    expect(nw.accountsDebt).toBe(200);
    expect(nw.manual).toBe(3000);
    expect(nw.goals).toBe(150);
    expect(nw.debts).toBe(2400);
    expect(nw.assets).toBe(4000); // 850 + 3000 + 150
    expect(nw.liabilities).toBe(2600);
    expect(nw.net).toBe(1400);
  });

  it('sin nada, todo en cero', () => {
    const nw = netWorthNow({ accounts: [], expenses: [], assets: [], debts: [], savingsGoals: [] });
    expect(nw).toMatchObject({ assets: 0, liabilities: 0, net: 0 });
  });
});

describe('netWorthHistoryToCsv', () => {
  it('una fila por mes, ordenada cronológicamente aunque llegue desordenada', async () => {
    const snaps = [
      { month: '2026-03', assets: 500, liabilities: 100, net: 400, updated_at: at },
      { month: '2026-01', assets: 300, liabilities: 50, net: 250, updated_at: at },
    ];
    const csv = await netWorthHistoryToCsv(snaps).text();
    expect(csv).toContain('"Mes","Activos","Pasivos","Neto"');
    const lineas = csv.split('\r\n').filter((l) => l.startsWith('"2026'));
    expect(lineas).toEqual(['"2026-01","300.00","50.00","250.00"', '"2026-03","500.00","100.00","400.00"']);
  });
});

describe('cierres mensuales', () => {
  it('netWorthHistory ordena por mes y recorta a los últimos n', () => {
    const snaps = ['2026-03', '2026-01', '2026-02'].map((month) => ({ month, assets: 1, liabilities: 0, net: 1, updated_at: at }));
    expect(netWorthHistory(snaps, 2).map((s) => s.month)).toEqual(['2026-02', '2026-03']);
  });

  it('needsSnapshot solo cuando cambia algo más de medio centavo', () => {
    const now = netWorthNow({ accounts: [cuenta('b', 100)], expenses: [], assets: [], debts: [], savingsGoals: [] });
    expect(needsSnapshot(undefined, now)).toBe(true);
    expect(needsSnapshot({ month: '2026-09', assets: 100, liabilities: 0, net: 100, updated_at: at }, now)).toBe(false);
    expect(needsSnapshot({ month: '2026-09', assets: 100.004, liabilities: 0, net: 100, updated_at: at }, now)).toBe(false);
    expect(needsSnapshot({ month: '2026-09', assets: 99, liabilities: 0, net: 99, updated_at: at }, now)).toBe(true);
  });
});
