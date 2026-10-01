// ================================================================
// TESTS — lib/debt-balance: saldo de deuda derivado de sus pagos
// (spec .agents/specs/sync-saldo-deudas.md §6.1)
// ================================================================

import { describe, it, expect } from 'vitest';
import {
  estaAnclada, pagaDeuda, sumaDePagos, saldoDerivado, recalcularSaldos,
  anclarDeuda, rebasarDeuda, efectoDeBorrar,
} from '@/lib/debt-balance';
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

describe('lib/debt-balance', () => {
  it('estaAnclada y pagaDeuda', () => {
    expect(estaAnclada(deuda())).toBe(false);
    expect(estaAnclada(deuda({ saldoBase: 0 }))).toBe(true);
    expect(pagaDeuda(mov({ debtId: 'd1' }), 'd1')).toBe(true);
    expect(pagaDeuda(mov({ debtId: 'd2' }), 'd1')).toBe(false);
    expect(pagaDeuda(mov({ debtId: 'd1', debtHistorico: true }), 'd1')).toBe(false);
    expect(pagaDeuda(mov(), 'd1')).toBe(false);
  });

  it('sumaDePagos: una pasada, redondeada, sin históricos ni movimientos sueltos', () => {
    const suma = sumaDePagos([
      mov({ id: 'a', debtId: 'd1', amount: 100.1 }),
      mov({ id: 'b', debtId: 'd1', amount: 200.2, type: 'transfer' }),
      mov({ id: 'c', debtId: 'd2', amount: 50 }),
      mov({ id: 'h', debtId: 'd1', amount: 999, debtHistorico: true }),
      mov({ id: 's', amount: 70 }),
    ]);
    expect(suma.get('d1')).toBe(300.3);
    expect(suma.get('d2')).toBe(50);
    expect(suma.size).toBe(2);
  });

  it('saldoDerivado: tope a 0 agregado (150 y 30 sobre 100 → 0; sin el de 150 → 70)', () => {
    const d = deuda({ saldoBase: 100, contadoBase: 100, balance: 0, statementBalance: 0 });
    const ambos = sumaDePagos([mov({ id: 'a', debtId: 'd1', amount: 150 }), mov({ id: 'b', debtId: 'd1', amount: 30 })]);
    expect(saldoDerivado(d, ambos)).toEqual({ balance: 0, statementBalance: 0 });
    const soloB = sumaDePagos([mov({ id: 'b', debtId: 'd1', amount: 30 })]);
    expect(saldoDerivado(d, soloB)).toEqual({ balance: 70, statementBalance: 70 });
  });

  it('saldoDerivado: una deuda no anclada devuelve sus valores actuales', () => {
    const suma = sumaDePagos([mov({ debtId: 'd1', amount: 300 })]);
    expect(saldoDerivado(deuda({ balance: 640 }), suma)).toEqual({ balance: 640 });
    expect(saldoDerivado(deuda({ balance: 640, statementBalance: 20 }), suma)).toEqual({ balance: 640, statementBalance: 20 });
  });

  it('recalcularSaldos: corrige la caché sin tocar updated_at y conserva referencias', () => {
    const anclada = deuda({ id: 'd1', saldoBase: 1000, balance: 1000, updated_at: 'X' });
    const legada = deuda({ id: 'd2', balance: 500 });
    const pagos = [mov({ debtId: 'd1', amount: 100 }), mov({ id: 'm2', debtId: 'd2', amount: 50 })];
    const out = recalcularSaldos([anclada, legada], pagos);
    expect(out[0]).toMatchObject({ balance: 900, saldoBase: 1000, updated_at: 'X' });
    expect(out[1]).toBe(legada);

    const estable = [out[0], legada];
    expect(recalcularSaldos(estable, pagos)).toBe(estable); // nada cambia → mismo array
    const sinAncladas = [legada];
    expect(recalcularSaldos(sinAncladas, pagos)).toBe(sinAncladas);
  });

  it('recalcularSaldos: el pago de contado se deriva de contadoBase', () => {
    const d = deuda({ saldoBase: 1000, contadoBase: 300, balance: 1000, statementBalance: 300 });
    const [n] = recalcularSaldos([d], [mov({ debtId: 'd1', amount: 200 })]);
    expect(n).toMatchObject({ balance: 800, statementBalance: 100 });
  });

  it('anclarDeuda preserva el saldo y usa el descuento efectivo del registro local', () => {
    // Deuda 100, pago legado de 150 que descontó 100 → base 100 (no 150)
    const pagada = deuda({ balance: 0, statementBalance: 0 });
    const pago = mov({ id: 'p', debtId: 'd1', amount: 150 });
    const a = anclarDeuda(pagada, [pago], { p: { balance: 100, statement: 100 } });
    expect(a).toMatchObject({ saldoBase: 100, contadoBase: 100, balance: 0, statementBalance: 0 });
    expect(saldoDerivado(a, sumaDePagos([pago])).balance).toBe(0);
    expect(saldoDerivado(a, sumaDePagos([])).balance).toBe(100); // borrar el pago devuelve 100

    // Sin registro (otro dispositivo, dato antiguo): el monto entero
    expect(anclarDeuda(deuda({ balance: 700 }), [mov({ debtId: 'd1', amount: 300 })], {}).saldoBase).toBe(1000);
    // Saldo > 0 con un pago recortado: la base preserva el saldo mostrado
    const recortado = anclarDeuda(deuda({ balance: 500 }), [mov({ debtId: 'd1', amount: 150 })], { m1: { balance: 100 } });
    expect(saldoDerivado(recortado, sumaDePagos([mov({ debtId: 'd1', amount: 150 })])).balance).toBe(500);
    // Los históricos no entran en la base
    expect(anclarDeuda(deuda({ balance: 1000 }), [mov({ debtId: 'd1', amount: 250, debtHistorico: true })], {}).saldoBase).toBe(1000);
    // Sin pago de contado no nace contadoBase; ya anclada → misma referencia
    expect('contadoBase' in anclarDeuda(deuda(), [], {})).toBe(false);
    const ya = deuda({ saldoBase: 1000 });
    expect(anclarDeuda(ya, [], {})).toBe(ya);
  });

  it('rebasarDeuda: no-op con el mismo valor; solo toca el campo que cambia', () => {
    const d = deuda({ saldoBase: 1000, balance: 800, contadoBase: 300, statementBalance: 100 });
    const pagos = [mov({ debtId: 'd1', amount: 200 })];
    expect(rebasarDeuda(d, pagos, { balance: 800, statementBalance: 100 })).toBe(d);
    expect(rebasarDeuda(d, pagos, {})).toBe(d);

    const nuevoSaldo = rebasarDeuda(d, pagos, { balance: 1200 });
    expect(nuevoSaldo).toMatchObject({ saldoBase: 1400, balance: 1200, contadoBase: 300, statementBalance: 100 });

    const nuevoContado = rebasarDeuda(d, pagos, { statementBalance: 0 });
    expect(nuevoContado).toMatchObject({ saldoBase: 1000, balance: 800, contadoBase: 200, statementBalance: 0 });

    expect(rebasarDeuda(d, pagos, { balance: -5 })).toMatchObject({ saldoBase: 200, balance: 0 });
  });

  it('rebasarDeuda ancla una deuda no anclada solo si el valor cambia', () => {
    const legada = deuda({ balance: 700, statementBalance: 50 });
    const pagos = [mov({ debtId: 'd1', amount: 300 })];
    const igual = rebasarDeuda(legada, pagos, { balance: 700 });
    expect(igual).toBe(legada);
    expect(estaAnclada(igual)).toBe(false);

    const anclada = rebasarDeuda(legada, pagos, { balance: 900 });
    expect(anclada).toMatchObject({ saldoBase: 1200, balance: 900, contadoBase: 350, statementBalance: 50 });
    expect(saldoDerivado(anclada, sumaDePagos(pagos))).toEqual({ balance: 900, statementBalance: 50 });
  });

  it('efectoDeBorrar: anclada, anclada con tope, histórico, no anclada y sin deuda', () => {
    const base1000 = deuda({ saldoBase: 1000, balance: 800 });
    const p = mov({ id: 'p', debtId: 'd1', amount: 200 });
    expect(efectoDeBorrar(p, [base1000], [p], {})).toBe(200);

    const base100 = deuda({ saldoBase: 100, balance: 0 });
    const a = mov({ id: 'a', debtId: 'd1', amount: 150 });
    const b = mov({ id: 'b', debtId: 'd1', amount: 30 });
    expect(efectoDeBorrar(a, [base100], [a, b], {})).toBe(70);
    expect(efectoDeBorrar(b, [base100], [a, b], {})).toBe(0);

    const h = mov({ id: 'h', debtId: 'd1', amount: 250, debtHistorico: true });
    expect(efectoDeBorrar(h, [base1000], [h], {})).toBe(0);
    expect(efectoDeBorrar(h, [deuda()], [h], {})).toBe(0);

    const legado = mov({ id: 'l', debtId: 'd1', amount: 300 });
    expect(efectoDeBorrar(legado, [deuda({ balance: 0 })], [legado], { l: { balance: 100 } })).toBe(100);
    expect(efectoDeBorrar(legado, [deuda({ balance: 0 })], [legado], {})).toBe(300);

    expect(efectoDeBorrar(mov(), [base1000], [], {})).toBe(0); // no paga deuda
    expect(efectoDeBorrar(p, [], [p], {})).toBe(0); // la deuda ya no existe
  });
});
