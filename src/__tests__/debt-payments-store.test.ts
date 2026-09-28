// ================================================================
// TESTS — store v16: pagos de deuda como transferencia enlazada,
// vincular/desvincular históricos y migración con `pendienteHidratar`
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore, migrateV16 } from '@/stores/financeStore';
import { accountBalance, TRANSFER_CATEGORY } from '@/lib/accounts';
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

const estado = () => useFinanceStore.getState();

describe('store: registerDebtPayment (v16)', () => {
  beforeEach(() => estado().reset());

  it('crea una transferencia sin destino enlazada a la deuda y baja balance y statementBalance', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    const pago = estado().expenses[0];
    expect(pago).toMatchObject({
      type: 'transfer',
      toAccountId: null,
      debtId: id,
      category: TRANSFER_CATEGORY,
      amount: 200,
      concept: 'Pago Visa',
      date: '2026-09-20',
    });
    expect(estado().debts[0].balance).toBe(800);
    expect(estado().debts[0].statementBalance).toBe(100);
  });

  it('con cuenta de origen, el saldo de la cuenta baja', () => {
    const cuenta = estado().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 500 });
    const id = estado().addDebt({ name: 'Préstamo', tag: 'personal', kind: 'Préstamo', balance: 900, annualRate: 10, minPayment: 100, payDay: 5 });
    estado().registerDebtPayment(id, { amount: 120, date: '2026-09-20', accountId: cuenta });
    const c = estado().accounts[0];
    expect(accountBalance(c, estado().expenses)).toBe(380);
    expect(estado().expenses[0]).toMatchObject({ type: 'transfer', accountId: cuenta, toAccountId: null, debtId: id });
    expect(estado().debts[0].balance).toBe(780);
  });

  it('una deuda inexistente no crea nada', () => {
    estado().registerDebtPayment('no-existe', { amount: 50, date: '2026-09-20', accountId: null });
    expect(estado().expenses).toHaveLength(0);
  });
});

