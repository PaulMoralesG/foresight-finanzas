// ================================================================
// TESTS — lib/backup.ts (exportar / importar JSON)
// ================================================================

import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup, backupFilename, type BackupData } from '@/lib/backup';

const datos: BackupData = {
  expenses: [{ id: 'e1', type: 'expense', amount: 10, concept: '', date: '2026-09-01', category: 'comida', method: 'cash', businessType: 'personal', updated_at: 'x' }],
  accounts: [{ id: 'a1', name: 'Banco', kind: 'Banco', initialBalance: 5, updated_at: 'x' }],
  debts: [],
  assets: [],
  networth: [{ month: '2026-08', assets: 1, liabilities: 0, net: 1, updated_at: 'x' }],
  budgetLines: [],
  recurrences: [],
  budgets: { '2026-08': 100 },
  budgetUpdatedAt: {},
  savingsGoals: [],
  customExpenseCategories: [],
  customIncomeCategories: [],
  settings: { debtMethod: 'avalanche', extraPayment: 50, netWorthGoal: 1000, updated_at: 'x' },
};

describe('backup', () => {
  it('exporta con cabecera y vuelve a importar igual', () => {
    const json = JSON.stringify(buildBackup(datos, new Date('2026-09-21T10:00:00Z')));
    expect(JSON.parse(json)).toMatchObject({ app: 'foresight', version: 1, exportedAt: '2026-09-21T10:00:00.000Z' });
    expect(parseBackup(json)).toEqual(datos);
  });

  it('rechaza JSON inválido y archivos de otra app', () => {
    expect(() => parseBackup('{')).toThrow('no es un JSON válido');
    expect(() => parseBackup(JSON.stringify({ cols: {} }))).toThrow('no parece un respaldo de Foresight');
    expect(() => parseBackup(JSON.stringify({ app: 'foresight', version: 99 }))).toThrow('versión más nueva');
  });

  it('las colecciones ausentes se toman como vacías; las dañadas se rechazan', () => {
    const minimo = parseBackup(JSON.stringify({ app: 'foresight', version: 1, expenses: [] }));
    expect(minimo.accounts).toEqual([]);
    expect(minimo.settings).toEqual({ debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' });
    expect(() => parseBackup(JSON.stringify({ app: 'foresight', version: 1, accounts: [{ name: 'sin id' }] }))).toThrow('"accounts"');
    expect(() => parseBackup(JSON.stringify({ app: 'foresight', version: 1, networth: [{ net: 1 }] }))).toThrow('"networth"');
  });

  it('el nombre de archivo lleva la fecha', () => {
    expect(backupFilename(new Date(2026, 8, 21))).toBe('foresight-2026-09-21.json');
  });

  it('conserva saldoBase, contadoBase y debtHistorico en la ida y vuelta', () => {
    const conSaldo: BackupData = {
      ...datos,
      debts: [{
        id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 900, annualRate: 30,
        minPayment: 50, payDay: null, statementBalance: 200, saldoBase: 1000, contadoBase: 300, updated_at: 'x',
      }],
      expenses: [{ ...datos.expenses[0], debtId: 'd1', debtHistorico: true }],
    };
    expect(parseBackup(JSON.stringify(buildBackup(conSaldo)))).toEqual(conSaldo);
  });
});
