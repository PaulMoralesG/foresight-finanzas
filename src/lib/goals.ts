// ================================================================
// METAS DE AHORRO — aritmética pura (portado de goalMath() de Balance Dual)
//
// `saved` es el total que la meta ya lleva acumulado (financeStore lo
// actualiza directo al registrar un aporte); esta función solo deriva de
// ahí el porcentaje, lo que falta, y — si hay fecha objetivo — en cuántos
// meses hay que llegar y cuánto guardar cada mes para lograrlo.
// ================================================================

import { roundMoney } from './utils';
import type { SavingsGoal } from '@/types';

export interface GoalMath {
  saved: number;
  target: number;
  /** 0–100, nunca más de 100 aunque se haya superado la meta. */
  pct: number;
  missing: number;
  /** Meses hasta el mes objetivo (puede ser ≤ 0 si ya llegó o pasó); null sin fecha. */
  months: number | null;
  /** Cuánto guardar cada mes para llegar a tiempo; null sin fecha objetivo. */
  monthly: number | null;
}

export function goalMath(goal: SavingsGoal, ahora = new Date()): GoalMath {
  const saved = roundMoney(goal.saved || 0);
  const target = roundMoney(goal.target || 0);
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const missing = roundMoney(Math.max(0, target - saved));

  let months: number | null = null;
  let monthly: number | null = null;
  if (goal.targetDate) {
    const [y, m] = goal.targetDate.split('-').map(Number);
    const end = new Date(y, m - 1, 1);
    const now = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    // Con el mes ya encima o pasado, hay que reunir lo que falta ya mismo.
    monthly = months > 0 ? roundMoney(missing / months) : roundMoney(missing);
  }

  return { saved, target, pct, missing, months, monthly };
}

/** La fecha objetivo ya pasó y todavía falta ahorrar. */
export function isGoalLate(m: GoalMath): boolean {
  return m.months !== null && m.months <= 0 && m.missing > 0;
}

export interface GoalTotals {
  target: number;
  saved: number;
  /** Suma de lo que hay que guardar cada mes en las metas con fecha objetivo. */
  monthly: number;
}

export function goalTotals(goals: SavingsGoal[], ahora = new Date()): GoalTotals {
  return goals.reduce(
    (acc, g) => {
      const m = goalMath(g, ahora);
      return {
        target: roundMoney(acc.target + m.target),
        saved: roundMoney(acc.saved + m.saved),
        monthly: roundMoney(acc.monthly + (m.monthly || 0)),
      };
    },
    { target: 0, saved: 0, monthly: 0 },
  );
}
