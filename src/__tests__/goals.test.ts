// ================================================================
// TESTS — lib/goals.ts (portado de goalMath() de Balance Dual)
// ================================================================

import { describe, it, expect } from 'vitest';
import { goalMath, isGoalLate, goalTotals } from '@/lib/goals';
import type { SavingsGoal } from '@/types';

let n = 0;
const goal = (o: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: `g${++n}`,
  concept: 'Meta',
  tag: 'personal',
  target: 1000,
  targetDate: null,
  saved: 0,
  savedFromAccounts: 0,
  updated_at: '2026-09-01T00:00:00.000Z',
  ...o,
});

describe('goalMath', () => {
  it('sin fecha objetivo: pct y missing, sin meses ni aporte mensual', () => {
    const m = goalMath(goal({ target: 1000, saved: 300 }));
    expect(m).toMatchObject({ saved: 300, target: 1000, pct: 30, missing: 700, months: null, monthly: null });
  });

  it('el pct nunca pasa de 100 aunque el ahorro supere la meta', () => {
    const m = goalMath(goal({ target: 500, saved: 900 }));
    expect(m.pct).toBe(100);
    expect(m.missing).toBe(0);
  });

  it('con fecha futura, reparte lo que falta entre los meses restantes', () => {
    const ahora = new Date(2026, 8, 1); // septiembre 2026
    const m = goalMath(goal({ target: 1200, saved: 0, targetDate: '2027-03' }), ahora); // 6 meses
    expect(m.months).toBe(6);
    expect(m.monthly).toBe(200);
  });

  it('con la fecha ya encima o pasada, hay que reunir todo lo que falta ya', () => {
    const ahora = new Date(2026, 8, 15);
    const enElMes = goalMath(goal({ target: 500, saved: 100, targetDate: '2026-09' }), ahora);
    expect(enElMes.months).toBe(0);
    expect(enElMes.monthly).toBe(400);

    const pasada = goalMath(goal({ target: 500, saved: 100, targetDate: '2026-01' }), ahora);
    expect(pasada.months).toBeLessThan(0);
    expect(pasada.monthly).toBe(400);
  });

  it('target en cero no revienta: pct es 0', () => {
    expect(goalMath(goal({ target: 0, saved: 0 })).pct).toBe(0);
  });
});

describe('isGoalLate', () => {
  it('tarde solo si la fecha ya pasó (o llegó) y todavía falta ahorrar', () => {
    const ahora = new Date(2026, 8, 15);
    expect(isGoalLate(goalMath(goal({ targetDate: '2026-01', target: 500, saved: 100 }), ahora))).toBe(true);
    expect(isGoalLate(goalMath(goal({ targetDate: '2026-01', target: 500, saved: 500 }), ahora))).toBe(false); // ya completa
    expect(isGoalLate(goalMath(goal({ targetDate: '2027-01', target: 500, saved: 0 }), ahora))).toBe(false); // futura
    expect(isGoalLate(goalMath(goal({ targetDate: null })))).toBe(false); // sin fecha
  });
});

describe('goalTotals', () => {
  it('suma target, saved y el aporte mensual de las metas con fecha', () => {
    const ahora = new Date(2026, 8, 1);
    const totals = goalTotals(
      [
        goal({ target: 1000, saved: 200, targetDate: '2027-03' }), // 6 meses → 133.33/mes
        goal({ target: 500, saved: 500 }), // sin fecha: no aporta a "monthly"
      ],
      ahora,
    );
    expect(totals.target).toBe(1500);
    expect(totals.saved).toBe(700);
    expect(totals.monthly).toBe(133.33);
  });

  it('sin metas, todo en cero', () => {
    expect(goalTotals([])).toEqual({ target: 0, saved: 0, monthly: 0 });
  });
});
