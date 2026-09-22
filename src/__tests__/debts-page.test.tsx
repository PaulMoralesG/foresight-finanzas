// ================================================================
// TESTS — DebtsPage (Deudas) y el store: pago, ajustes y migración v10
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DebtsPage } from '@/pages/DebtsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';

beforeEach(() => {
  cleanup();
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [] });
});

describe('DebtsPage', () => {
  it('sin deudas muestra el vacío', () => {
    render(<DebtsPage />);
    expect(screen.getByText('Sin deudas registradas')).toBeInTheDocument();
  });

  it('crea una deuda desde el formulario', async () => {
    render(<DebtsPage />);
    // Hay dos botones "Agregar deuda" (cabecera y vacío): vale cualquiera
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar deuda' })[0]);
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Nombre'), 'Préstamo moto');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Tipo'), 'Préstamo');
    await userEvent.type(within(dialogo).getByLabelText('Saldo actual'), '3600');
    await userEvent.type(within(dialogo).getByLabelText('Interés anual (%)'), '19');
    await userEvent.type(within(dialogo).getByLabelText('Pago mínimo mensual'), '180');
    await userEvent.type(within(dialogo).getByLabelText('Día de pago del mes (opcional)'), '5');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    const d = useFinanceStore.getState().debts;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ name: 'Préstamo moto', kind: 'Préstamo', balance: 3600, annualRate: 19, minPayment: 180, payDay: 5, tag: 'personal' });
  });

  it('muestra KPIs, orden de pago y la fecha libre de deudas', () => {
    useFinanceStore.getState().addDebt({ name: 'Tarjeta', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1240, annualRate: 22, minPayment: 85, payDay: 15 });
    useFinanceStore.getState().addDebt({ name: 'Moto', tag: 'personal', kind: 'Préstamo', balance: 3600, annualRate: 19, minPayment: 180, payDay: null });
    render(<DebtsPage />);

    expect(screen.getByText('Deuda total').parentElement).toHaveTextContent('$4,840.00');
    expect(screen.getByText('Pago mensual').parentElement).toHaveTextContent('$265.00');
    expect(screen.getByText('Libre de deudas').parentElement).toHaveTextContent(/en \d+ meses/);
    // Bola de nieve: saldo menor primero
    const orden = screen.getByRole('heading', { name: 'Orden de pago' }).closest('.saas-card') as HTMLElement;
    const items = within(orden).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Tarjeta');
    expect(items[1]).toHaveTextContent('Moto');
    expect(screen.getByRole('img', { name: /Saldo de deuda proyectado/ })).toBeInTheDocument();
  });

  it('avisa cuando el plan no cierra', () => {
    useFinanceStore.getState().addDebt({ name: 'Imposible', tag: 'personal', kind: 'Otro', balance: 10000, annualRate: 60, minPayment: 100, payDay: null });
    render(<DebtsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('los intereses crecen más rápido que los abonos');
  });

  it('cambiar el método lo guarda en ajustes y reordena', async () => {
    useFinanceStore.getState().addDebt({ name: 'Cara', tag: 'personal', kind: 'Otro', balance: 3000, annualRate: 30, minPayment: 120, payDay: null });
    useFinanceStore.getState().addDebt({ name: 'Barata', tag: 'personal', kind: 'Otro', balance: 1000, annualRate: 5, minPayment: 60, payDay: null });
    render(<DebtsPage />);
    // El método se elige tocando su bloque en "Bola de nieve vs. avalancha"
    await userEvent.click(screen.getByRole('button', { name: /^Avalancha/ }));
    expect(useFinanceStore.getState().settings.debtMethod).toBe('avalanche');
    expect(useFinanceStore.getState().settings.updated_at).not.toBe('');
    const orden = screen.getByRole('heading', { name: 'Orden de pago' }).closest('.saas-card') as HTMLElement;
    expect(within(orden).getAllByRole('listitem')[0]).toHaveTextContent('Cara');
  });

  it('registrar un pago baja el saldo y deja el gasto con la cuenta elegida', async () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    useFinanceStore.getState().addDebt({ name: 'Tarjeta', tag: 'business', kind: 'Tarjeta de crédito', balance: 500, annualRate: 22, minPayment: 85, payDay: null });
    render(<DebtsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByLabelText('Monto')).toHaveValue('85'); // el mínimo, precargado
    await userEvent.selectOptions(within(dialogo).getByLabelText('Cuenta de origen'), banco);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    const s = useFinanceStore.getState();
    expect(s.debts[0].balance).toBe(415);
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0]).toMatchObject({ type: 'expense', amount: 85, category: 'pago-tarjetas', businessType: 'business', accountId: banco, concept: 'Pago Tarjeta' });
  });

  it('un pago sin registrarlo como gasto solo baja el saldo, y nunca por debajo de cero', () => {
    const id = useFinanceStore.getState().addDebt({ name: 'X', tag: 'personal', kind: 'Otro', balance: 50, annualRate: 0, minPayment: 10, payDay: null });
    useFinanceStore.getState().registerDebtPayment(id, { amount: 80, date: '2026-09-01', accountId: null, asExpense: false });
    expect(useFinanceStore.getState().debts[0].balance).toBe(0);
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
  });
});

describe('migración v10 del estado persistido (deudas y ajustes)', () => {
  it('añade debts vacío y settings por defecto', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBeGreaterThanOrEqual(10);
    const migrado = opciones.migrate!({ expenses: [], savingsGoals: [], accounts: [] }, 9) as {
      debts: unknown[]; settings: { debtMethod: string; extraPayment: number; netWorthGoal: number; updated_at: string };
    };
    expect(migrado.debts).toEqual([]);
    expect(migrado.settings).toEqual({ debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' });
  });
});
