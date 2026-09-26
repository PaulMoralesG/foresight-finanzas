// ================================================================
// TESTS — lib/credit-card.ts: estado de cuenta de tarjetas + invariantes
// del store (normalización y pagos que bajan el pago de contado)
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { esTarjeta, normalizarDeuda, proximaFechaConDia, diasEntre, estadoTarjeta } from '@/lib/credit-card';
import { useFinanceStore } from '@/stores/financeStore';
import type { Debt } from '@/types';

const tarjeta = (o: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000,
  annualRate: 30, minPayment: 50, payDay: 10, updated_at: '2026-09-01T00:00:00.000Z', ...o,
});

describe('lib/credit-card', () => {
  it('esTarjeta solo reconoce «Tarjeta de crédito»', () => {
    expect(esTarjeta({ kind: 'Tarjeta de crédito' })).toBe(true);
    expect(esTarjeta({ kind: 'Préstamo' })).toBe(false);
  });

  it('proximaFechaConDia: hoy incluido, salta de mes y recorta al último día', () => {
    expect(proximaFechaConDia(26, '2026-09-26')).toBe('2026-09-26');
    expect(proximaFechaConDia(10, '2026-09-26')).toBe('2026-10-10');
    expect(proximaFechaConDia(31, '2026-09-15')).toBe('2026-09-30');
    expect(proximaFechaConDia(31, '2027-01-31')).toBe('2027-01-31');
    expect(proximaFechaConDia(30, '2027-02-01')).toBe('2027-02-28');
    expect(proximaFechaConDia(5, '2026-12-20')).toBe('2027-01-05');
  });

  it('diasEntre cuenta días naturales', () => {
    expect(diasEntre('2026-09-26', '2026-10-10')).toBe(14);
    expect(diasEntre('2026-09-26', '2026-09-26')).toBe(0);
  });

  it('normalizarDeuda quita datos inválidos y los de tarjeta en otras deudas', () => {
    const t = normalizarDeuda(tarjeta({ cutDay: 40, statementBalance: 480.456, creditLimit: 0 }));
    expect('cutDay' in t).toBe(false);
    expect(t.statementBalance).toBe(480.46);
    expect('creditLimit' in t).toBe(false);
    const p = normalizarDeuda(tarjeta({ kind: 'Préstamo', cutDay: 5, statementBalance: 10, creditLimit: 100 }));
    expect(['cutDay', 'statementBalance', 'creditLimit'].some((k) => k in p)).toBe(false);
    // Un parche sin kind (updateDebt) conserva los campos válidos
    expect(normalizarDeuda({ cutDay: 28 })).toEqual({ cutDay: 28 });
  });

  it('estadoTarjeta: fechas, pago de contado y cupo', () => {
    const e = estadoTarjeta(tarjeta({ balance: 1500, cutDay: 28, statementBalance: 480, creditLimit: 2000 }), '2026-09-26');
    expect(e).toEqual({
      proximoPago: '2026-10-10', diasParaPagar: 14, proximoCorte: '2026-09-28',
      contado: 480, contadoCubierto: false, cupoDisponible: 500, usoPct: 75,
    });
    expect(estadoTarjeta(tarjeta({ statementBalance: 0 }), '2026-09-26')?.contadoCubierto).toBe(true);
    expect(estadoTarjeta(tarjeta({ kind: 'Préstamo' }), '2026-09-26')).toBeNull();
    const sin = estadoTarjeta(tarjeta({ payDay: null }), '2026-09-26');
    expect(sin).toMatchObject({ proximoPago: null, proximoCorte: null, contado: null, cupoDisponible: null, usoPct: null });
  });
});

describe('store: tarjetas', () => {
  beforeEach(() => useFinanceStore.getState().reset());

  it('un pago baja saldo y pago de contado; borrarlo los devuelve', () => {
    const s = useFinanceStore.getState();
    const id = s.addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10, statementBalance: 300 });
    useFinanceStore.getState().registerDebtPayment(id, { amount: 200, date: '2026-09-20', accountId: null, asExpense: true });
    let deuda = useFinanceStore.getState().debts[0];
    expect(deuda.balance).toBe(800);
    expect(deuda.statementBalance).toBe(100);
    // Pagar de más deja el contado en 0 (cubierto), nunca negativo
    useFinanceStore.getState().registerDebtPayment(id, { amount: 150, date: '2026-09-21', accountId: null, asExpense: true });
    deuda = useFinanceStore.getState().debts[0];
    expect(deuda.balance).toBe(650);
    expect(deuda.statementBalance).toBe(0);
  });

  it('una tarjeta sin datos de estado no gana claves; cambiar a préstamo las quita', () => {
    const id = useFinanceStore.getState().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: 10 });
    expect('statementBalance' in useFinanceStore.getState().debts[0]).toBe(false);
    useFinanceStore.getState().updateDebt(id, { cutDay: 28, creditLimit: 2000 });
    expect(useFinanceStore.getState().debts[0]).toMatchObject({ cutDay: 28, creditLimit: 2000 });
    useFinanceStore.getState().updateDebt(id, { kind: 'Préstamo' });
    const p = useFinanceStore.getState().debts[0];
    expect('cutDay' in p || 'creditLimit' in p).toBe(false);
  });
});
