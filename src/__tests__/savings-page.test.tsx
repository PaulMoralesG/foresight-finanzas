// ================================================================
// TESTS — SavingsPage (presupuesto mensual + metas de ahorro)
// La otra pantalla por la que entra dinero. Cubre el carry-forward del
// presupuesto, el borrado explícito y el progreso de las metas.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavingsPage } from '@/pages/SavingsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { currentMonthKey, shiftMonthKey } from '@/hooks/useBudget';
import type { Transaction } from '@/types';

const ESTE_MES = currentMonthKey();
const MES_PASADO = shiftMonthKey(ESTE_MES, -1);

/** Un gasto de ahorro con fecha dentro del mes en curso. */
function ahorro(concept: string, amount: number): Omit<Transaction, 'id' | 'created_at' | 'updated_at'> {
  const [y, m] = ESTE_MES.split('-');
  return {
    type: 'expense',
    amount,
    concept,
    date: `${y}-${m}-15`,
    category: 'ahorro',
    method: 'cash',
    businessType: 'personal',
  };
}

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
    render(<SavingsPage />);

    await user.type(screen.getByPlaceholderText('Ej: 15000'), '1500');
    await user.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));

    expect(useFinanceStore.getState().budgets[ESTE_MES]).toBe(1500);
    expect(screen.getByText(/de \$1,500\.00/)).toBeInTheDocument();
  });

  it('hereda el presupuesto del mes anterior cuando no hay uno propio', () => {
    useFinanceStore.setState({ budgets: { [MES_PASADO]: 800 } });
    render(<SavingsPage />);

    expect(screen.getByText(/de \$800\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Heredado de/)).toBeInTheDocument();
  });

  it('un presupuesto de 0 se comporta como borrado, no hereda', () => {
    // El bug: `if (!budgets[mes])` trataba el 0 igual que la ausencia, así que
    // borrar el presupuesto hacía reaparecer el del mes anterior.
    useFinanceStore.setState({ budgets: { [MES_PASADO]: 800, [ESTE_MES]: 0 } });
    render(<SavingsPage />);

    expect(screen.getByText(/No hay presupuesto para/)).toBeInTheDocument();
    expect(screen.queryByText(/Heredado de/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de \$800\.00/)).not.toBeInTheDocument();
  });

  it('el presupuesto propio gana sobre el heredable', () => {
    useFinanceStore.setState({ budgets: { [MES_PASADO]: 800, [ESTE_MES]: 200 } });
    render(<SavingsPage />);

    expect(screen.getByText(/de \$200\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Heredado de/)).not.toBeInTheDocument();
  });

  it('rechaza texto sin dígitos en vez de guardarlo como cero', async () => {
    const user = userEvent.setup();
    render(<SavingsPage />);

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
    render(<SavingsPage />);

    await user.type(screen.getByPlaceholderText('Ej: 15000'), '0');
    await user.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));

    expect(useFinanceStore.getState().budgets[ESTE_MES]).toBe(0);
  });

  it('el campo de presupuesto tiene nombre accesible', () => {
    render(<SavingsPage />);
    expect(screen.getByLabelText(/Presupuesto para/)).toBeInTheDocument();
  });
});

