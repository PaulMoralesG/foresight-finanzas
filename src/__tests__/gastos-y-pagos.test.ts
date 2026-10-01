// ================================================================
// TESTS — un pago de deuda NO es gasto (lib/debt-payments) y monto a pagar
// de una tarjeta (lib/credit-card.estadoTarjeta)
// ================================================================

import { describe, it, expect } from 'vitest';
import {
  esPagoDeDeuda,
  cuentaComoGasto,
  etiquetaPago,
  cuentaSugeridaParaPago,
  gastosSinVincular,
} from '@/lib/debt-payments';
import { estadoTarjeta } from '@/lib/credit-card';
import type { Account, Debt, Transaction } from '@/types';

const deuda = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000,
  annualRate: 30, minPayment: 50, payDay: 10, updated_at: '2026-09-01T00:00:00.000Z', ...o,
});
const mov = (o: Partial<Transaction> = {}): Transaction => ({
  id: 'm1', type: 'expense', amount: 100, concept: 'Pago Visa', date: '2026-09-05',
  category: 'pago-tarjetas', method: 'transfer', businessType: 'personal', accountId: null,
  toAccountId: null, updated_at: '2026-09-05T00:00:00.000Z', ...o,
});
const cuenta = (o: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Caja', kind: 'Efectivo', initialBalance: 0, updated_at: '2026-09-01T00:00:00.000Z', ...o,
});

describe('cuentaComoGasto / esPagoDeDeuda', () => {
  it('un gasto sin debtId cuenta como gasto', () => {
    expect(cuentaComoGasto(mov())).toBe(true);
    expect(cuentaComoGasto(mov({ debtId: null }))).toBe(true);
  });

  it('un gasto con debtId no cuenta como gasto', () => {
    expect(cuentaComoGasto(mov({ debtId: 'd1' }))).toBe(false);
  });

  it('una transferencia con debtId no cuenta como gasto', () => {
    expect(cuentaComoGasto(mov({ type: 'transfer', debtId: 'd1', category: 'transferencia' }))).toBe(false);
  });

  it('un ingreso no cuenta como gasto', () => {
    expect(cuentaComoGasto(mov({ type: 'income' }))).toBe(false);
  });

  it('esPagoDeDeuda depende solo de debtId', () => {
    expect(esPagoDeDeuda(mov({ debtId: 'd1' }))).toBe(true);
    expect(esPagoDeDeuda(mov({ type: 'transfer', debtId: 'd1' }))).toBe(true);
    expect(esPagoDeDeuda(mov())).toBe(false);
    expect(esPagoDeDeuda(mov({ debtId: null }))).toBe(false);
  });
});

describe('etiquetaPago', () => {
  const debts = [deuda(), deuda({ id: 'd2', name: 'Préstamo auto', kind: 'Préstamo' }), deuda({ id: 'd3', name: 'Casa', kind: 'Hipoteca' })];

  it('sin concepto, tarjeta de crédito', () => {
    expect(etiquetaPago(mov({ debtId: 'd1', concept: '' }), debts)).toBe('Pago de tarjeta · Visa');
  });

  it('sin concepto, préstamo (y cualquier otra deuda que no sea tarjeta)', () => {
    expect(etiquetaPago(mov({ debtId: 'd2', concept: '' }), debts)).toBe('Pago de préstamo · Préstamo auto');
    expect(etiquetaPago(mov({ debtId: 'd3', concept: '' }), debts)).toBe('Pago de préstamo · Casa');
  });

  it('sin concepto, deuda eliminada', () => {
    expect(etiquetaPago(mov({ debtId: 'borrada', concept: '' }), debts)).toBe('Pago de deuda eliminada');
  });

  it('un movimiento sin debtId conserva su concepto', () => {
    expect(etiquetaPago(mov({ concept: 'Supermercado' }), debts)).toBe('Supermercado');
  });

  it('con debtId, un concepto no vacío manda siempre — el usuario lo editó a propósito', () => {
    expect(etiquetaPago(mov({ debtId: 'd1', concept: 'Pago de la tarjeta de septiembre' }), debts)).toBe(
      'Pago de la tarjeta de septiembre',
    );
  });
});

