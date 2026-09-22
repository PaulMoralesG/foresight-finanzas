// ================================================================
// PRESUPUESTO POR CATEGORÍA — aritmética pura (fase 3.4)
//
// Portado de Balance Dual: planFor(), budgetRow(), groupSummaryCard(),
// viewReporteAnual(). Más la conversión del presupuesto global antiguo de
// Foresight (un número por mes) al reparto por categoría, que se ejecuta
// una vez en la migración v12 del estado persistido.
// ================================================================

import { roundMoney, safeParseDate, toCsv } from './utils';
import { categoryGroup } from '@/config/categories';
import { newId, nowIso } from './ids';
import type { BudgetLine, BusinessType, Category, MonthlyBudget, Transaction } from '@/types';

const monthKeyOf = (iso: string): string => {
  const d = safeParseDate(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Monto planificado de una línea para un mes: el del plan si existe, si no el límite base. */
export function planFor(line: BudgetLine, monthKey: string): number {
  const p = line.plan?.[monthKey];
  return p != null ? p : line.limit || 0;
}

export type BudgetStatusKind = 'good' | 'warn' | 'crit';

/** Como budgetRow(): en rango < 70 %, cerca del límite ≤ 100 %, excedido después. */
export function budgetStatus(spent: number, limit: number): { pct: number; status: BudgetStatusKind; label: string } {
  const pct = limit > 0 ? Math.min(999, (spent / limit) * 100) : 0;
  const status: BudgetStatusKind = pct < 70 ? 'good' : pct <= 100 ? 'warn' : 'crit';
  const label = status === 'good' ? 'En rango' : status === 'warn' ? 'Cerca del límite' : 'Excedido';
  return { pct, status, label };
}

/** Gasto (o ingreso) real de una categoría y ámbito en un mes. */
export function actualFor(expenses: Transaction[], line: Pick<BudgetLine, 'tag' | 'kind' | 'categoryId'>, monthKey: string): number {
  return roundMoney(
    expenses
      .filter((t) => t.type === line.kind && t.businessType === line.tag && t.category === line.categoryId && monthKeyOf(t.date) === monthKey)
      .reduce((s, t) => s + t.amount, 0),
  );
}

export interface GroupRow {
  kind: 'income' | 'expense';
  group: string;
  planned: number;
  actual: number;
  /** En ingresos, recibir de más es bueno; en gastos, gastar de menos es bueno. */
  diff: number;
}

export interface GroupSummary {
  rows: GroupRow[];
  planResult: number;
  realResult: number;
  plannedIncome: number;
}

/** Presupuestado vs. real por grupo, la vista central de la plantilla. */
export function groupSummary(lines: BudgetLine[], expenses: Transaction[], monthKey: string, customCats: Category[]): GroupSummary {
  const acc = new Map<string, GroupRow>();
  const key = (kind: 'income' | 'expense', group: string) => `${kind}|${group}`;
  const bucket = (kind: 'income' | 'expense', group: string): GroupRow => {
    const k = key(kind, group);
    let r = acc.get(k);
    if (!r) {
      r = { kind, group, planned: 0, actual: 0, diff: 0 };
      acc.set(k, r);
    }
    return r;
  };

  for (const l of lines) {
    bucket(l.kind, categoryGroup(l.categoryId, customCats)).planned += planFor(l, monthKey);
  }
  for (const t of expenses) {
    if (t.type !== 'income' && t.type !== 'expense') continue;
    if (monthKeyOf(t.date) !== monthKey) continue;
    bucket(t.type, categoryGroup(t.category, customCats)).actual += t.amount;
  }

  const sums = { income: { planned: 0, actual: 0 }, expense: { planned: 0, actual: 0 } };
  const rows = [...acc.values()]
    .map((r) => {
      r.planned = roundMoney(r.planned);
      r.actual = roundMoney(r.actual);
      r.diff = roundMoney(r.kind === 'income' ? r.actual - r.planned : r.planned - r.actual);
      sums[r.kind].planned += r.planned;
      sums[r.kind].actual += r.actual;
      return r;
    })
    .sort((a, b) => (a.kind === b.kind ? a.group.localeCompare(b.group) : a.kind === 'income' ? -1 : 1));

  return {
    rows,
    planResult: roundMoney(sums.income.planned - sums.expense.planned),
    realResult: roundMoney(sums.income.actual - sums.expense.actual),
    plannedIncome: roundMoney(sums.income.planned),
  };
}

const RESUMEN_CSV_HEADERS = ['Tipo', 'Grupo', 'Presupuestado', 'Real', 'Diferencia'] as const;

/** `groupSummary()` a CSV: una fila por grupo, mismo orden que en pantalla. */
export function groupSummaryToCsv(resumen: GroupSummary): Blob {
  const rows = resumen.rows.map((r) => [
    r.kind === 'income' ? 'Ingreso' : 'Gasto',
    r.group,
    r.planned.toFixed(2),
    r.actual.toFixed(2),
    r.diff.toFixed(2),
  ]);
  return toCsv([...RESUMEN_CSV_HEADERS], rows);
}

export interface AnnualRow {
  tag: BusinessType;
  kind: 'income' | 'expense';
  categoryId: string;
  byMonth: Record<string, number>;
  total: number;
  /** Promedio de los meses con movimiento en esa categoría. */
  average: number;
}

/** Matriz categoría × 12 meses de lo realmente movido en un año. */
export function annualReport(expenses: Transaction[], year: number, _customCats: Category[]): AnnualRow[] {
  const acc = new Map<string, AnnualRow>();
  for (const t of expenses) {
    if (t.type !== 'income' && t.type !== 'expense') continue;
    const mk = monthKeyOf(t.date);
    if (!mk.startsWith(`${year}-`)) continue;
    const k = `${t.businessType}|${t.type}|${t.category}`;
    let r = acc.get(k);
    if (!r) {
      r = { tag: t.businessType, kind: t.type, categoryId: t.category, byMonth: {}, total: 0, average: 0 };
      acc.set(k, r);
    }
    r.byMonth[mk] = (r.byMonth[mk] ?? 0) + t.amount;
  }
  return [...acc.values()].map((r) => {
    for (const mk of Object.keys(r.byMonth)) r.byMonth[mk] = roundMoney(r.byMonth[mk]);
    r.total = roundMoney(Object.values(r.byMonth).reduce((s, v) => s + v, 0));
    const meses = Object.values(r.byMonth).filter((v) => v > 0).length || 1;
    r.average = roundMoney(r.total / meses);
    return r;
  });
}

/** Los doce meses de un año, 'YYYY-MM'. */
export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Convierte el presupuesto global antiguo (un número por mes) en líneas por
 * categoría, sin perder datos: el presupuesto de cada mes se reparte entre
 * las categorías de gasto de ese mes en proporción al gasto real; si no
 * hubo gasto, todo va a "General". El límite base de cada línea es el
 * reparto del mes más reciente. El ámbito de la línea sigue al de los
 * movimientos de esa categoría (negocio solo si todos lo son).
 */
export function convertGlobalBudgets(budgets: MonthlyBudget, expenses: Transaction[]): BudgetLine[] {
  const meses = Object.keys(budgets).filter((mk) => (budgets[mk] ?? 0) > 0).sort();
  if (meses.length === 0) return [];

  // categoría → plan por mes, y ámbito observado
  const planes = new Map<string, Record<string, number>>();
  const negocio = new Map<string, boolean>();

  for (const mk of meses) {
    const total = budgets[mk];
    const delMes = expenses.filter((t) => t.type === 'expense' && monthKeyOf(t.date) === mk);
    const porCat = new Map<string, number>();
    for (const t of delMes) {
      porCat.set(t.category, (porCat.get(t.category) ?? 0) + t.amount);
      const esNegocio = t.businessType === 'business';
      negocio.set(t.category, (negocio.get(t.category) ?? true) && esNegocio);
    }
    if (porCat.size === 0) {
      const plan = planes.get('general') ?? {};
      plan[mk] = roundMoney(total);
      planes.set('general', plan);
      if (!negocio.has('general')) negocio.set('general', false);
      continue;
    }
    const gasto = [...porCat.values()].reduce((s, v) => s + v, 0);
    // Reparto proporcional; el resto del redondeo va a la categoría mayor
    // para que la suma sea exactamente el presupuesto.
    const entradas = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
    let asignado = 0;
    entradas.forEach(([cat, v], i) => {
      const parte = i === entradas.length - 1 ? roundMoney(total - asignado) : roundMoney((v / gasto) * total);
      asignado = roundMoney(asignado + parte);
      const plan = planes.get(cat) ?? {};
      plan[mk] = parte;
      planes.set(cat, plan);
    });
  }

  const ultimo = meses[meses.length - 1];
  return [...planes.entries()].map(([categoryId, plan]) => {
    const mesesCat = Object.keys(plan).sort();
    const base = plan[ultimo] ?? plan[mesesCat[mesesCat.length - 1]];
    return {
      id: newId(),
      tag: negocio.get(categoryId) ? 'business' : 'personal',
      kind: 'expense',
      categoryId,
      limit: base,
      plan,
      updated_at: nowIso(),
    };
  });
}
