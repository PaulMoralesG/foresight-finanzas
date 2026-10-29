// ================================================================
// TESTS — importBackup no pierde borrados pendientes ni deja estado local
// de deudas de los datos anteriores (auditoría oct-2026)
//
// Antes vaciaba `tombstones`: un borrado hecho aquí y aún no subido se
// perdía y el siguiente pull devolvía la fila borrada. Tampoco reiniciaba
// `pendienteHidratar` ni `descuentosDePago`, que hablan de los movimientos y
// deudas ANTERIORES al respaldo.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/stores/financeStore';
import type { BackupData } from '@/lib/backup';
import type { Transaction } from '@/types';

const s = () => useFinanceStore.getState();

const mov = (id: string): Transaction => ({
  id, type: 'expense', amount: 10, concept: id, date: '2026-09-01', category: 'comida',
  method: 'cash', businessType: 'personal', updated_at: '2026-09-01T00:00:00.000Z',
});

const respaldo = (expenses: Transaction[]): BackupData => ({
  expenses, accounts: [], debts: [], assets: [], networth: [], budgetLines: [], recurrences: [],
  budgets: {}, budgetUpdatedAt: {}, savingsGoals: [], customExpenseCategories: [], customIncomeCategories: [],
  settings: { debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' },
});

beforeEach(() => s().reset());

describe('importBackup', () => {
  it('conserva los tombstones de ids que NO vienen en el respaldo', () => {
    useFinanceStore.setState({ tombstones: { borrado: '2026-09-10T00:00:00.000Z' } });
    s().importBackup(respaldo([mov('e1')]));
    expect(s().tombstones.borrado).toBe('2026-09-10T00:00:00.000Z');
  });

  it('quita el tombstone de un id que SÍ viene en el respaldo (el respaldo lo restaura)', () => {
    useFinanceStore.setState({ tombstones: { e1: '2026-09-10T00:00:00.000Z', otro: '2026-09-11T00:00:00.000Z' } });
    s().importBackup(respaldo([mov('e1')]));
    expect(s().tombstones.e1).toBeUndefined();
    expect(s().tombstones.otro).toBe('2026-09-11T00:00:00.000Z');
    expect(s().expenses.map((e) => e.id)).toEqual(['e1']);
  });

  it('reinicia pendienteHidratar y descuentosDePago', () => {
    useFinanceStore.setState({
      pendienteHidratar: { debts: ['d-vieja'], expenses: ['m-viejo'] },
      descuentosDePago: { 'm-viejo': { balance: 50 } },
    });
    s().importBackup(respaldo([mov('e1')]));
    expect(s().pendienteHidratar).toEqual({ debts: [], expenses: [] });
    expect(s().descuentosDePago).toEqual({});
  });
});
