// ================================================================
// useBudget — Lógica compartida del presupuesto mensual
//   Usado por el widget de solo-lectura del Dashboard y por el
//   editor completo de la sección Planes. Fuente única de verdad:
//   carry-forward, % gastado, color/estado del indicador.
// ================================================================

import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { roundMoney } from '@/lib/utils';

export interface BudgetStatus {
  /** Presupuesto vigente (propio del mes o heredado) */
  budget: number;
  /** Gasto real del mes */
  monthSpent: number;
  /** % gastado (0-100+) */
  pct: number;
  /** true si el presupuesto viene de un mes anterior */
  isCarriedOver: boolean;
  /** Mes de origen si es heredado (YYYY-MM), null si es propio */
  carriedFrom: string | null;
  /** Clase de color para la barra */
  colorBar: string;
  /** Emoji de estado */
  emoji: string;
  /** Mensaje de estado legible */
  message: string;
}

const MONTH_KEYS = {
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
};

/**
 * @param monthKey Mes en formato YYYY-MM (ej. '2026-08')
 */
export function useBudget(monthKey: string): BudgetStatus {
  const budgets = useFinanceStore((s) => s.budgets);
  const expenses = useFinanceStore((s) => s.expenses);

  return useMemo(() => {
    // Carry-forward: si no hay presupuesto para el mes, usar el más reciente del pasado
    let budget = budgets[monthKey] ?? 0;
    let carriedFrom: string | null = null;
    if (!budgets[monthKey]) {
      const keys = Object.keys(budgets).sort().reverse();
      for (const k of keys) {
        if (k < monthKey && budgets[k] > 0) {
          budget = budgets[k];
          carriedFrom = k;
          break;
        }
      }
    }
    const isCarriedOver = budget > 0 && !budgets[monthKey];

    // Gastos del mes
    const [y, m] = monthKey.split('-').map(Number);
    const monthSpent = roundMoney(
      expenses
        .filter((e) => {
          if (e.type !== 'expense') return false;
          const d = new Date(e.date);
          return d.getFullYear() === y && d.getMonth() === m - 1;
        })
        .reduce((s, e) => s + e.amount, 0)
    );

    const pct = budget > 0 ? Math.round((monthSpent / budget) * 100) : 0;

    const colorBar =
      pct > 100 ? 'bg-red-500' :
      pct === 100 ? 'bg-orange-600' :
      pct > 90 ? 'bg-orange-500' :
      pct > 75 ? 'bg-yellow-500' :
      pct > 50 ? 'bg-brand-500' :
      'bg-emerald-500';

    const emoji =
      pct > 100 ? '🔥' :
      pct === 100 ? '🎯' :
      pct > 90 ? '⚠️' :
      pct > 75 ? '👀' :
      pct > 50 ? '👍' :
      '🎉';

    const message =
      pct > 100 ? 'Te pasaste del presupuesto' :
      pct === 100 ? '¡Alcanzaste el límite!' :
      pct > 90 ? 'Casi llegas al límite' :
      pct > 75 ? 'Vas a buen ritmo' :
      pct > 50 ? 'Todo bajo control' :
      budget > 0 ? 'Excelente control' :
      'Define tu presupuesto';

    return { budget, monthSpent, pct, isCarriedOver, carriedFrom, colorBar, emoji, message };
  }, [budgets, expenses, monthKey]);
}

/** Etiqueta legible de un mes YYYY-MM (ej. 'ago 2026') */
export function monthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_KEYS.es[m - 1]} ${y}`;
}

/** Desplazar un mesKey por ±N meses */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** monthKey del mes actual */
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
