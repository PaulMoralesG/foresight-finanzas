// ================================================================
// TESTS DE INTERFAZ — flujo de tarjeta de crédito, de punta a punta por la UI
// (TransactionModal y DebtsPage con el financeStore real, datos en memoria).
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionModal } from '@/components/features/movements/TransactionModal';
import { DebtsPage } from '@/pages/DebtsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { TRANSFER_CATEGORY, accountBalance } from '@/lib/accounts';
import { totalesDe } from '@/lib/totales';

const noopSave = () => Promise.resolve(true);
const estado = () => useFinanceStore.getState();

const clicCategoria = (nombre: RegExp) =>
  userEvent.click(within(screen.getByRole('group', { name: 'Categoría del movimiento' })).getByRole('button', { name: nombre }));

beforeEach(() => {
  cleanup();
  estado().reset();
  useUiStore.setState({ isModalOpen: false, editingId: null, modalPrefill: null, toasts: [] });
});

describe('UI — gasto personal con tarjeta (Movimientos)', () => {
  it('4,99 · Tarjeta · Streaming · 21 de octubre · sin cuenta: se guarda como gasto y no toca ninguna deuda', async () => {
    const user = userEvent.setup();
    const visa = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: null });
    useUiStore.getState().openModal();
    render(<TransactionModal onSave={noopSave} />);

    // Sin cuentas creadas no hay selector de cuenta: el movimiento queda «sin cuenta».
    expect(screen.queryByLabelText('Cuenta')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Monto'), '4,99');
    await user.type(screen.getByLabelText('Concepto'), 'Netflix');
    await user.clear(screen.getByLabelText('Fecha'));
    await user.type(screen.getByLabelText('Fecha'), '2026-10-21');
    await user.click(within(screen.getByRole('group', { name: 'Método de pago' })).getByRole('button', { name: /Tarjeta/ }));
    await user.click(within(screen.getByRole('group', { name: 'Ámbito del movimiento' })).getByRole('button', { name: /Personal/ }));
    await clicCategoria(/Streaming/);
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    expect(estado().expenses).toHaveLength(1);
    const [tx] = estado().expenses;
    expect(tx).toMatchObject({
      type: 'expense', amount: 4.99, concept: 'Netflix', date: '2026-10-21',
      category: 'streaming', method: 'card', businessType: 'personal', accountId: null, toAccountId: null,
    });
    expect(tx.debtId).toBeUndefined();
    // Es consumo: cuenta como gasto del mes y NO mueve el saldo de la tarjeta.
    expect(totalesDe(estado().expenses).gastos).toBe(4.99);
    expect(estado().debts.find((d) => d.id === visa)!.balance).toBe(1000);
    expect(useUiStore.getState().isModalOpen).toBe(false);
  });
});

describe('UI — pago de tarjeta desde Movimientos', () => {
  it('«Pago de Tarjetas» + deuda + cuenta de origen: baja el saldo, sale de la cuenta y no cuenta como gasto', async () => {
    const user = userEvent.setup();
    const banco = estado().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    const visa = estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 500, annualRate: 30, minPayment: 50, payDay: null });
    // Un consumo previo con la tarjeta, para comprobar que el pago no se suma a él.
    estado().addTransaction({
      type: 'expense', amount: 4.99, concept: 'Netflix', date: '2026-10-21', category: 'streaming',
      method: 'card', businessType: 'personal', accountId: null, toAccountId: null,
    });

    useUiStore.getState().openModal();
    render(<TransactionModal onSave={noopSave} />);

    await user.type(screen.getByLabelText('Monto'), '200');
    await user.clear(screen.getByLabelText('Fecha'));
    await user.type(screen.getByLabelText('Fecha'), '2026-10-25');
    await clicCategoria(/Pago de Tarjetas/);
    expect(screen.getByLabelText('¿Qué deuda pagas?')).toHaveValue(visa); // única tarjeta: preseleccionada
    await user.selectOptions(screen.getByLabelText('Cuenta'), banco);
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    const s = estado();
    const pago = s.expenses.find((e) => e.debtId === visa)!;
    expect(pago).toMatchObject({ type: 'transfer', category: TRANSFER_CATEGORY, amount: 200, accountId: banco, toAccountId: null, date: '2026-10-25' });
    expect(s.debts[0].balance).toBe(300);
    expect(accountBalance(s.accounts[0], s.expenses)).toBe(800);
    // El mes sigue teniendo solo el gasto de 4,99: el pago no es gasto.
    expect(totalesDe(s.expenses).gastos).toBe(4.99);
  });
});

describe('UI — pago de tarjeta desde Deudas', () => {
  it('«Registrar pago» baja el saldo, resta de la cuenta y no suma a los gastos', async () => {
    const user = userEvent.setup();
    const banco = estado().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    estado().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 500, annualRate: 30, minPayment: 85, payDay: null });
    render(<DebtsPage />);

    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));
    const dialogo = screen.getByRole('dialog');
    const monto = within(dialogo).getByLabelText('Monto');
    await user.clear(monto);
    await user.type(monto, '150');
    expect(within(dialogo).getByLabelText('Cuenta de origen')).toHaveValue(banco);
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    const s = estado();
    expect(s.debts[0].balance).toBe(350);
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0]).toMatchObject({ type: 'transfer', amount: 150, accountId: banco, debtId: s.debts[0].id });
    expect(accountBalance(s.accounts[0], s.expenses)).toBe(850);
    expect(totalesDe(s.expenses).gastos).toBe(0);
  });
});
