// ================================================================
// TESTS — store v16: pagos de deuda como transferencia enlazada,
// vincular/desvincular históricos y migración con `pendienteHidratar`
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore, migrateV16, migrateV17 } from '@/stores/financeStore';
import { accountBalance, TRANSFER_CATEGORY } from '@/lib/accounts';
import { sumaDePagos } from '@/lib/debt-balance';
import { roundMoney } from '@/lib/utils';
import type { BackupData } from '@/lib/backup';
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

  it('el registro de descuentos (deudas no ancladas) se persiste y reset() lo vacía', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 100, statementBalance: 100 })] });
    estado().registerDebtPayment('d1', { amount: 300, date: '2026-09-20', accountId: null });
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
    const tx = () => estado().expenses.find((e) => e.id === txId)!;
    expect(tx().debtHistorico).toBe(true);
    estado().desvincularPago(txId);
    expect('debtHistorico' in tx() || 'debtId' in tx()).toBe(false);
    estado().vincularPagoHistorico(txId, id);
    expect(tx().debtHistorico).toBe(true);

    estado().registerDebtPayment(id, { amount: 100, date: '2026-09-20', accountId: null });
    const real = estado().expenses.find((e) => e.type === 'transfer')!;
    estado().vincularPagoHistorico(real.id, id); // ya paga la deuda: no-op
    expect(estado().expenses.find((e) => e.id === real.id)!.debtHistorico).toBeUndefined();
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

  it('la cadena completa desde v14 llega a v17 sin lanzar', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBe(17);
    const migrado = opciones.migrate!(
      { expenses: [mov({ id: 'm1', concept: 'Pago Visa' })], debts: [deuda()], savingsGoals: [], accounts: [] },
      14,
    ) as { pendienteHidratar: { debts: string[]; expenses: string[] }; expenses: Transaction[] };
    expect(migrado.pendienteHidratar.debts).toEqual(['d1']);
    // migrateV15 enlaza «Pago Visa» a d1; v16 ya no lo anota (tiene debtId),
    // pero v17 sí: su `debtHistorico` puede venir de otro dispositivo.
    expect(migrado.expenses[0].debtId).toBe('d1');
    expect(migrado.pendienteHidratar.expenses).toEqual(['m1']);
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

// ================================================================
// v17 — saldo derivado (spec .agents/specs/sync-saldo-deudas.md §6.2)
// ================================================================

const deudaVieja = '2026-01-01T00:00:00.000Z';
/** Deja el updated_at de todas las deudas en una fecha fija del pasado. */
const envejecerDeudas = () =>
  useFinanceStore.setState((s) => ({ debts: s.debts.map((d) => ({ ...d, updated_at: deudaVieja })) }));

describe('store v17: deudas ancladas', () => {
  beforeEach(() => estado().reset());

  it('addDebt nace anclada: saldoBase = balance y contadoBase = statementBalance', () => {
    estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().addDebt({ name: 'Auto', tag: 'personal', kind: 'Préstamo', balance: 5000, annualRate: 10, minPayment: 200, payDay: null });
    expect(estado().debts[0]).toMatchObject({ saldoBase: 1000, contadoBase: 300, balance: 1000, statementBalance: 300 });
    expect(estado().debts[1]).toMatchObject({ saldoBase: 5000, balance: 5000 });
    expect('contadoBase' in estado().debts[1]).toBe(false);
  });

  it('las acciones de movimientos no reescriben la fila de una deuda anclada', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    envejecerDeudas();
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    expect(estado().debts[0].balance).toBe(800);
    const pago = estado().expenses[0];
    estado().updateTransaction(pago.id, { amount: 300 });
    expect(estado().debts[0].balance).toBe(700);
    estado().deleteTransactions([pago.id]);
    expect(estado().debts[0].balance).toBe(1000);
    estado().restoreTransactions([pago]); // la copia guardada es la de 200
    expect(estado().debts[0].balance).toBe(800);
    estado().deleteTransaction(pago.id);
    const d = estado().debts[0];
    expect(d).toMatchObject({ balance: 1000, saldoBase: 1000, updated_at: deudaVieja });
    expect(estado().descuentosDePago).toEqual({});
  });

  it('updateDebt de la tasa (reenviando el mismo saldo, como el formulario) no rebasa', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    estado().updateDebt(id, { annualRate: 25, balance: 800, statementBalance: 100 });
    expect(estado().debts[0]).toMatchObject({ annualRate: 25, saldoBase: 1000, contadoBase: 300, balance: 800, statementBalance: 100 });
  });

  it('«Actualizar estado de cuenta» rebasa: el saldo queda en X y los pagos posteriores siguen restando', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null });
    estado().updateDebt(id, { balance: 1200, statementBalance: 0, minPayment: 60 });
    expect(estado().debts[0]).toMatchObject({ balance: 1200, statementBalance: 0, saldoBase: 1400, contadoBase: 200, minPayment: 60 });
    estado().registerDebtPayment(id, { amount: 100, date: '2026-09-25', accountId: null });
    expect(estado().debts[0].balance).toBe(1100);
  });

  it('borrar el pago de contado quita contadoBase; cambiar a préstamo también', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    estado().updateDebt(id, { statementBalance: undefined });
    expect('statementBalance' in estado().debts[0] || 'contadoBase' in estado().debts[0]).toBe(false);
    estado().updateDebt(id, { statementBalance: 120 });
    expect(estado().debts[0]).toMatchObject({ statementBalance: 120, contadoBase: 120 });
    estado().updateDebt(id, { kind: 'Préstamo' });
    expect('statementBalance' in estado().debts[0] || 'contadoBase' in estado().debts[0]).toBe(false);
    expect(estado().debts[0].saldoBase).toBe(1000);
  });

  it('vincular y desvincular un histórico no mueven el saldo de una anclada; desvincular un pago real conserva el saldo', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const viejo = estado().addTransaction({ type: 'expense', amount: 250, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    estado().vincularPagoHistorico(viejo, id);
    expect(estado().expenses.find((e) => e.id === viejo)).toMatchObject({ debtId: id, debtHistorico: true });
    expect(estado().descuentosDePago).toEqual({});
    expect(estado().debts[0].balance).toBe(1000);
    estado().desvincularPago(viejo);
    expect(estado().debts[0]).toMatchObject({ balance: 1000, saldoBase: 1000 });

    const real = estado().addTransaction({ type: 'expense', amount: 200, concept: 'Pago', date: '2026-09-10', category: 'pago-tarjetas', method: 'cash', businessType: 'personal', debtId: id });
    expect(estado().debts[0].balance).toBe(800);
    estado().desvincularPago(real);
    const tx = estado().expenses.find((e) => e.id === real)!;
    expect('debtId' in tx || 'debtHistorico' in tx).toBe(false);
    expect(estado().debts[0]).toMatchObject({ balance: 800, saldoBase: 800 });
  });

  it('quitarle la deuda a un histórico al editarlo también le quita la marca', () => {
    const id = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const viejo = estado().addTransaction({ type: 'expense', amount: 250, concept: 'Pago viejo', date: '2026-08-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal' });
    estado().vincularPagoHistorico(viejo, id);
    estado().updateTransaction(viejo, { debtId: null });
    expect('debtHistorico' in estado().expenses[0]).toBe(false);
    expect(estado().debts[0].balance).toBe(1000);
  });
});

