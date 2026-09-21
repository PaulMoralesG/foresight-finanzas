// ================================================================
// TESTS — BudgetsPage (presupuesto mensual)
// Cubre el carry-forward del presupuesto y el borrado explícito. Vivía
// en savings-page.test.tsx cuando el editor estaba en "Planes".
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { currentMonthKey, shiftMonthKey } from '@/hooks/useBudget';

const ESTE_MES = currentMonthKey();
const MES_PASADO = shiftMonthKey(ESTE_MES, -1);

beforeEach(() => {
  cleanup();
  useFinanceStore.setState({
    expenses: [],
    budgets: {},
    budgetUpdatedAt: {},
    savingsGoals: [],
    customExpenseCategories: [],
    customIncomeCategories: [],
    tombstones: {},
    currentViewDate: new Date().toISOString(),
  });
  useUiStore.setState({ toasts: [], isModalOpen: false, editingId: null, modalPrefill: null });
});


describe('Presupuesto mensual', () => {
  it('guarda el presupuesto del mes en curso', async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);

    await user.type(screen.getByPlaceholderText('Ej: 15000'), '1500');
    await user.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));

    expect(useFinanceStore.getState().budgets[ESTE_MES]).toBe(1500);
    expect(screen.getByText(/de \$1,500\.00/)).toBeInTheDocument();
  });

  it('hereda el presupuesto del mes anterior cuando no hay uno propio', () => {
    useFinanceStore.setState({ budgets: { [MES_PASADO]: 800 } });
    render(<BudgetsPage />);

    expect(screen.getByText(/de \$800\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Heredado de/)).toBeInTheDocument();
  });

  it('un presupuesto de 0 se comporta como borrado, no hereda', () => {
    // El bug: `if (!budgets[mes])` trataba el 0 igual que la ausencia, así que
    // borrar el presupuesto hacía reaparecer el del mes anterior.
    useFinanceStore.setState({ budgets: { [MES_PASADO]: 800, [ESTE_MES]: 0 } });
    render(<BudgetsPage />);

    expect(screen.getByText(/No hay presupuesto para/)).toBeInTheDocument();
    expect(screen.queryByText(/Heredado de/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de \$800\.00/)).not.toBeInTheDocument();
  });

  it('el presupuesto propio gana sobre el heredable', () => {
    useFinanceStore.setState({ budgets: { [MES_PASADO]: 800, [ESTE_MES]: 200 } });
    render(<BudgetsPage />);

    expect(screen.getByText(/de \$200\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Heredado de/)).not.toBeInTheDocument();
  });

  it('rechaza texto sin dígitos en vez de guardarlo como cero', async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);

    await user.type(screen.getByPlaceholderText('Ej: 15000'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));

    expect(useFinanceStore.getState().budgets[ESTE_MES]).toBeUndefined();
    expect(useUiStore.getState().toasts[0]).toMatchObject({
      type: 'error',
      message: 'Ingresa un monto válido',
    });
  });

  it('acepta un 0 explícito como "quitar presupuesto"', async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);

    await user.type(screen.getByPlaceholderText('Ej: 15000'), '0');
    await user.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));

    expect(useFinanceStore.getState().budgets[ESTE_MES]).toBe(0);
  });

  it('el campo de presupuesto tiene nombre accesible', () => {
    render(<BudgetsPage />);
    expect(screen.getByLabelText(/Presupuesto para/)).toBeInTheDocument();
  });
});
