// ================================================================
// useStatsPeriod — Derivaciones del periodo de Estadísticas
//
// StatsPage tenía once useMemo, tres derivaciones sueltas y una IIFE dentro
// del cuerpo del componente, mezcladas con quinientas líneas de JSX y la
// configuración de Recharts. Todo esto es aritmética sobre transacciones: no
// depende de React más que para memorizar, y se puede probar sin montar nada.
// ================================================================

import { useMemo } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { MONTH_NAMES, roundMoney, safeParseDate } from '@/lib/utils';
import type { Transaction } from '@/types';

export interface PeriodoStats {
  /** 'month' usa mes+año; 'range' usa desde/hasta. */
  mode: 'month' | 'range';
  month: number;
  year: number;
  fromDate: string | null;
  toDate: string | null;
}

export interface PuntoTendencia {
  month: string;
  Ingresos: number;
  Gastos: number;
  Balance: number;
}

export interface TotalesPeriodo {
  income: number;
  spent: number;
  balance: number;
  businessProfit: number;
  count: number;
}

/** ¿La transacción cae dentro del periodo? */
function enPeriodo(tx: Transaction, periodo: PeriodoStats): boolean {
  const d = safeParseDate(tx.date);
  if (periodo.mode === 'range' && periodo.fromDate && periodo.toDate) {
    const from = safeParseDate(periodo.fromDate);
    const to = safeParseDate(periodo.toDate);
    to.setHours(23, 59, 59, 999);
    return d >= from && d <= to;
  }
  return d.getFullYear() === periodo.year && d.getMonth() === periodo.month;
}

/** Suma redondeada de un subconjunto. */
function sumar(items: Transaction[], filtro: (t: Transaction) => boolean): number {
  return roundMoney(items.filter(filtro).reduce((s, i) => s + i.amount, 0));
}

function totalesDe(items: Transaction[]): TotalesPeriodo {
  const income = sumar(items, (i) => i.type === 'income');
  const spent = sumar(items, (i) => i.type === 'expense');
  const businessInc = sumar(items, (i) => i.type === 'income' && i.businessType === 'business');
  const businessSpent = sumar(items, (i) => i.type === 'expense' && i.businessType === 'business');
  return {
    income,
    spent,
    balance: roundMoney(income - spent),
    businessProfit: roundMoney(businessInc - businessSpent),
    count: items.length,
  };
}

/** Variación porcentual legible. Sin periodo anterior no hay comparación posible. */
export function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '—';
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** Días que abarca el periodo, para el promedio diario. */
function diasDelPeriodo(periodo: PeriodoStats): number {
  if (periodo.mode === 'range' && periodo.fromDate && periodo.toDate) {
    const from = safeParseDate(periodo.fromDate);
    const to = safeParseDate(periodo.toDate);
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }
  // Día 0 del mes siguiente = último día de este mes
  return Math.max(1, new Date(periodo.year, periodo.month + 1, 0).getDate());
}

export function useStatsPeriod(periodo: PeriodoStats) {
  const expenses = useFinanceStore((s) => s.expenses);
  const { mode, month, year, fromDate, toDate } = periodo;

  // Tendencia de los seis meses que terminan en el mes seleccionado
  const trendData = useMemo<PuntoTendencia[]>(() => {
    const meses: PuntoTendencia[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const items = expenses.filter((item) => {
        const fecha = safeParseDate(item.date);
        return fecha.getMonth() === m && fecha.getFullYear() === y;
      });
      const ingresos = sumar(items, (i) => i.type === 'income');
      const gastos = sumar(items, (i) => i.type === 'expense');
      meses.push({
        month: MONTH_NAMES[m].slice(0, 3),
        Ingresos: ingresos,
        Gastos: gastos,
        Balance: roundMoney(ingresos - gastos),
      });
    }
    return meses;
  }, [expenses, month, year]);

  const filteredData = useMemo(
    () => expenses.filter((tx) => enPeriodo(tx, periodo)),
    // `periodo` es un objeto nuevo en cada render: se depende de sus campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, mode, month, year, fromDate, toDate],
  );

  /** El periodo inmediatamente anterior, del mismo tamaño, para comparar. */
  const previousData = useMemo(() => {
    if (mode === 'range' && fromDate && toDate) {
      const from = safeParseDate(fromDate);
      const to = safeParseDate(toDate);
      const diff = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - diff);
      const prevTo = new Date(to.getTime() - diff);
      return expenses.filter((i) => {
        const d = safeParseDate(i.date);
        return d >= prevFrom && d <= prevTo;
      });
    }
    const prev = new Date(year, month - 1, 1);
    return expenses.filter((i) => {
      const d = safeParseDate(i.date);
      return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
    });
  }, [expenses, mode, month, year, fromDate, toDate]);

  const totals = useMemo(() => totalesDe(filteredData), [filteredData]);

  const prevTotals = useMemo(() => {
    const anterior = totalesDe(previousData);
    return { income: anterior.income, spent: anterior.spent };
  }, [previousData]);

  /** Gasto por categoría, de mayor a menor. */
  const expensesByCategory = useMemo<[string, number][]>(() => {
    const map: Record<string, number> = {};
    filteredData
      .filter((i) => i.type === 'expense')
      .forEach((item) => {
        map[item.category] = roundMoney((map[item.category] || 0) + item.amount);
      });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [filteredData]);

  const largestExpense = useMemo<Transaction | null>(() => {
    const gastos = filteredData.filter((i) => i.type === 'expense');
    if (gastos.length === 0) return null;
    return gastos.reduce((max, item) => (item.amount > max.amount ? item : max), gastos[0]);
  }, [filteredData]);

  /** Día con más gasto acumulado del periodo. */
  const peakDay = useMemo<{ date: string; amount: number } | null>(() => {
    const gastos = filteredData.filter((i) => i.type === 'expense');
    if (gastos.length === 0) return null;
    const porDia: Record<string, number> = {};
    gastos.forEach((i) => {
      const dia = i.date.slice(0, 10);
      porDia[dia] = roundMoney((porDia[dia] || 0) + i.amount);
    });
    let diaMax = '';
    let montoMax = 0;
    Object.entries(porDia).forEach(([dia, monto]) => {
      if (monto > montoMax) {
        diaMax = dia;
        montoMax = monto;
      }
    });
    return { date: diaMax, amount: montoMax };
  }, [filteredData]);

  const peakDayTransactions = useMemo(() => {
    if (!peakDay) return [];
    return filteredData
      .filter((i) => i.type === 'expense' && i.date.slice(0, 10) === peakDay.date)
      .sort((a, b) => b.amount - a.amount);
  }, [filteredData, peakDay]);

  const avgDaily = useMemo(
    () => roundMoney(totals.balance / diasDelPeriodo(periodo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totals.balance, mode, month, year, fromDate, toDate],
  );

  return {
    trendData,
    filteredData,
    previousData,
    totals,
    prevTotals,
    expensesByCategory,
    maxAmount: expensesByCategory[0]?.[1] || 1,
    largestExpense,
    peakDay,
    peakDayTransactions,
    avgDaily,
  };
}
