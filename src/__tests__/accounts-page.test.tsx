// ================================================================
// TESTS — AccountsPage (Cuentas) y el modo transferencia del modal
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountsPage } from '@/pages/AccountsPage';
import { TransactionModal } from '@/components/features/movements/TransactionModal';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Transaction } from '@/types';

const hoy = new Date();
const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

let n = 0;
const mov = (overrides: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100,
  concept: `Mov ${n}`,
  date: `${mesActual}-10`,
  category: 'comida',
  method: 'card',
  businessType: 'personal',
  updated_at: '2026-09-10T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  cleanup();
  n = 0;
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [], isModalOpen: false, editingId: null, modalPrefill: null });
});

describe('AccountsPage', () => {
  it('sin cuentas muestra el vacío con la llamada a crear', () => {
    render(<AccountsPage />);
    expect(screen.getByText('Todavía no tienes cuentas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear la primera cuenta' })).toBeInTheDocument();
  });

  it('crea una cuenta con nombre, tipo y saldo inicial (negativo permitido)', async () => {
    render(<AccountsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar cuenta' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Nombre'), 'Tarjeta Visa');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Tipo'), 'Tarjeta');
    const saldo = within(dialogo).getByLabelText('Saldo inicial');
    await userEvent.clear(saldo);
    await userEvent.type(saldo, '-250.5');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    const cuentas = useFinanceStore.getState().accounts;
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]).toMatchObject({ name: 'Tarjeta Visa', kind: 'Tarjeta', initialBalance: -250.5 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // En la tarjeta y en el total
    expect(screen.getAllByText('-$250.50')).toHaveLength(2);
  });

  it('muestra el saldo derivado de cada cuenta y el total', () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 820 });
    const efectivo = useFinanceStore.getState().addAccount({ name: 'Efectivo', kind: 'Efectivo', initialBalance: 150 });
    useFinanceStore.setState({
      expenses: [
        mov({ type: 'income', amount: 1000, accountId: banco }),
        mov({ type: 'transfer', amount: 300, accountId: banco, toAccountId: efectivo }),
      ],
    });
    render(<AccountsPage />);

    const tarjetaBanco = screen.getByText('Banco', { selector: 'p.truncate' }).parentElement!;
    expect(within(tarjetaBanco).getByText('$1,520.00')).toBeInTheDocument();
    const tarjetaEfectivo = screen.getByText('Efectivo', { selector: 'p.truncate' }).parentElement!;
    expect(within(tarjetaEfectivo).getByText('$450.00')).toBeInTheDocument();
    expect(screen.getByText('Saldo total').parentElement).toHaveTextContent('$1,970.00');
  });

  it('no deja borrar una cuenta con movimientos; sí una vacía', async () => {
    const usada = useFinanceStore.getState().addAccount({ name: 'Usada', kind: 'Banco', initialBalance: 0 });
    useFinanceStore.getState().addAccount({ name: 'Vacía', kind: 'Efectivo', initialBalance: 0 });
    useFinanceStore.setState({ expenses: [mov({ accountId: usada })] });
    render(<AccountsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Usada' }));
    expect(useUiStore.getState().toasts.some((t) => t.message.includes('movimientos asociados'))).toBe(true);
    expect(useFinanceStore.getState().accounts).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Vacía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(useFinanceStore.getState().accounts.map((a) => a.name)).toEqual(['Usada']);
    expect(Object.keys(useFinanceStore.getState().tombstones)).toHaveLength(1);
  });

  it('el resumen por cuenta separa entradas, salidas y transferencias del mes', () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 0 });
    const efectivo = useFinanceStore.getState().addAccount({ name: 'Efectivo', kind: 'Efectivo', initialBalance: 0 });
    useFinanceStore.setState({
      expenses: [
        mov({ type: 'income', amount: 500, category: 'salario', accountId: banco }),
        mov({ type: 'expense', amount: 120, category: 'comida', accountId: banco }),
        mov({ type: 'transfer', amount: 80, accountId: banco, toAccountId: efectivo }),
        mov({ type: 'expense', amount: 999, category: 'comida', accountId: efectivo }), // otra cuenta
      ],
    });
    render(<AccountsPage />);

    const resumen = screen.getByRole('heading', { name: 'Resumen por cuenta' }).closest('.saas-card') as HTMLElement;
    expect(within(resumen).getByText('Entradas')).toBeInTheDocument();
    expect(within(resumen).getByText('$500.00')).toBeInTheDocument();
    expect(within(resumen).getByText('$120.00')).toBeInTheDocument();
    expect(within(resumen).getByText('Transferencias')).toBeInTheDocument();
    expect(within(resumen).getByText('$80.00')).toBeInTheDocument();
    expect(within(resumen).queryByText('$999.00')).not.toBeInTheDocument();
    // Saldo al pie: 500 − 120 − 80
    expect(within(resumen).getByText('$300.00')).toBeInTheDocument();
  });
});

describe('TransactionModal — cuentas y transferencias', () => {
  const onSave = () => Promise.resolve(true);

  it('sin cuentas, el modal no ofrece Transferencia ni selector de cuenta', () => {
    useUiStore.setState({ isModalOpen: true });
    render(<TransactionModal onSave={onSave} />);
    const tipo = screen.getByRole('group', { name: 'Tipo de movimiento' });
    expect(within(tipo).queryByRole('button', { name: /Transf\./ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cuenta')).not.toBeInTheDocument();
  });

  it('con una cuenta, un gasto puede llevar cuenta (opcional)', async () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 0 });
    useUiStore.setState({ isModalOpen: true });
    render(<TransactionModal onSave={onSave} />);

    await userEvent.type(screen.getByLabelText('Monto'), '45');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta'), banco);
    await userEvent.click(screen.getByRole('button', { name: /Comida/ }));
    await userEvent.click(screen.getByRole('button', { name: /Registrar|Guardar|Agregar/ }));

    const tx = useFinanceStore.getState().expenses;
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ type: 'expense', amount: 45, accountId: banco, toAccountId: null });
  });

  it('una transferencia exige dos cuentas distintas y no lleva categoría', async () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 500 });
    const efectivo = useFinanceStore.getState().addAccount({ name: 'Efectivo', kind: 'Efectivo', initialBalance: 0 });
    useUiStore.setState({ isModalOpen: true });
    render(<TransactionModal onSave={onSave} />);

    const tipo = screen.getByRole('group', { name: 'Tipo de movimiento' });
    await userEvent.click(within(tipo).getByRole('button', { name: /Transf\./ }));
    expect(screen.queryByText(/^Categoría/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Monto'), '300');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta de origen'), banco);
    await userEvent.selectOptions(screen.getByLabelText('Cuenta destino'), efectivo);
    await userEvent.click(screen.getByRole('button', { name: /Registrar|Guardar|Agregar/ }));

    const tx = useFinanceStore.getState().expenses;
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ type: 'transfer', amount: 300, accountId: banco, toAccountId: efectivo, category: 'transferencia' });
  });
});