describe('cuentaSugeridaParaPago', () => {
  const cuentas = [
    cuenta({ id: 'efectivo', kind: 'Efectivo' }),
    cuenta({ id: 'banco1', kind: 'Banco' }),
    cuenta({ id: 'banco2', kind: 'Banco' }),
  ];

  it('prefiere la cuenta del último pago enlazado de esa deuda', () => {
    const pagos = [
      mov({ id: 'a', debtId: 'd1', date: '2026-08-01', accountId: 'banco1' }),
      mov({ id: 'b', debtId: 'd1', date: '2026-09-01', accountId: 'efectivo' }),
      mov({ id: 'c', debtId: 'otra', date: '2026-09-20', accountId: 'banco2' }),
    ];
    expect(cuentaSugeridaParaPago(deuda(), pagos, cuentas)).toBe('efectivo');
  });

  it('ignora pagos sin cuenta o con una cuenta que ya no existe', () => {
    const pagos = [
      mov({ id: 'a', debtId: 'd1', date: '2026-08-01', accountId: 'banco2' }),
      mov({ id: 'b', debtId: 'd1', date: '2026-09-01', accountId: null }),
      mov({ id: 'c', debtId: 'd1', date: '2026-09-10', accountId: 'borrada' }),
    ];
    expect(cuentaSugeridaParaPago(deuda(), pagos, cuentas)).toBe('banco2');
  });

  it('sin pagos previos: la primera cuenta de tipo Banco', () => {
    expect(cuentaSugeridaParaPago(deuda(), [], cuentas)).toBe('banco1');
  });

  it('sin cuentas Banco: la primera cuenta', () => {
    expect(cuentaSugeridaParaPago(deuda(), [], [cuenta({ id: 'x', kind: 'Efectivo' }), cuenta({ id: 'y', kind: 'Ahorros' })])).toBe('x');
  });

  it('sin cuentas: null', () => {
    expect(cuentaSugeridaParaPago(deuda(), [], [])).toBeNull();
  });
});

describe('gastosSinVincular', () => {
  const movs = [
    mov({ id: 'ok1', category: 'pago-tarjetas', date: '2026-08-10' }),
    mov({ id: 'ok2', category: 'pago-tarjetas', date: '2026-09-10' }),
    mov({ id: 'enlazado', category: 'pago-tarjetas', debtId: 'd1' }),
    mov({ id: 'transfer', category: 'pago-tarjetas', type: 'transfer' }),
    mov({ id: 'ingreso', category: 'pago-tarjetas', type: 'income' }),
    mov({ id: 'prestamo', category: 'prestamos' }),
    mov({ id: 'otro', category: 'supermercado' }),
  ];

  it('tarjeta: solo gastos de pago-tarjetas sin debtId, del más reciente al más antiguo', () => {
    expect(gastosSinVincular(deuda(), movs).map((m) => m.id)).toEqual(['ok2', 'ok1']);
  });

  it('préstamo: usa la categoría prestamos', () => {
    expect(gastosSinVincular(deuda({ kind: 'Préstamo' }), movs).map((m) => m.id)).toEqual(['prestamo']);
  });
});

describe('estadoTarjeta: montoAPagar / origenMonto', () => {
  const hoy = '2026-09-26';

  it('el pago de contado tiene prioridad sobre el mínimo', () => {
    const e = estadoTarjeta(deuda({ statementBalance: 480, minPayment: 50 }), hoy);
    expect(e).toMatchObject({ montoAPagar: 480, origenMonto: 'contado' });
  });

  it('sin contado: el mínimo', () => {
    const e = estadoTarjeta(deuda({ minPayment: 50 }), hoy);
    expect(e).toMatchObject({ montoAPagar: 50, origenMonto: 'minimo' });
  });

  it('sin contado ni mínimo (pago variable): null', () => {
    const e = estadoTarjeta(deuda({ minPayment: 0 }), hoy);
    expect(e).toMatchObject({ montoAPagar: null, origenMonto: null });
  });

  it('contado en 0: cubierto, no hay nada que pagar (no cae al mínimo)', () => {
    const e = estadoTarjeta(deuda({ statementBalance: 0, minPayment: 50 }), hoy);
    expect(e).toMatchObject({ contadoCubierto: true, montoAPagar: 0, origenMonto: 'contado' });
  });
});
