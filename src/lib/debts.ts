// ================================================================
// DEUDAS — motor de proyección (portado de projectDebts() de Balance Dual)
//
// Proyecta mes a mes: acumula interés, paga mínimos, vuelca el excedente
// (aporte extra + mínimos liberados) en la deuda objetivo según el método:
//   snowball  — saldo menor primero (victorias rápidas)
//   avalanche — interés más alto primero (menos intereses)
// ================================================================

import { roundMoney, MONTH_NAMES } from './utils';
import type { Debt, DebtKind, DebtMethod } from '@/types';

export const DEBT_KINDS: DebtKind[] = ['Tarjeta de crédito', 'Préstamo', 'Hipoteca', 'Otro'];

export interface DebtPlan {
  /** Meses hasta saldar todo (0 si no hay deudas). */
  months: number;
  totalInterest: number;
  /** Saldo total al cierre de cada mes, empezando por el mes 0. */
  schedule: { month: number; total: number }[];
  /** id → mes en que se salda. */
  payoff: Record<string, number>;
  /** ids en el orden de ataque del método. */
  order: string[];
  /** El plan cierra: todas las deudas llegan a cero. */
  ok: boolean;
  /** Los pagos no alcanzan: el saldo no baja de un mes al siguiente. */
  stalled: boolean;
  /** No había deudas con saldo. */
  empty: boolean;
}

interface Trabajo {
  id: string;
  balance: number;
  rate: number;
  min: number;
}

const CASI_CERO = 0.005;
const MAX_MESES = 600;

export function projectDebts(debts: Debt[], extra: number, method: DebtMethod): DebtPlan {
  const work: Trabajo[] = debts
    .filter((d) => (d.balance || 0) > 0)
    .map((d) => ({ id: d.id, balance: d.balance, rate: (d.annualRate || 0) / 100 / 12, min: d.minPayment || 0 }));

  if (work.length === 0) {
    return { months: 0, totalInterest: 0, schedule: [], payoff: {}, order: [], ok: true, stalled: false, empty: true };
  }

  const order = [...work].sort((a, b) =>
    method === 'avalanche'
      ? b.rate - a.rate || a.balance - b.balance
      : a.balance - b.balance || b.rate - a.rate,
  );

  let totalInterest = 0;
  const schedule: DebtPlan['schedule'] = [];
  const payoff: Record<string, number> = {};
  let month = 0;
  let stalled = false;

  schedule.push({ month: 0, total: roundMoney(work.reduce((s, d) => s + d.balance, 0)) });

  while (work.some((d) => d.balance > CASI_CERO) && month < MAX_MESES) {
    month++;
    // Interés del mes sobre lo que queda
    for (const d of work) {
      if (d.balance > CASI_CERO) {
        const i = d.balance * d.rate;
        d.balance += i;
        totalInterest += i;
      }
    }
    const actives = order.filter((d) => d.balance > CASI_CERO);
    const freed = work.filter((d) => d.balance <= CASI_CERO).reduce((s, d) => s + d.min, 0);
    let budget = actives.reduce((s, d) => s + d.min, 0) + freed + (extra || 0);

    // Mínimos de todas menos la objetivo (la primera del orden)
    for (const d of actives.slice(1)) {
      const pay = Math.min(d.min, d.balance);
      d.balance -= pay;
      budget -= pay;
    }
    // Lo que queda del presupuesto, en orden de ataque
    for (let i = 0; i < actives.length && budget > CASI_CERO; i++) {
      const d = actives[i];
      if (d.balance > CASI_CERO) {
        const p = Math.min(budget, d.balance);
        d.balance -= p;
        budget -= p;
      }
    }
    for (const d of work) {
      if (d.balance <= CASI_CERO && !payoff[d.id]) {
        payoff[d.id] = month;
        d.balance = 0;
      }
    }
    const total = roundMoney(work.reduce((s, d) => s + Math.max(0, d.balance), 0));
    schedule.push({ month, total });
    if (total >= schedule[schedule.length - 2].total - CASI_CERO) {
      stalled = true;
      break;
    }
  }

  const cleared = !work.some((d) => d.balance > CASI_CERO);
  return {
    months: month,
    totalInterest: roundMoney(totalInterest),
    schedule,
    payoff,
    order: order.map((d) => d.id),
    ok: cleared && !stalled,
    stalled: stalled || !cleared,
    empty: false,
  };
}

export function totalDebt(debts: Debt[]): number {
  return roundMoney(debts.reduce((s, d) => s + (d.balance || 0), 0));
}

export function monthlyDebtPayment(debts: Debt[], extra: number): number {
  return roundMoney(debts.reduce((s, d) => s + (d.minPayment || 0), 0) + (extra || 0));
}

/** "Enero 2027": el mes en que se salda todo, a N meses de hoy. */
export function payoffDate(months: number, desde = new Date()): string {
  const dt = new Date(desde.getFullYear(), desde.getMonth() + months, 1);
  return `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
}
