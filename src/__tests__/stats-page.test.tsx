// ================================================================
// TESTS — StatsPage
// La página concentra nueve derivaciones de periodo y las dos
// exportaciones. Se prueba la lógica de periodo a través del render,
// que es lo que hará falta antes de partirla en subcomponentes.
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { StatsPage } from '@/pages/StatsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Transaction } from '@/types';

// Recharts mide su contenedor con ResizeObserver, que jsdom no trae, y sin
// ancho no dibuja nada. La gráfica no es lo que se prueba aquí.
vi.mock('recharts', async () => {
  const stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: stub,
    LineChart: stub,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

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

/** Fija el periodo en agosto de 2026, en modo mes. */
function verAgosto2026(expenses: Transaction[]) {
  useFinanceStore.setState({
    expenses,
    currentViewDate: new Date(2026, 7, 1).toISOString(),
  });
  useUiStore.setState({
    statsMode: 'month',
    statsMonth: 7,
    statsYear: 2026,
    statsFromDate: null,
    statsToDate: null,
  });
}

/** Valor de una de las cuatro tarjetas de resumen, por su rótulo. */
function kpi(rotulo: string): string {
  const etiqueta = screen.getByText(rotulo);
  const tarjeta = etiqueta.parentElement!;
  return within(tarjeta).getAllByText(/^\$|^-\$/)[0].textContent!;
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

describe('StatsPage — totales del periodo', () => {
  it('suma solo los movimientos del mes seleccionado', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 1000, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 400, date: '2026-08-20' }),
      tx({ type: 'expense', amount: 999, date: '2026-07-31' }), // mes anterior
      tx({ type: 'expense', amount: 888, date: '2026-09-01' }), // mes siguiente
    ]);
    render(<StatsPage />);

    expect(kpi('Ingresos')).toBe('$1,000.00');
    expect(kpi('Gastos')).toBe('$400.00');
    expect(kpi('Saldo')).toBe('$600.00');
  });

  it('cuenta el gasto del día 1 en su propio mes', () => {
    // El mismo desfase UTC que afectaba al presupuesto: en zona negativa,
    // 'YYYY-MM-01' parseado como UTC cae en el mes anterior.
    verAgosto2026([tx({ type: 'expense', amount: 250, date: '2026-08-01' })]);
    render(<StatsPage />);

    expect(kpi('Gastos')).toBe('$250.00');
  });

  it('cuenta el gasto del último día en su propio mes', () => {
    verAgosto2026([tx({ type: 'expense', amount: 250, date: '2026-08-31' })]);
    render(<StatsPage />);

    expect(kpi('Gastos')).toBe('$250.00');
  });

  it('redondea los totales a centavos', () => {
    verAgosto2026([
      tx({ type: 'expense', amount: 0.1, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 0.2, date: '2026-08-06' }),
      tx({ type: 'expense', amount: 0.7, date: '2026-08-07' }),
    ]);
    render(<StatsPage />);

    // Sin redondeo, el reduce de floats da 1.0000000000000002
    expect(kpi('Gastos')).toBe('$1.00');
  });

  it('calcula el resultado de negocio aparte del personal', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 2000, businessType: 'business', date: '2026-08-02' }),
      tx({ type: 'expense', amount: 500, businessType: 'business', date: '2026-08-03' }),
      tx({ type: 'expense', amount: 300, businessType: 'personal', date: '2026-08-04' }),
    ]);
    render(<StatsPage />);

    expect(kpi('Resultado negocio')).toBe('$1,500.00');
    expect(screen.getByText('3 movimientos')).toBeInTheDocument();
  });

  it('muestra saldo negativo cuando se gasta más de lo que entra', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 100, date: '2026-08-05' }),
      tx({ type: 'expense', amount: 450, date: '2026-08-06' }),
    ]);
    render(<StatsPage />);

    expect(kpi('Saldo')).toBe('-$350.00');
  });
});

describe('StatsPage — comparación con el periodo anterior', () => {
  it('compara contra el mes previo', () => {
    verAgosto2026([
      tx({ type: 'income', amount: 1500, date: '2026-08-10' }),
      tx({ type: 'income', amount: 1000, date: '2026-07-10' }),
    ]);
    render(<StatsPage />);

    // 1000 → 1500 es +50%
    expect(screen.getByText(/\+50\.0% vs período anterior/)).toBeInTheDocument();
  });

  it('no muestra comparación cuando el periodo anterior está vacío', () => {
    verAgosto2026([tx({ type: 'income', amount: 1500, date: '2026-08-10' })]);
    render(<StatsPage />);

    expect(screen.queryByText(/vs período anterior/)).not.toBeInTheDocument();
  });
});

describe('StatsPage — desglose por categoría', () => {
  it('agrupa los gastos por categoría y omite los ingresos', () => {
    verAgosto2026([
      tx({ type: 'expense', amount: 300, category: 'comida', date: '2026-08-05' }),
      tx({ type: 'expense', amount: 200, category: 'comida', date: '2026-08-06' }),
      tx({ type: 'expense', amount: 150, category: 'transporte', date: '2026-08-07' }),
      tx({ type: 'income', amount: 900, category: 'ventas', date: '2026-08-08' }),
    ]);
    render(<StatsPage />);

    const bloque = screen.getByText('Gastos por categoría').parentElement!;
    expect(within(bloque).getByText('$500.00')).toBeInTheDocument();
    expect(within(bloque).getByText('$150.00')).toBeInTheDocument();
    expect(within(bloque).queryByText('$900.00')).not.toBeInTheDocument();
  });

  it('avisa cuando no hay gastos en el período', () => {
    verAgosto2026([tx({ type: 'income', amount: 500, date: '2026-08-05' })]);
    render(<StatsPage />);

    const bloque = screen.getByText('Gastos por categoría').parentElement!;
    expect(within(bloque).getByText('Sin gastos en este período')).toBeInTheDocument();
  });
});

describe('StatsPage — accesibilidad de los filtros', () => {
  it('los selectores de periodo tienen nombre accesible', () => {
    verAgosto2026([]);
    render(<StatsPage />);

    // No tenían label ni aria-label: se anunciaban como "lista desplegable".
    expect(screen.getByLabelText('Mes a analizar')).toBeInTheDocument();
    expect(screen.getByLabelText('Año a analizar')).toBeInTheDocument();
  });

  it('los encabezados de las tarjetas son h2, sin saltos de nivel', () => {
    // La página no tenía ningún h1 ni h2 y arrancaba en h3: la navegación por
    // encabezados de un lector de pantalla se saltaba la jerarquía entera.
    // El h1 lo pone la cabecera de la app, fuera de esta página.
    verAgosto2026([]);
    render(<StatsPage />);

    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  it('los campos de rango tienen nombre accesible', () => {
    verAgosto2026([]);
    useUiStore.setState({ statsMode: 'range', statsFromDate: '2026-08-01', statsToDate: '2026-08-31' });
    render(<StatsPage />);

    expect(screen.getByLabelText('Fecha de inicio del rango')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de fin del rango')).toBeInTheDocument();
  });
});
