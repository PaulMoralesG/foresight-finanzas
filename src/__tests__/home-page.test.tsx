// ================================================================
// TESTS — HomePage (Resumen)
// Hereda las aserciones de periodo de la antigua StatsPage: los totales
// del mes visible, la comparación con el mes anterior y el desglose por
// categoría, ahora en el Resumen. Los filtros de rango se retiraron con
// la reorganización de la fase 3.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { HomePage } from '@/pages/HomePage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Transaction } from '@/types';

let n = 0;
function tx(overrides: Partial<Transaction> = {}): Transaction {
  n += 1;
  return {
    id: `t${n}`,
    type: 'expense',
    amount: 100,
    concept: `Mov ${n}`,
    date: '2026-08-15',
    category: 'comida',
    method: 'cash',
    businessType: 'personal',
    created_at: '2026-08-15T10:00:00.000Z',
    updated_at: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

/** Fija el mes visible en agosto de 2026. */
function verAgosto2026(expenses: Transaction[]) {
  useFinanceStore.setState({
    expenses,
    currentViewDate: new Date(2026, 7, 1).toISOString(),
  });
}

/** Importe de una tarjeta KPI, por el título del botón o el rótulo. */
function kpi(selector: { title: string } | { rotulo: RegExp }): string {
  const tarjeta =
    'title' in selector
      ? screen.getByTitle(selector.title)
      : screen.getByText(selector.rotulo).parentElement!;
  return within(tarjeta).getAllByText(/^-?\$[\d,]+\.\d{2}$/)[0].textContent!;
}

beforeEach(() => {
  cleanup();
  n = 0;
  useFinanceStore.setState({
    expenses: [],
    budgets: {},
    budgetUpdatedAt: {},
    savingsGoals: [],
    customExpenseCategories: [],
    customIncomeCategories: [],
    tombstones: {},
  });
  useUiStore.setState({ toasts: [] });
});

describe('Resumen — totales del mes visible', () => {
  it('suma solo los movimientos del mes seleccionado', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 1000, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 400, date: '2026-08-20' }),
      tx({ type: 'expense', amount: 999, date: '2026-07-31' }), // mes anterior
      tx({ type: 'expense', amount: 888, date: '2026-09-01' }), // mes siguiente
    ]);
    render(<HomePage />);

    expect(kpi({ title: 'Ver ingresos' })).toBe('$1,000.00');
    expect(kpi({ title: 'Ver gastos' })).toBe('$400.00');
    expect(kpi({ rotulo: /^Saldo de/ })).toBe('$600.00');
  });

  it('cuenta el gasto del día 1 y del último día en su propio mes', () => {
    // El mismo desfase UTC que afectaba al presupuesto: en zona negativa,
    // 'YYYY-MM-01' parseado como UTC cae en el mes anterior.
    verAgosto2026([
      tx({ type: 'expense', amount: 250, date: '2026-08-01' }),
      tx({ type: 'expense', amount: 250, date: '2026-08-31' }),
    ]);
    render(<HomePage />);

    expect(kpi({ title: 'Ver gastos' })).toBe('$500.00');
  });

  it('redondea los totales a centavos', () => {
    verAgosto2026([
      tx({ type: 'expense', amount: 0.1, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 0.2, date: '2026-08-06' }),
      tx({ type: 'expense', amount: 0.7, date: '2026-08-07' }),
    ]);
    render(<HomePage />);

    // Sin redondeo, el reduce de floats da 1.0000000000000002
    expect(kpi({ title: 'Ver gastos' })).toBe('$1.00');
  });

  it('calcula el resultado de negocio aparte del personal', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 2000, businessType: 'business', date: '2026-08-02' }),
      tx({ type: 'expense', amount: 500, businessType: 'business', date: '2026-08-03' }),
      tx({ type: 'expense', amount: 300, businessType: 'personal', date: '2026-08-04' }),
    ]);
    render(<HomePage />);

    expect(kpi({ title: 'Ver movimientos de negocio' })).toBe('$1,500.00');
  });

  it('muestra saldo negativo cuando se gasta más de lo que entra', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 100, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 450, date: '2026-08-06' }),
    ]);
    render(<HomePage />);

    expect(kpi({ rotulo: /^Saldo de/ })).toBe('-$350.00');
  });
});

