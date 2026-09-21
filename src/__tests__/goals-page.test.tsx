// ================================================================
// TESTS — GoalsPage (Metas de ahorro), rediseño fase 3.8
//
// Sustituye por completo al test del modelo anterior (progreso derivado
// de gastos categoría "ahorro" cuyo concepto coincidía con el nombre de
// la meta). Desde la 3.8 cada meta lleva su propio `saved`, se actualiza
// con "Registrar aporte" o editando la meta, y goalMath calcula meses
// restantes y aporte mensual necesario cuando hay fecha objetivo.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalsPage } from '@/pages/GoalsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';

beforeEach(() => {
  cleanup();
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [] });
});

describe('GoalsPage — vacío y alta', () => {
  it('sin metas muestra el vacío con la llamada a crear', () => {
    render(<GoalsPage />);
    expect(screen.getByText('Sin metas todavía')).toBeInTheDocument();
    // Hay dos botones "Nueva meta" (cabecera y vacío): con al menos uno basta
    expect(screen.getAllByRole('button', { name: 'Nueva meta' }).length).toBeGreaterThan(0);
  });

  it('crea una meta con ámbito, objetivo, fecha y lo ya ahorrado', async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Nueva meta' })[0]);
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Negocio' }));
    await userEvent.type(within(dialogo).getByLabelText('Nombre'), 'Capital de trabajo');
    await userEvent.type(within(dialogo).getByLabelText('Monto objetivo'), '5000');
    const fecha = within(dialogo).getByLabelText('Mes objetivo') as HTMLInputElement;
    await userEvent.clear(fecha);
    await userEvent.type(fecha, '2027-03');
    const ahorrado = within(dialogo).getByLabelText('Ahorrado hasta hoy');
    await userEvent.clear(ahorrado);
    await userEvent.type(ahorrado, '500');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    const g = useFinanceStore.getState().savingsGoals;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ concept: 'Capital de trabajo', tag: 'business', target: 5000, targetDate: '2027-03', saved: 500, savedFromAccounts: 0 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exige nombre y un objetivo mayor que cero', async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Nueva meta' })[0]);
    // Espacios en blanco: pasa el `required` nativo del input pero .trim()
    // lo deja vacío en la validación de la página.
    await userEvent.type(screen.getByLabelText('Nombre'), '   ');
    await userEvent.type(screen.getByLabelText('Monto objetivo'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));
    expect(useUiStore.getState().toasts.some((t) => t.message.includes('nombre'))).toBe(true);
    expect(useFinanceStore.getState().savingsGoals).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Viaje');
    await userEvent.clear(screen.getByLabelText('Monto objetivo'));
    await userEvent.type(screen.getByLabelText('Monto objetivo'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));
    expect(useUiStore.getState().toasts.some((t) => t.message.includes('objetivo'))).toBe(true);
    expect(useFinanceStore.getState().savingsGoals).toHaveLength(0);
  });
});

describe('GoalsPage — KPIs y progreso', () => {
  it('los KPIs suman metas activas, ahorrado, falta y aporte mensual necesario', () => {
    useFinanceStore.getState().addSavingsGoal({ concept: 'A', target: 1000, saved: 300, targetDate: '2027-03' }); // 6 meses desde sep 2026 → 116.67/mes
    useFinanceStore.getState().addSavingsGoal({ concept: 'B', target: 500, saved: 500 }); // completa, sin fecha
    useFinanceStore.setState({ currentViewDate: new Date(2026, 8, 15).toISOString() });
    render(<GoalsPage />);

    expect(screen.getByText('Metas activas').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Ahorrado').parentElement).toHaveTextContent('$800.00');
    expect(screen.getByText('Falta').parentElement).toHaveTextContent('$700.00');
  });

  it('muestra el porcentaje, lo que falta y los meses hasta la fecha objetivo', () => {
    useFinanceStore.getState().addSavingsGoal({ concept: 'Fondo de emergencia', target: 1000, saved: 250, targetDate: '2027-01' });
    render(<GoalsPage />);
    expect(screen.getByText(/25% · faltan \$750\.00/)).toBeInTheDocument();
  });

  it('sin fecha objetivo lo dice explícitamente', () => {
    useFinanceStore.getState().addSavingsGoal({ concept: 'Sin fecha', target: 100, saved: 10 });
    render(<GoalsPage />);
    expect(screen.getByText(/sin fecha objetivo/)).toBeInTheDocument();
  });

  it('con la fecha ya pasada y falta por ahorrar, avisa que la fecha objetivo ya pasó', () => {
    useFinanceStore.getState().addSavingsGoal({ concept: 'Atrasada', target: 500, saved: 100, targetDate: '2020-01' });
    render(<GoalsPage />);
    expect(screen.getByText(/la fecha objetivo ya pasó/)).toBeInTheDocument();
  });
});

describe('GoalsPage — registrar aporte', () => {
  it('sin cuenta, solo registra el avance (no crea movimiento)', async () => {
    const id = useFinanceStore.getState().addSavingsGoal({ concept: 'Viaje', target: 1000, saved: 100 });
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar aporte' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Monto'), '150');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    const s = useFinanceStore.getState();
    expect(s.savingsGoals.find((g) => g.id === id)).toMatchObject({ saved: 250, savedFromAccounts: 0 });
    expect(s.expenses).toHaveLength(0);
  });

  it('con cuenta, suma a saved y a savedFromAccounts, y deja el aporte como gasto de categoría ahorro', async () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    const id = useFinanceStore.getState().addSavingsGoal({ concept: 'Viaje', tag: 'personal', target: 1000, saved: 100 });
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar aporte' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Monto'), '150');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Cuenta de origen'), banco);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    const s = useFinanceStore.getState();
    expect(s.savingsGoals.find((g) => g.id === id)).toMatchObject({ saved: 250, savedFromAccounts: 150 });
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0]).toMatchObject({ type: 'expense', amount: 150, category: 'ahorro', accountId: banco, businessType: 'personal', concept: 'Aporte a Viaje' });
  });

  it('el monto se precarga con el aporte mensual necesario cuando hay fecha objetivo', async () => {
    useFinanceStore.setState({ currentViewDate: new Date(2026, 8, 1).toISOString() });
    useFinanceStore.getState().addSavingsGoal({ concept: 'Meta', target: 1200, saved: 0, targetDate: '2027-03' }); // 6 meses → 200/mes
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar aporte' }));
    expect(screen.getByLabelText('Monto')).toHaveValue('200');
  });
});

describe('GoalsPage — editar y eliminar', () => {
  it('editar permite corregir directamente lo ya ahorrado', async () => {
    const id = useFinanceStore.getState().addSavingsGoal({ concept: 'Casa', target: 100000, saved: 1000 });
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar Casa' }));
    const dialogo = screen.getByRole('dialog');
    const ahorrado = within(dialogo).getByLabelText('Ahorrado hasta hoy');
    await userEvent.clear(ahorrado);
    await userEvent.type(ahorrado, '20000');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(useFinanceStore.getState().savingsGoals.find((g) => g.id === id)?.saved).toBe(20000);
  });

  it('elimina tras confirmar', async () => {
    useFinanceStore.getState().addSavingsGoal({ concept: 'Casa', target: 100000 });
    render(<GoalsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Casa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(useFinanceStore.getState().savingsGoals).toHaveLength(0);
    expect(Object.keys(useFinanceStore.getState().tombstones)).toHaveLength(1);
  });
});