describe('store: vincularPagoHistorico / desvincularPago', () => {
  beforeEach(() => estado().reset());

  it('vincular pone debtId sin cambiar el saldo; desvincular lo quita sin cambiar el saldo', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    const txId = estado().addTransaction({ type: 'expense', amount: 200, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    expect(estado().debts[0].balance).toBe(1000);

    estado().vincularPagoHistorico(txId, id);
    expect(estado().expenses[0].debtId).toBe(id);
    expect(estado().debts[0].balance).toBe(1000);
    expect(estado().debts[0].statementBalance).toBe(300);

    estado().desvincularPago(txId);
    expect('debtId' in estado().expenses[0] && estado().expenses[0].debtId).toBeFalsy();
    expect(estado().debts[0].balance).toBe(1000);
    expect(estado().debts[0].statementBalance).toBe(300);
  });

  it('vincular renueva updated_at del movimiento (para que el sync lo suba)', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const txId = estado().addTransaction({ type: 'expense', amount: 200, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    const antes = estado().expenses[0].updated_at;
    // Garantiza un instante posterior al de creación
    estado().vincularPagoHistorico(txId, id);
    expect(estado().expenses[0].updated_at >= antes).toBe(true);
  });

  it('un id de movimiento o de deuda inexistente no cambia nada', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const txId = estado().addTransaction({ type: 'expense', amount: 200, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    estado().vincularPagoHistorico('otro', id);
    estado().vincularPagoHistorico(txId, 'otra-deuda');
    expect(estado().expenses[0].debtId).toBeUndefined();
  });
});

describe('store: revertir el saldo al editar o borrar un pago (D8)', () => {
  beforeEach(() => estado().reset());

  it('borrar un pago registrado devuelve el saldo; editar aplica la diferencia', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    const pago = estado().expenses[0];
    estado().updateTransaction(pago.id, { amount: 300 });
    expect(estado().debts[0].balance).toBe(700);
    estado().deleteTransaction(pago.id);
    expect(estado().debts[0].balance).toBe(1000);
  });
});

describe('store: pagos mayores que el saldo o el contado se revierten exactamente', () => {
  beforeEach(() => estado().reset());
  const nuevaTarjeta = (balance: number, statementBalance: number) =>
    estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance, annualRate: 30, minPayment: 50, payDay: 10, statementBalance });
  const saldos = () => [estado().debts[0].balance, estado().debts[0].statementBalance];

  it('pago > contado y > saldo: borrarlo devuelve el valor previo', () => {
    const id = nuevaTarjeta(100, 100);
    estado().registerDebtPayment(id, { amount: 300, date: '2026-09-20', accountId: null });
    expect(saldos()).toEqual([0, 0]);
    estado().deleteTransaction(estado().expenses[0].id);
    expect(saldos()).toEqual([100, 100]);
  });

  it('pago > contado y < saldo: borrar (uno o varios) y deshacer son simétricos', () => {
    const id = nuevaTarjeta(1000, 100);
    estado().registerDebtPayment(id, { amount: 300, date: '2026-09-20', accountId: null });
    const [pago] = estado().expenses;
    expect(saldos()).toEqual([700, 0]);
    estado().deleteTransactions([pago.id]);
    expect(saldos()).toEqual([1000, 100]);
    estado().restoreTransactions([pago]);
    expect(saldos()).toEqual([700, 0]);
    estado().deleteTransactions([pago.id]);
    expect(saldos()).toEqual([1000, 100]);
  });

  it('editar el monto de un pago excesivo parte del valor previo, no del recortado', () => {
    const id = nuevaTarjeta(100, 100);
    estado().registerDebtPayment(id, { amount: 300, date: '2026-09-20', accountId: null });
    estado().updateTransaction(estado().expenses[0].id, { amount: 40 });
    expect(saldos()).toEqual([60, 60]);
    estado().updateTransaction(estado().expenses[0].id, { amount: 500 });
    expect(saldos()).toEqual([0, 0]);
    estado().deleteTransaction(estado().expenses[0].id);
    expect(saldos()).toEqual([100, 100]);
  });

  it('el registro de descuentos se persiste y reset() lo vacía', () => {
    const id = nuevaTarjeta(100, 100);
    estado().registerDebtPayment(id, { amount: 300, date: '2026-09-20', accountId: null });
    const pagoId = estado().expenses[0].id;
    const persistido = useFinanceStore.persist.getOptions().partialize!(estado()) as { descuentosDePago?: Record<string, unknown> };
    expect(persistido.descuentosDePago?.[pagoId]).toEqual({ balance: 100, statement: 100 });
    estado().reset();
    expect(estado().descuentosDePago).toEqual({});
  });
});