describe('store v17: confirmarSaldoDeuda', () => {
  beforeEach(() => estado().reset());

  it('ancla una deuda legada preservando el saldo y usando el descuento efectivo', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 100, statementBalance: 100 })] });
    estado().registerDebtPayment('d1', { amount: 150, date: '2026-09-20', accountId: null });
    expect(estado().debts[0]).toMatchObject({ balance: 0, statementBalance: 0 });
    expect('saldoBase' in estado().debts[0]).toBe(false);

    estado().confirmarSaldoDeuda('d1');
    const d = estado().debts[0];
    expect(d).toMatchObject({ saldoBase: 100, contadoBase: 100, balance: 0, statementBalance: 0 });
    expect(d.updated_at).not.toBe('2026-09-01T00:00:00.000Z');

    estado().deleteTransaction(estado().expenses[0].id);
    expect(estado().debts[0]).toMatchObject({ balance: 100, statementBalance: 100 }); // no 150
  });

  it('es no-op en una deuda ya anclada o inexistente', () => {
    estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    const antes = estado().debts;
    estado().confirmarSaldoDeuda(antes[0].id);
    estado().confirmarSaldoDeuda('no-existe');
    expect(estado().debts).toBe(antes);
  });
});

describe('store v17: las deudas no ancladas se comportan como antes', () => {
  beforeEach(() => estado().reset());

  it('camino legado: registro de descuento, updated_at renovado y reversión exacta', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 100, statementBalance: 100 })] });
    estado().registerDebtPayment('d1', { amount: 300, date: '2026-09-20', accountId: null });
    const pagoId = estado().expenses[0].id;
    expect(estado().debts[0]).toMatchObject({ balance: 0, statementBalance: 0 });
    expect(estado().debts[0].updated_at).not.toBe('2026-09-01T00:00:00.000Z');
    expect(estado().descuentosDePago[pagoId]).toEqual({ balance: 100, statement: 100 });
    estado().deleteTransaction(pagoId);
    expect(estado().debts[0]).toMatchObject({ balance: 100, statementBalance: 100 });
  });

  it('cambiar el saldo de una legada en el formulario la ancla con el valor nuevo', () => {
    useFinanceStore.setState({ debts: [deuda({ balance: 700 })] });
    estado().updateDebt('d1', { annualRate: 20, balance: 700 }); // mismo saldo: no ancla
    expect('saldoBase' in estado().debts[0]).toBe(false);
    estado().updateDebt('d1', { balance: 650 });
    expect(estado().debts[0]).toMatchObject({ saldoBase: 650, balance: 650 });
  });
});

