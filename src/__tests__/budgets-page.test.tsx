// ================================================================
// TESTS — BudgetsPage (Presupuestos por categoría) y migración v12
// Sustituye al test del editor de presupuesto global de "Planes".
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { currentMonthKey } from '@/lib/month-keys';
import type { Transaction } from '@/types';

const ESTE_MES = currentMonthKey();
const [Y, M] = ESTE_MES.split('-');

let n = 0;
const mov = (o: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100,
  concept: '',
  date: `${Y}-${M}-10`,
  category: 'comida',
  method: 'card',
  businessType: 'personal',
  updated_at: '2026-08-10T00:00:00.000Z',
  ...o,
});

beforeEach(() => {
  cleanup();
  n = 0;
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [] });
});

describe('BudgetsPage — Este mes', () => {
  it('crea un presupuesto de gasto por categoría y lo muestra con su barra', async () => {
    useFinanceStore.setState({ expenses: [mov({ category: 'comida', amount: 450 })] });
    render(<BudgetsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo presupuesto' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Categoría'), 'comida');
    await userEvent.type(within(dialogo).getByLabelText('Límite mensual'), '500');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    const lines = useFinanceStore.getState().budgetLines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 500, plan: {} });
    expect(screen.getByText(/\$450\.00 de \$500\.00 este mes/)).toBeInTheDocument();
    expect(screen.getByText('Cerca del límite')).toBeInTheDocument(); // 90 %
  });

  it('rechaza un presupuesto duplicado para la misma categoría y ámbito', async () => {
    useFinanceStore.getState().addBudgetLine({ tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 100, plan: {} });
    render(<BudgetsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo presupuesto' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Categoría'), 'comida');
    await userEvent.type(within(dialogo).getByLabelText('Límite mensual'), '200');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));
    expect(useFinanceStore.getState().budgetLines).toHaveLength(1);
    expect(useUiStore.getState().toasts.some((t) => t.message.includes('Ya existe'))).toBe(true);
  });

  it('presupuestado vs. real agrupa por grupo y calcula el resultado del mes', () => {
    useFinanceStore.getState().addBudgetLine({ tag: 'personal', kind: 'income', categoryId: 'sueldo', limit: 2000, plan: {} });
    useFinanceStore.getState().addBudgetLine({ tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 500, plan: {} });
    useFinanceStore.setState({
      expenses: [mov({ type: 'income', category: 'sueldo', amount: 2100 }), mov({ category: 'restaurantes', amount: 300 })],
    });
    render(<BudgetsPage />);
    const tabla = screen.getByRole('heading', { name: 'Presupuestado vs. real' }).closest('.saas-card') as HTMLElement;
    expect(within(tabla).getByText('Empleo')).toBeInTheDocument();
    expect(within(tabla).getByText('Alimentación')).toBeInTheDocument();
    const resultado = within(tabla).getByText('Resultado del mes').closest('tr')!;
    expect(resultado).toHaveTextContent('$1,500.00'); // plan: 2000 − 500
    expect(resultado).toHaveTextContent('$1,800.00'); // real: 2100 − 300
    expect(within(tabla).getByText(/planificados sin destino/)).toBeInTheDocument();
  });
});

describe('BudgetsPage — Plan 12 meses y Reporte anual', () => {
  it('el plan guarda el monto de un mes al salir de la casilla', async () => {
    const id = useFinanceStore.getState().addBudgetLine({ tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 500, plan: {} });
    render(<BudgetsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Plan 12 meses' }));
    const year = new Date().getFullYear();
    const celda = screen.getByLabelText(`Comida Enero ${year}`);
    await userEvent.clear(celda);
    await userEvent.type(celda, '900');
    await userEvent.tab();
    expect(useFinanceStore.getState().budgetLines.find((l) => l.id === id)!.plan[`${year}-01`]).toBe(900);
    expect(screen.getByText(/base cero/)).toBeInTheDocument();
  });

  it('el reporte anual muestra lo movido por categoría y mes', async () => {
    const year = new Date().getFullYear();
    useFinanceStore.setState({
      expenses: [
        mov({ category: 'comida', amount: 120, date: `${year}-02-10` }),
        mov({ category: 'comida', amount: 80, date: `${year}-03-10` }),
        mov({ type: 'income', category: 'sueldo', amount: 1000, date: `${year}-02-01` }),
      ],
    });
    render(<BudgetsPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Reporte anual' }));
    const fila = screen.getByText(/Comida/).closest('tr')!;
    expect(fila).toHaveTextContent('120.00');
    expect(fila).toHaveTextContent('80.00');
    expect(fila).toHaveTextContent('200.00'); // total
    expect(fila).toHaveTextContent('100.00'); // promedio de 2 meses
    expect(screen.getByText('Total ingresos').closest('tr')).toHaveTextContent('1,000.00');
  });
});

describe('migración v12', () => {
  it('convierte el presupuesto global en líneas por categoría al migrar', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBeGreaterThanOrEqual(12);
    const migrado = opciones.migrate!(
      {
        expenses: [mov({ category: 'comida', amount: 300, date: '2026-08-05' }), mov({ category: 'ropa', amount: 100, date: '2026-08-06' })],
        budgets: { '2026-08': 800 },
        savingsGoals: [],
      },
      11,
    ) as { budgetLines: Array<{ categoryId: string; plan: Record<string, number> }>; budgets: Record<string, number> };
    expect(migrado.budgetLines.map((l) => [l.categoryId, l.plan['2026-08']]).sort()).toEqual([['comida', 600], ['ropa', 200]]);
    expect(migrado.budgets).toEqual({ '2026-08': 800 }); // el mapa antiguo no se pierde
  });
});