describe('store: un pago vinculado a mano no mueve la deuda al borrarlo ni al editarlo', () => {
  beforeEach(() => estado().reset());
  const escenario = () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    const txId = estado().addTransaction({ type: 'expense', amount: 200, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    estado().vincularPagoHistorico(txId, id);
    return { id, txId };
  };

  it('vincular y luego borrar deja el saldo (y el patrimonio) como estaban', () => {
    const { txId } = escenario();
    estado().deleteTransaction(txId);
    expect(estado().debts[0].balance).toBe(1000);
    expect(estado().debts[0].statementBalance).toBe(300);
  });

  it('borrado masivo y deshacer tampoco lo mueven', () => {
    const { txId } = escenario();
    const item = estado().expenses[0];
    estado().deleteTransactions([txId]);
    estado().restoreTransactions([item]);
    expect(estado().debts[0].balance).toBe(1000);
    expect(estado().debts[0].statementBalance).toBe(300);
  });

  it('editar el monto de un pago vinculado no toca el saldo', () => {
    const { txId } = escenario();
    estado().updateTransaction(txId, { amount: 999 });
    expect(estado().debts[0].balance).toBe(1000);
  });

  it('desvincular quita la marca; un pago real no se puede vincular encima y sí se devuelve al borrarlo', () => {
    const { id, txId } = escenario();
    estado().desvincularPago(txId);
    expect(estado().descuentosDePago[txId]).toBeUndefined();
    estado().vincularPagoHistorico(txId, id);
    expect(estado().descuentosDePago[txId]).toMatchObject({ vinculado: true });

    estado().registerDebtPayment(id, { amount: 100, date: '2026-09-20', accountId: null });
    const real = estado().expenses.find((e) => e.type === 'transfer')!;
    estado().vincularPagoHistorico(real.id, id); // ya paga la deuda: no-op
    expect(estado().descuentosDePago[real.id]).toEqual({ balance: 100, statement: 100 });
    expect(estado().debts[0].balance).toBe(900);
    estado().deleteTransaction(real.id);
    expect(estado().debts[0].balance).toBe(1000); // el real sí se devuelve
  });
});

describe('migración v16 del estado persistido', () => {
  it('pendienteHidratar: todas las deudas y solo los movimientos sin debtId', () => {
    const migrado = migrateV16({
      debts: [deuda({ id: 'd1' }), deuda({ id: 'd2' })],
      expenses: [mov({ id: 'm1' }), mov({ id: 'm2', debtId: 'd1' }), mov({ id: 'm3', debtId: null })],
    }) as { pendienteHidratar: { debts: string[]; expenses: string[] } };
    expect(migrado.pendienteHidratar.debts).toEqual(['d1', 'd2']);
    expect(migrado.pendienteHidratar.expenses).toEqual(['m1', 'm3']);
  });

  it('un estado vacío o sin arrays da listas vacías', () => {
    expect((migrateV16({}) as { pendienteHidratar: unknown }).pendienteHidratar).toEqual({ debts: [], expenses: [] });
    expect((migrateV16({ debts: [], expenses: [] }) as { pendienteHidratar: unknown }).pendienteHidratar).toEqual({ debts: [], expenses: [] });
  });

  it('es idempotente y no toca saldos ni movimientos', () => {
    const inicial = { debts: [deuda({ balance: 400 })], expenses: [mov({ id: 'm1' })] };
    const una = migrateV16(structuredClone(inicial));
    const dos = migrateV16(structuredClone(una));
    expect(dos).toEqual(una);
    expect((una as { debts: Debt[] }).debts[0].balance).toBe(400);
    expect((una as { expenses: Transaction[] }).expenses).toEqual(inicial.expenses);
  });

  it('la cadena completa desde v14 llega a v16 sin lanzar', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBe(16);
    const migrado = opciones.migrate!(
      { expenses: [mov({ id: 'm1', concept: 'Pago Visa' })], debts: [deuda()], savingsGoals: [], accounts: [] },
      14,
    ) as { pendienteHidratar: { debts: string[]; expenses: string[] }; expenses: Transaction[] };
    expect(migrado.pendienteHidratar.debts).toEqual(['d1']);
    // migrateV15 enlaza «Pago Visa» a d1: ya no queda pendiente de hidratar
    expect(migrado.expenses[0].debtId).toBe('d1');
    expect(migrado.pendienteHidratar.expenses).toEqual([]);
  });
});

describe('store: pendienteHidratar', () => {
  beforeEach(() => estado().reset());

  it('arranca vacío y limpiarPendienteHidratar lo vacía', () => {
    expect(estado().pendienteHidratar).toEqual({ debts: [], expenses: [] });
    useFinanceStore.setState({ pendienteHidratar: { debts: ['d1'], expenses: ['m1'] } });
    estado().limpiarPendienteHidratar();
    expect(estado().pendienteHidratar).toEqual({ debts: [], expenses: [] });
  });

  it('reset() lo vacía', () => {
    useFinanceStore.setState({ pendienteHidratar: { debts: ['d1'], expenses: ['m1'] } });
    estado().reset();
    expect(estado().pendienteHidratar).toEqual({ debts: [], expenses: [] });
  });

  it('se persiste (partialize)', () => {
    useFinanceStore.setState({ pendienteHidratar: { debts: ['d1'], expenses: [] } });
    const opciones = useFinanceStore.persist.getOptions();
    const persistido = opciones.partialize!(estado()) as { pendienteHidratar?: unknown };
    expect(persistido.pendienteHidratar).toEqual({ debts: ['d1'], expenses: [] });
  });
});
