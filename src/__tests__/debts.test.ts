// ================================================================
// TESTS — lib/debts.ts: projectDebts (bola de nieve / avalancha)
// Portado del motor de Balance Dual. Los casos que pide el plan: una
// deuda sola, tres con aporte extra, interés cero, deuda ya saldada, y
// un plan que no cierra.
// ================================================================

import { describe, it, expect } from 'vitest';
import { projectDebts, totalDebt, monthlyDebtPayment, payoffDate } from '@/lib/debts';
import type { Debt } from '@/types';

let n = 0;
const deuda = (overrides: Partial<Debt>): Debt => ({
  id: `d${++n}`,
  name: `Deuda ${n}`,
  tag: 'personal',
  kind: 'Préstamo',
  balance: 1000,
  annualRate: 12,
  minPayment: 100,
  payDay: null,
  updated_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('projectDebts', () => {
  it('una deuda sola: paga el mínimo mes a mes y acumula interés', () => {
    // 1000 al 12 % anual (1 % mensual), mínimo 100: cierra en 11 meses.
    const plan = projectDebts([deuda({ balance: 1000, annualRate: 12, minPayment: 100 })], 0, 'snowball');
    expect(plan.ok).toBe(true);
    expect(plan.months).toBe(11);
    expect(plan.totalInterest).toBeGreaterThan(0);
    expect(plan.totalInterest).toBeLessThan(100);
    expect(plan.schedule[0]).toEqual({ month: 0, total: 1000 });
    expect(plan.schedule[plan.schedule.length - 1].total).toBe(0);
  });

  it('interés cero: el plan es aritmética simple', () => {
    const plan = projectDebts([deuda({ balance: 500, annualRate: 0, minPayment: 100 })], 0, 'snowball');
    expect(plan.ok).toBe(true);
    expect(plan.months).toBe(5);
    expect(plan.totalInterest).toBe(0);
  });

  it('una deuda ya saldada no entra en el plan', () => {
    const plan = projectDebts([deuda({ balance: 0 })], 0, 'snowball');
    expect(plan.empty).toBe(true);
    expect(plan.months).toBe(0);
    expect(plan.schedule).toEqual([]);
  });

  it('tres deudas con aporte extra: la bola de nieve ataca primero el saldo menor', () => {
    const deudas = [
      deuda({ id: 'grande', balance: 3600, annualRate: 19, minPayment: 180 }),
      deuda({ id: 'pequena', balance: 1240, annualRate: 22, minPayment: 85 }),
      deuda({ id: 'media', balance: 2400, annualRate: 16, minPayment: 150 }),
    ];
    const plan = projectDebts(deudas, 100, 'snowball');
    expect(plan.ok).toBe(true);
    expect(plan.order).toEqual(['pequena', 'media', 'grande']);
    // La primera en saldarse es la pequeña, y antes que sin aporte extra
    expect(plan.payoff.pequena).toBeLessThan(plan.payoff.media);
    expect(plan.payoff.media).toBeLessThan(plan.payoff.grande);
    const sinExtra = projectDebts(deudas, 0, 'snowball');
    expect(plan.months).toBeLessThan(sinExtra.months);
    expect(plan.totalInterest).toBeLessThan(sinExtra.totalInterest);
  });

  it('avalancha ataca primero el interés más alto y paga menos intereses', () => {
    const deudas = [
      deuda({ id: 'cara', balance: 3000, annualRate: 30, minPayment: 120 }),
      deuda({ id: 'barata', balance: 1000, annualRate: 5, minPayment: 60 }),
    ];
    const nieve = projectDebts(deudas, 100, 'snowball');
    const aval = projectDebts(deudas, 100, 'avalanche');
    expect(aval.order).toEqual(['cara', 'barata']);
    expect(nieve.order).toEqual(['barata', 'cara']);
    expect(aval.totalInterest).toBeLessThan(nieve.totalInterest);
  });

  it('un plan que no cierra (el mínimo no cubre el interés) se marca como estancado', () => {
    // 10 000 al 60 % anual (5 % mensual = 500 de interés) con mínimo 100.
    const plan = projectDebts([deuda({ balance: 10000, annualRate: 60, minPayment: 100 })], 0, 'snowball');
    expect(plan.ok).toBe(false);
    expect(plan.stalled).toBe(true);
  });

  it('los mínimos liberados se reutilizan (efecto bola de nieve)', () => {
    const deudas = [
      deuda({ id: 'a', balance: 100, annualRate: 0, minPayment: 100 }),
      deuda({ id: 'b', balance: 300, annualRate: 0, minPayment: 100 }),
    ];
    const plan = projectDebts(deudas, 0, 'snowball');
    // Mes 1: a se paga (100) y b baja 100 → 200. Mes 2: 200 de presupuesto (100 + 100 liberado) → b cierra.
    expect(plan.payoff.a).toBe(1);
    expect(plan.payoff.b).toBe(2);
    expect(plan.months).toBe(2);
  });
});

describe('helpers', () => {
  it('totalDebt y monthlyDebtPayment suman saldos y mínimos más el extra', () => {
    const deudas = [deuda({ balance: 100, minPayment: 10 }), deuda({ balance: 250.5, minPayment: 20 })];
    expect(totalDebt(deudas)).toBe(350.5);
    expect(monthlyDebtPayment(deudas, 15)).toBe(45);
  });

  it('payoffDate devuelve mes y año a N meses vista', () => {
    expect(payoffDate(2, new Date(2026, 10, 15))).toBe('Enero 2027');
    expect(payoffDate(0, new Date(2026, 8, 1))).toBe('Septiembre 2026');
  });
});
