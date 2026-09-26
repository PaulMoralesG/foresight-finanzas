// ================================================================
// TESTS — pagos de deudas enlazados (lib/debt-payments + invariantes del store)
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { deltaDeSaldos, enlazarPagosAntiguos, historialDeuda, categoriaDePago } from '@/lib/debt-payments';
import { useFinanceStore, migrateV15 } from '@/stores/financeStore';
import type { Debt, Transaction } from '@/types';

const deuda = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000,
  annualRate: 30, minPayment: 50, payDay: 10, updated_at: '2026-09-01T00:00:00.000Z', ...o,
});
const mov = (o: Partial<Transaction> = {}): Transaction => ({
  id: 'm1', type: 'expense', amount: 100, concept: 'Pago Visa', date: '2026-09-05',
  category: 'pago-tarjetas', method: 'transfer', businessType: 'personal', accountId: null,
  toAccountId: null, updated_at: '2026-09-05T00:00:00.000Z', ...o,
});

describe('lib/debt-payments', () => {
  it('deltaDeSaldos: alta baja, borrado sube, edición compensa monto y cambio de deuda', () => {
    expect(deltaDeSaldos([], [mov({ debtId: 'd1' })])).toEqual({ d1: -100 });
    expect(deltaDeSaldos([mov({ debtId: 'd1' })], [])).toEqual({ d1: 100 });
    expect(deltaDeSaldos([mov({ debtId: 'd1', amount: 100 })], [mov({ debtId: 'd1', amount: 150 })])).toEqual({ d1: -50 });
    expect(deltaDeSaldos([mov({ debtId: 'd1' })], [mov({ debtId: 'd2' })])).toEqual({ d1: 100, d2: -100 });
    expect(deltaDeSaldos([mov()], [mov({ amount: 999 })])).toEqual({});
  });

  it('historialDeuda: pagos del más reciente al más antiguo, total y saldo reconstruido', () => {
    const h = historialDeuda(deuda({ balance: 700 }), [
      mov({ id: 'a', debtId: 'd1', date: '2026-07-10', amount: 100 }),
      mov({ id: 'b', debtId: 'd1', date: '2026-09-10', amount: 200, type: 'transfer' }),
      mov({ id: 'otro', debtId: 'd2', amount: 50 }),
      mov({ id: 'suelto', amount: 50 }),
    ]);
    expect(h.pagos.map((p) => p.id)).toEqual(['b', 'a']);
    expect(h.totalPagado).toBe(300);
    expect(h.pagos[0]).toMatchObject({ saldoDespues: 700, esGasto: false });
    expect(h.pagos[1]).toMatchObject({ saldoDespues: 900, esGasto: true });
  });

  it('enlazarPagosAntiguos: enlaza «Pago <deuda>» por nombre único y nada más', () => {
    const debts = [deuda(), deuda({ id: 'd2', name: 'Préstamo auto', kind: 'Préstamo' as Debt['kind'] }), deuda({ id: 'd3', name: 'Doble' }), deuda({ id: 'd4', name: 'Doble' })];
    const out = enlazarPagosAntiguos([
      mov({ id: 'a', concept: 'Pago Visa' }),
      mov({ id: 'b', concept: 'Pago Préstamo auto', category: 'prestamos' }),
      mov({ id: 'c', concept: 'Pago Doble' }),
      mov({ id: 'd', concept: 'Pago Visa', category: 'supermercado' }),
      mov({ id: 'e', concept: 'Visa' }),
    ], debts, '2026-09-26T00:00:00.000Z');
    expect(out.map((m) => m.debtId ?? null)).toEqual(['d1', 'd2', null, null, null]);
    expect(out[0].updated_at).toBe('2026-09-26T00:00:00.000Z');
  });

  it('categoriaDePago: tarjeta → pago-tarjetas; el resto → prestamos', () => {
    expect(categoriaDePago('Tarjeta de crédito')).toBe('pago-tarjetas');
    expect(categoriaDePago('Otro')).toBe('prestamos');
  });
});

describe('store: el saldo de la deuda sigue a sus pagos', () => {
  beforeEach(() => useFinanceStore.getState().reset());

  const nuevaDeuda = (balance = 1000) =>
    useFinanceStore.getState().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance, annualRate: 30, minPayment: 50, payDay: null });
  const saldo = (id: string) => useFinanceStore.getState().debts.find((d) => d.id === id)!.balance;

  it('un gasto de Movimientos enlazado a la deuda baja su saldo', () => {
    const d = nuevaDeuda();
    useFinanceStore.getState().addTransaction({ type: 'expense', amount: 250, concept: 'Pago tarjeta', date: '2026-09-20', category: 'pago-tarjetas', method: 'transfer', businessType: 'personal', debtId: d });
    expect(saldo(d)).toBe(750);
  });

  it('editar el monto o cambiar de deuda ajusta ambos saldos', () => {
    const d1 = nuevaDeuda(1000);
    const d2 = nuevaDeuda(500);
    const id = useFinanceStore.getState().addTransaction({ type: 'expense', amount: 100, concept: 'P', date: '2026-09-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal', debtId: d1 });
    useFinanceStore.getState().updateTransaction(id, { amount: 300 });
    expect(saldo(d1)).toBe(700);
    useFinanceStore.getState().updateTransaction(id, { debtId: d2 });
    expect(saldo(d1)).toBe(1000);
    expect(saldo(d2)).toBe(200);
  });

  it('borrar un pago devuelve el saldo, y deshacer lo vuelve a descontar', () => {
    const d = nuevaDeuda();
    useFinanceStore.getState().registerDebtPayment(d, { amount: 200, date: '2026-09-20', accountId: null, asExpense: true });
    expect(saldo(d)).toBe(800);
    const pago = useFinanceStore.getState().expenses[0];
    expect(pago).toMatchObject({ debtId: d, type: 'expense', category: 'pago-tarjetas' });
    useFinanceStore.getState().deleteTransactions([pago.id]);
    expect(saldo(d)).toBe(1000);
    useFinanceStore.getState().restoreTransactions([pago]);
    expect(saldo(d)).toBe(800);
    useFinanceStore.getState().deleteTransaction(pago.id);
    expect(saldo(d)).toBe(1000);
  });

  it('un movimiento sin deuda no toca ninguna deuda', () => {
    const d = nuevaDeuda();
    useFinanceStore.getState().addTransaction({ type: 'expense', amount: 90, concept: 'Súper', date: '2026-09-20', category: 'supermercado', method: 'cash', businessType: 'personal' });
    expect(saldo(d)).toBe(1000);
  });
});

describe('migración v15 del estado persistido', () => {
  it('enlaza los pagos antiguos sin tocar saldos', () => {
    const migrado = migrateV15({ debts: [deuda({ balance: 400 })], expenses: [mov({ concept: 'Pago Visa' })] }) as { debts: Debt[]; expenses: Transaction[] };
    expect(migrado.expenses[0].debtId).toBe('d1');
    expect(migrado.debts[0].balance).toBe(400);
  });

  it('está en la cadena de migrate con la versión 15', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBe(15);
    const migrado = opciones.migrate!({ expenses: [mov({ concept: 'Pago Visa' })], debts: [deuda()], savingsGoals: [], accounts: [] }, 14) as { expenses: Transaction[] };
    expect(migrado.expenses[0].debtId).toBe('d1');
  });
});