describe('store v17: invariante — en deudas ancladas balance = max(0, saldoBase − Σ)', () => {
  beforeEach(() => estado().reset());

  it('se cumple tras una secuencia aleatoria (determinista) de acciones', () => {
    let semilla = 42;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla / 2147483648;
    };
    const elegir = <T,>(xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(azar() * xs.length)] : undefined);
    const d1 = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 800, annualRate: 30, minPayment: 50, payDay: null, statementBalance: 200 });
    const d2 = estado().addDebt({ name: 'Auto', tag: 'personal', kind: 'Préstamo', balance: 5000, annualRate: 10, minPayment: 200, payDay: null });
    const borrados: Transaction[] = [];
    const comprobar = (paso: number) => {
      const suma = sumaDePagos(estado().expenses);
      for (const d of estado().debts) {
        expect(d.saldoBase, `paso ${paso}`).toBeDefined();
        const pagado = suma.get(d.id) ?? 0;
        expect(d.balance, `paso ${paso}`).toBe(roundMoney(Math.max(0, (d.saldoBase ?? 0) - pagado)));
        if (d.contadoBase !== undefined) {
          expect(d.statementBalance, `paso ${paso}`).toBe(roundMoney(Math.max(0, d.contadoBase - pagado)));
        }
      }
    };
    for (let i = 0; i < 300; i++) {
      const monto = roundMoney(1 + azar() * 400);
      const deudaElegida = elegir([d1, d2, undefined]);
      const tx = elegir(estado().expenses);
      switch (Math.floor(azar() * 9)) {
        case 0:
          estado().addTransaction({ type: 'expense', amount: monto, concept: 'P', date: '2026-09-20', category: 'pago-tarjetas', method: 'cash', businessType: 'personal', ...(deudaElegida ? { debtId: deudaElegida } : {}) });
          break;
        case 1:
          estado().registerDebtPayment(deudaElegida ?? d1, { amount: monto, date: '2026-09-20', accountId: null });
          break;
        case 2:
          if (tx) estado().updateTransaction(tx.id, { amount: monto });
          break;
        case 3:
          if (tx) estado().updateTransaction(tx.id, { debtId: deudaElegida ?? null });
          break;
        case 4:
          if (tx) { borrados.push(tx); estado().deleteTransaction(tx.id); }
          break;
        case 5:
          if (borrados.length) estado().restoreTransactions(borrados.splice(0, borrados.length));
          break;
        case 6:
          if (tx && !tx.debtId && deudaElegida) estado().vincularPagoHistorico(tx.id, deudaElegida);
          break;
        case 7:
          if (tx) estado().desvincularPago(tx.id);
          break;
        default:
          estado().updateDebt(deudaElegida ?? d2, i % 2 ? { annualRate: roundMoney(azar() * 40) } : { balance: monto });
      }
      comprobar(i);
    }
  });
});