describe('Metas de ahorro', () => {
  it('crea una meta con concepto y objetivo', async () => {
    const user = userEvent.setup();
    render(<SavingsPage />);

    await user.click(screen.getByRole('button', { name: /Nueva meta/ }));
    await user.type(screen.getByLabelText('Concepto'), 'Casa');
    await user.type(screen.getByLabelText('Monto objetivo'), '5000');
    await user.click(screen.getByRole('button', { name: /Crear meta/ }));

    const [meta] = useFinanceStore.getState().savingsGoals;
    expect(meta).toMatchObject({ concept: 'Casa', target: 5000 });
  });

  it('exige concepto y objetivo mayor que cero', async () => {
    const user = userEvent.setup();
    render(<SavingsPage />);

    await user.click(screen.getByRole('button', { name: /Nueva meta/ }));
    await user.click(screen.getByRole('button', { name: /Crear meta/ }));

    expect(useFinanceStore.getState().savingsGoals).toHaveLength(0);
    expect(useUiStore.getState().toasts[0]).toMatchObject({ type: 'error' });
  });

  it('suma al progreso los gastos de ahorro con el mismo concepto', () => {
    const store = useFinanceStore.getState();
    store.addSavingsGoal({ concept: 'Casa', target: 1000 });
    store.addTransaction(ahorro('Casa', 250));
    store.addTransaction(ahorro('casa', 150)); // distinta capitalización
    store.addTransaction(ahorro('Auto', 900)); // otro concepto

    render(<SavingsPage />);

    // 250 + 150 = 400 de 1000 → 40%
    expect(screen.getByText(/Ahorrado \$400\.00 de \$1,000\.00/)).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('redondea el total ahorrado a centavos', () => {
    const store = useFinanceStore.getState();
    store.addTransaction(ahorro('Casa', 0.1));
    store.addTransaction(ahorro('Casa', 0.2));

    render(<SavingsPage />);

    // Sin redondeo la suma de floats da 0.30000000000000004
    expect(screen.getByText('$0.30')).toBeInTheDocument();
  });

  it('el diálogo de meta es modal, con título y campos etiquetados', async () => {
    const user = userEvent.setup();
    render(<SavingsPage />);

    await user.click(screen.getByRole('button', { name: /Nueva meta/ }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveAccessibleName('Nueva meta');
    expect(within(dialogo).getByLabelText('Concepto')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Monto objetivo')).toBeInTheDocument();
  });

  it('Escape cierra el diálogo de meta', async () => {
    const user = userEvent.setup();
    render(<SavingsPage />);

    await user.click(screen.getByRole('button', { name: /Nueva meta/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renombrar una meta arrastra sus aportes y conserva el progreso', async () => {
    const user = userEvent.setup();
    const store = useFinanceStore.getState();
    store.addSavingsGoal({ concept: 'Vacaciones', target: 1000 });
    store.addTransaction(ahorro('Vacaciones', 400));

    render(<SavingsPage />);
    expect(screen.getByText(/Ahorrado \$400\.00 de \$1,000\.00/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Editar meta/ }));
    const campo = screen.getByLabelText('Concepto');
    await user.clear(campo);
    await user.type(campo, 'Viaje a Japón');
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    // El progreso se empareja por texto del concepto: sin arrastrar los aportes
    // el contador volvía a cero y el dinero parecía haberse perdido.
    expect(screen.getByText(/Ahorrado \$400\.00 de \$1,000\.00/)).toBeInTheDocument();
    expect(useFinanceStore.getState().expenses[0].concept).toBe('Viaje a Japón');
  });

  it('cambiar solo el importe objetivo no toca los aportes', async () => {
    const user = userEvent.setup();
    const store = useFinanceStore.getState();
    store.addSavingsGoal({ concept: 'Casa', target: 1000 });
    store.addTransaction(ahorro('Casa', 250));

    render(<SavingsPage />);
    await user.click(screen.getByRole('button', { name: /Editar meta/ }));
    const objetivo = screen.getByLabelText('Monto objetivo');
    await user.clear(objetivo);
    await user.type(objetivo, '2000');
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    expect(useFinanceStore.getState().expenses[0].concept).toBe('Casa');
    expect(screen.getByText(/Ahorrado \$250\.00 de \$2,000\.00/)).toBeInTheDocument();
  });

  it('el botón Aportar de cada meta nombra la meta', () => {
    useFinanceStore.getState().addSavingsGoal({ concept: 'Vacaciones', target: 2000 });
    render(<SavingsPage />);

    expect(
      screen.getByRole('button', { name: 'Aportar a la meta Vacaciones' }),
    ).toBeInTheDocument();
  });
});