describe('Resumen — comparación con el mes anterior', () => {
  it('compara ingresos y gastos contra el mes previo', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 1500, date: '2026-08-10' }),
      tx({ type: 'income', amount: 1000, date: '2026-07-10' }),
      tx({ type: 'expense', amount: 200, date: '2026-08-11' }),
      tx({ type: 'expense', amount: 400, date: '2026-07-11' }),
    ]);
    render(<HomePage />);

    expect(screen.getByText(/\+50\.0% vs mes anterior/)).toBeInTheDocument(); // 1000 → 1500
    expect(screen.getByText(/-50\.0% vs mes anterior/)).toBeInTheDocument(); // 400 → 200
  });

  it('no muestra comparación cuando el mes anterior está vacío', () => {
    verAgosto2026([tx({ type: 'income', amount: 1500, date: '2026-08-10' })]);
    render(<HomePage />);

    expect(screen.queryByText(/vs mes anterior/)).not.toBeInTheDocument();
  });
});

describe('Resumen — desglose por categoría', () => {
  it('agrupa los gastos por categoría y omite los ingresos', () => {
    verAgosto2026([
      tx({ type: 'expense', amount: 300, category: 'comida', date: '2026-08-05' }),
      tx({ type: 'expense', amount: 200, category: 'comida', date: '2026-08-06' }),
      tx({ type: 'expense', amount: 150, category: 'transporte', date: '2026-08-07' }),
      tx({ type: 'income', amount: 900, category: 'ventas', date: '2026-08-08' }),
    ]);
    render(<HomePage />);

    const bloque = screen.getByText('Categorías principales').closest('.saas-card') as HTMLElement;
    expect(within(bloque).getByText('$500.00')).toBeInTheDocument();
    expect(within(bloque).getByText('$150.00')).toBeInTheDocument();
    expect(within(bloque).queryByText('$900.00')).not.toBeInTheDocument();
  });

  it('avisa cuando no hay gastos en el mes', () => {
    verAgosto2026([tx({ type: 'income', amount: 500, date: '2026-08-05' })]);
    render(<HomePage />);

    expect(screen.getByText('Sin datos de gastos este mes')).toBeInTheDocument();
  });
});

describe('Resumen — lo heredado de Estadísticas', () => {
  it('muestra la evolución de seis meses y los destacados del mes', () => {
    verAgosto2026([
      tx({ type: 'expense', amount: 80, concept: 'Cine', date: '2026-08-05' }),
      tx({ type: 'expense', amount: 1200, concept: 'Renta', category: 'vivienda', date: '2026-08-03' }),
      tx({ type: 'expense', amount: 50, concept: 'Café', date: '2026-08-03' }),
    ]);
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'Evolución' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Evolución de los últimos 6 meses/ })).toBeInTheDocument();

    const mayor = screen.getByRole('heading', { name: 'Mayor gasto' }).parentElement!;
    expect(within(mayor).getByText('Renta')).toBeInTheDocument();
    expect(within(mayor).getByText('$1,200.00')).toBeInTheDocument();

    const pico = screen.getByRole('heading', { name: 'Día de mayor gasto' }).parentElement!;
    expect(within(pico).getByText('$1,250.00')).toBeInTheDocument(); // 1200 + 50 el día 3
    expect(within(pico).getByText('2 mov.')).toBeInTheDocument();
  });

  it('los encabezados de las tarjetas son h2, sin saltos de nivel', () => {
    verAgosto2026([]);
    render(<HomePage />);

    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });
});