describe('migración v17 del estado persistido', () => {
  const estadoV16 = () => ({
    debts: [deuda({ balance: 1000 })],
    expenses: [mov({ id: 'h', debtId: 'd1', amount: 250 }), mov({ id: 'real', debtId: 'd1', amount: 100 }), mov({ id: 'suelto' })],
    descuentosDePago: {
      h: { balance: 0, vinculado: true },
      real: { balance: 100 },
      suelto: { balance: 0, vinculado: true },
      fantasma: { balance: 0, vinculado: true },
    },
  });

  it('sube como debtHistorico las marcas «vinculado» locales, sin tocar montos, saldos ni anclar', () => {
    const m = migrateV17(structuredClone(estadoV16())) as { debts: Debt[]; expenses: Transaction[] };
    const h = m.expenses.find((e) => e.id === 'h')!;
    expect(h).toMatchObject({ debtId: 'd1', debtHistorico: true, amount: 250 });
    expect(h.updated_at).not.toBe('2026-09-05T00:00:00.000Z'); // renovado: el sync lo sube
    expect(m.expenses.find((e) => e.id === 'real')).toEqual(mov({ id: 'real', debtId: 'd1', amount: 100 }));
    expect(m.expenses.find((e) => e.id === 'suelto')).toEqual(mov({ id: 'suelto' })); // sin debtId: nada
    expect(m.debts).toEqual([deuda({ balance: 1000 })]);
  });

  it('es idempotente', () => {
    const una = migrateV17(structuredClone(estadoV16()));
    const dos = migrateV17(structuredClone(una));
    expect(dos).toEqual(una);
  });

  it('sin descuentosDePago o sin movimientos no cambia deudas ni movimientos', () => {
    const sinRegistro = { debts: [deuda()], expenses: [mov({ debtId: 'd1' })] };
    const m = migrateV17(structuredClone(sinRegistro)) as typeof sinRegistro & { pendienteHidratar: unknown };
    expect(m.debts).toEqual(sinRegistro.debts);
    expect(m.expenses).toEqual(sinRegistro.expenses);
    // Solo anota ids para hidratar (ver el test de pendienteHidratar).
    expect(m.pendienteHidratar).toEqual({ debts: ['d1'], expenses: ['m1'] });
    expect(migrateV17({})).toEqual({});
  });

  it('anota para hidratar todas las deudas y los movimientos con debtId, sin duplicar', () => {
    const v16 = {
      debts: [deuda({ id: 'd1' }), deuda({ id: 'd2' })],
      expenses: [mov({ id: 'm0' }), mov({ id: 'm1', debtId: 'd1' }), mov({ id: 'm2', debtId: 'd2' }), mov({ id: 'm3', debtId: null })],
      // Lo que dejó migrateV16 y aún no hidrató el sync: se conserva.
      pendienteHidratar: { debts: ['d1'], expenses: ['m0', 'm3'] },
    };
    const una = migrateV17(structuredClone(v16)) as { pendienteHidratar: { debts: string[]; expenses: string[] }; debts: Debt[]; expenses: Transaction[] };
    expect(una.pendienteHidratar).toEqual({ debts: ['d1', 'd2'], expenses: ['m0', 'm3', 'm1', 'm2'] });
    // No toca montos, saldos ni timestamps.
    expect(una.debts).toEqual(v16.debts);
    expect(una.expenses).toEqual(v16.expenses);
    const dos = migrateV17(structuredClone(una));
    expect(dos).toEqual(una);
  });

  it('una lista pendienteHidratar malformada se reconstruye', () => {
    const m = migrateV17({ debts: [deuda()], expenses: [], pendienteHidratar: { debts: 'x' } }) as { pendienteHidratar: unknown };
    expect(m.pendienteHidratar).toEqual({ debts: ['d1'], expenses: [] });
  });
});

describe('store v17: importBackup y el saldo derivado', () => {
  beforeEach(() => estado().reset());
  const respaldo = (debts: Debt[], expenses: Transaction[]): BackupData => ({
    expenses, accounts: [], debts, assets: [], networth: [], budgetLines: [], recurrences: [],
    budgets: {}, budgetUpdatedAt: {}, savingsGoals: [], customExpenseCategories: [], customIncomeCategories: [],
    settings: { debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' },
  });

  it('un respaldo viejo (sin saldoBase) entra no anclado con su saldo', () => {
    estado().importBackup(respaldo([deuda({ balance: 640 })], [mov({ debtId: 'd1', amount: 100 })]));
    const d = estado().debts[0];
    expect('saldoBase' in d).toBe(false);
    expect(d.balance).toBe(640);
  });

  it('una deuda anclada del respaldo recalcula su saldo con los pagos importados', () => {
    estado().importBackup(respaldo(
      [deuda({ balance: 999, saldoBase: 1000 })],
      [mov({ debtId: 'd1', amount: 100 }), mov({ id: 'h', debtId: 'd1', amount: 50, debtHistorico: true })],
    ));
    expect(estado().debts[0]).toMatchObject({ saldoBase: 1000, balance: 900 });
  });
});
