// ================================================================
// TESTS — cadena de migraciones del estado persistido (financeStore)
// Cada migrateVN solo debe correr si la versión persistida es menor que N:
// un cliente que ya pasó por una migración no la vuelve a ejecutar en el
// siguiente bump de versión (p. ej. migrateV15 no revincula un pago que el
// usuario desvinculó a mano).
// ================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { useFinanceStore } from '@/stores/financeStore';
import type { Debt, Transaction } from '@/types';

const CLAVE = 'foresight-finance-storage';

const deuda = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000,
  annualRate: 30, minPayment: 50, payDay: 10, updated_at: '2026-09-01T00:00:00.000Z', ...o,
});
const mov = (o: Partial<Transaction> = {}): Transaction => ({
  id: 'm1', type: 'expense', amount: 100, concept: 'Pago Visa', date: '2026-09-05',
  category: 'pago-tarjetas', method: 'transfer', businessType: 'personal', accountId: null,
  toAccountId: null, updated_at: '2026-09-05T00:00:00.000Z', ...o,
});

const opciones = () => useFinanceStore.persist.getOptions();
const migrar = (estado: unknown, version: number) =>
  opciones().migrate!(structuredClone(estado), version) as Record<string, unknown>;

describe('migrate: cada paso se aplica solo si la versión persistida es anterior', () => {
  it('la versión actual del código es 17', () => {
    expect(opciones().version).toBe(17);
  });

  it('desde una versión antigua (v7) aplica todas las migraciones intermedias, en orden', () => {
    const v7 = {
      expenses: [
        { id: 1, type: 'expense', amount: 100, concept: 'Pago Visa', date: '2026-08-05', category: 'pago-tarjetas', method: 'transfer', businessType: 'personal' },
        { id: 2, type: 'expense', amount: 50, concept: 'Hucha', date: '2026-08-06', category: 'ahorro', method: 'cash', businessType: 'personal' },
      ],
      budgets: { '2026-08': 400 },
      savingsGoal: 0,
      savingsGoals: [{ id: 'g1', concept: 'Hucha', target: 1000 }],
      debts: [deuda()],
      nextId: 3,
    };
    const m = migrar(v7, 7) as {
      expenses: Array<Record<string, unknown>>; savingsGoals: Array<Record<string, unknown>>;
      accounts: unknown[]; settings: Record<string, unknown>; assets: unknown[]; networth: unknown[];
      budgetLines: unknown[]; recurrences: unknown[]; tombstones: unknown; nextId?: unknown;
      pendienteHidratar: { debts: string[]; expenses: string[] }; descuentosDePago: unknown;
    };
    // v8: ids a string, sin contadores, tombstones inicializados
    expect(m.expenses.map((e) => e.id)).toEqual(['legacy-1', 'legacy-2']);
    expect(m.nextId).toBeUndefined();
    expect(m.tombstones).toEqual({});
    // v9: cuentas y accountId normalizado
    expect(m.accounts).toEqual([]);
    expect(m.expenses[0].accountId).toBeNull();
    // v10: ajustes normalizados (las deudas existentes se conservan)
    expect(m.settings).toEqual({ debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' });
    // v11
    expect(m.assets).toEqual([]);
    expect(m.networth).toEqual([]);
    // v12: presupuesto global repartido por categoría
    expect(m.budgetLines.length).toBeGreaterThan(0);
    // v13: la meta recibe su `saved` histórico una sola vez
    expect(m.savingsGoals[0]).toMatchObject({ tag: 'personal', saved: 50, savedFromAccounts: 0 });
    // v14
    expect(m.recurrences).toEqual([]);
    // v15 antes que v16: el pago se enlaza y v16 ya no lo anota; v17 sí (debtHistorico)
    expect(m.expenses[0].debtId).toBe('d1');
    expect(m.pendienteHidratar).toEqual({ debts: ['d1'], expenses: ['legacy-2', 'legacy-1'] });
    expect(m.descuentosDePago).toEqual({});
  });

  it('desde v15 solo aplica v16: migrateV15 no revincula un pago desvinculado a mano', () => {
    const v15 = {
      // «Pago Visa» sin debtId: el usuario lo desvinculó después de migrar a v15
      expenses: [{ ...mov(), accountId: undefined, toAccountId: undefined }],
      debts: [deuda()],
      // meta sin `saved`/`tag`: si migrateV13 se re-aplicara la tocaría
      savingsGoals: [{ id: 'g1', concept: 'Hucha', target: 1000 }],
      accounts: [],
      recurrences: [],
    };
    const m = migrar(v15, 15) as {
      expenses: Array<Record<string, unknown>>; savingsGoals: Array<Record<string, unknown>>;
      pendienteHidratar: { debts: string[]; expenses: string[] }; descuentosDePago: unknown;
    };
    // v15 no se re-aplica: sigue sin deuda y sin updated_at renovado
    expect(m.expenses[0].debtId).toBeUndefined();
    expect(m.expenses[0].updated_at).toBe('2026-09-05T00:00:00.000Z');
    // v9 y v13 tampoco se re-aplican
    expect('accountId' in m.expenses[0] && m.expenses[0].accountId !== undefined).toBe(false);
    expect(m.savingsGoals[0]).toEqual({ id: 'g1', concept: 'Hucha', target: 1000 });
    // v16 sí se aplica
    expect(m.pendienteHidratar).toEqual({ debts: ['d1'], expenses: ['m1'] });
    expect(m.descuentosDePago).toEqual({});
  });

  it('desde v14 aplica v15, v16 y v17 (el enlace automático sí corre una vez)', () => {
    const m = migrar({ expenses: [mov()], debts: [deuda()], savingsGoals: [], accounts: [] }, 14) as {
      expenses: Transaction[]; pendienteHidratar: { debts: string[]; expenses: string[] };
    };
    expect(m.expenses[0].debtId).toBe('d1');
    // v16 no anota el pago enlazado; v17 sí (su debtHistorico puede venir del remoto)
    expect(m.pendienteHidratar).toEqual({ debts: ['d1'], expenses: ['m1'] });
  });

  it('desde v16 solo aplica v17: sube las marcas «vinculado» y no toca nada más', () => {
    const v16 = {
      expenses: [mov({ debtId: 'd1' })],
      debts: [deuda()],
      savingsGoals: [{ id: 'g1', concept: 'Hucha', target: 1000 }],
      accounts: [],
      recurrences: [],
      descuentosDePago: { m1: { balance: 0, vinculado: true } },
      pendienteHidratar: { debts: [], expenses: [] },
    };
    const m = migrar(v16, 16) as { expenses: Transaction[]; debts: Debt[]; savingsGoals: unknown[]; pendienteHidratar: unknown };
    expect(m.expenses[0]).toMatchObject({ debtId: 'd1', debtHistorico: true, amount: 100 });
    expect(m.debts).toEqual([deuda()]); // no ancla
    expect(m.savingsGoals).toEqual(v16.savingsGoals);
    expect(m.pendienteHidratar).toEqual({ debts: ['d1'], expenses: ['m1'] });
  });

  it('en la versión actual (v17) es un no-op real', () => {
    const v17 = {
      expenses: [mov()],
      debts: [deuda()],
      savingsGoals: [{ id: 'g1', concept: 'Hucha', target: 1000 }],
      accounts: [],
      recurrences: [],
      descuentosDePago: { m1: { balance: 0, vinculado: true } },
    };
    expect(migrar(v17, 17)).toEqual(v17);
  });

  it('un estado persistido nulo no rompe la migración', () => {
    expect(() => migrar(null, 16)).not.toThrow();
    expect(() => migrar(null, 0)).not.toThrow();
  });
});

describe('rehidratación real desde localStorage con versión 15', () => {
  afterEach(() => {
    localStorage.removeItem(CLAVE);
    useFinanceStore.getState().reset();
  });

  it('no revincula el pago que el usuario desvinculó', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({
      state: { expenses: [mov()], debts: [deuda()], savingsGoals: [], accounts: [], recurrences: [] },
      version: 15,
    }));
    await useFinanceStore.persist.rehydrate();
    const { expenses, pendienteHidratar } = useFinanceStore.getState();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].debtId).toBeUndefined();
    expect(pendienteHidratar).toEqual({ debts: ['d1'], expenses: ['m1'] });
  });
});
