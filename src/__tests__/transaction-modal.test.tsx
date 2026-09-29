// ================================================================
// TESTS — TransactionModal
// Primera prueba de render del proyecto. Cubre la pantalla por la que
// entra todo el dinero: redondeo al guardar, validación y el contrato
// de accesibilidad del formulario.
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionModal } from '@/components/features/movements/TransactionModal';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { TRANSFER_CATEGORY, accountBalance } from '@/lib/accounts';

const noopSave = () => Promise.resolve(true);

function abrirModal(editingId?: string) {
  useUiStore.getState().openModal(editingId);
}

function montar() {
  return render(<TransactionModal onSave={noopSave} />);
}

beforeEach(() => {
  cleanup();
  useFinanceStore.setState({
    expenses: [],
    debts: [],
    accounts: [],
    budgets: {},
    budgetUpdatedAt: {},
    savingsGoals: [],
    customExpenseCategories: [],
    customIncomeCategories: [],
    tombstones: {},
    currentViewDate: new Date().toISOString(),
  });
  useUiStore.setState({ isModalOpen: false, editingId: null, modalPrefill: null, toasts: [] });
});

describe('TransactionModal — guardado', () => {
  it('guarda el importe con dos decimales exactos', async () => {
    const user = userEvent.setup();
    abrirModal();
    montar();

    await user.type(screen.getByLabelText('Monto'), '10.05');
    await user.type(screen.getByLabelText('Concepto'), 'Café');
    await user.click(screen.getByRole('button', { name: /Comida/ }));
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    const [tx] = useFinanceStore.getState().expenses;
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(10.05);
    expect(tx.concept).toBe('Café');
  });

  it('trata tres dígitos tras el punto como separador de miles', async () => {
    const user = userEvent.setup();
    abrirModal();
    montar();

    // Ambigüedad real del locale español: "1.000" es mil, no uno coma cero.
    // parseMoneyInput resuelve a favor de los miles, que es el caso común al
    // escribir importes; el efecto colateral es que "10.005" son diez mil
    // cinco, no diez con medio centavo. Se fija aquí para que el día que
    // alguien cambie la heurística sepa qué está rompiendo.
    await user.type(screen.getByLabelText('Monto'), '1.000');
    await user.click(screen.getByRole('button', { name: /Comida/ }));
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    expect(useFinanceStore.getState().expenses[0].amount).toBe(1000);
  });

  it('guarda tipo, ámbito, método y fecha tal como se eligieron', async () => {
    const user = userEvent.setup();
    abrirModal();
    montar();

    const grupo = (nombre: string) => within(screen.getByRole('group', { name: nombre }));

    await grupo('Tipo de movimiento').getByRole('button', { name: /Ingreso/ }).click();
    await user.type(screen.getByLabelText('Monto'), '1200');
    await user.type(screen.getByLabelText('Concepto'), 'Venta');
    await user.clear(screen.getByLabelText('Fecha'));
    await user.type(screen.getByLabelText('Fecha'), '2026-08-01');
    await user.click(grupo('Ámbito del movimiento').getByRole('button', { name: /Negocio/ }));
    await user.click(grupo('Método de pago').getByRole('button', { name: /Transf\./ }));
    await user.click(
      within(screen.getByRole('group', { name: 'Categoría del movimiento' }))
        .getAllByRole('button')[0],
    );
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    const [tx] = useFinanceStore.getState().expenses;
    expect(tx).toMatchObject({
      type: 'income',
      amount: 1200,
      date: '2026-08-01',
      businessType: 'business',
      method: 'transfer',
    });
  });

  it('edita el movimiento existente en vez de crear otro', async () => {
    const user = userEvent.setup();
    const id = useFinanceStore.getState().addTransaction({
      type: 'expense',
      amount: 100,
      concept: 'Original',
      date: '2026-08-10',
      category: 'comida',
      method: 'cash',
      businessType: 'personal',
    });

    abrirModal(id);
    montar();

    const monto = screen.getByLabelText('Monto');
    await user.clear(monto);
    await user.type(monto, '175.50');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const { expenses } = useFinanceStore.getState();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].id).toBe(id);
    expect(expenses[0].amount).toBe(175.5);
  });
});

describe('TransactionModal — validación', () => {
  it('rechaza un importe de cero y no guarda nada', async () => {
    const user = userEvent.setup();
    abrirModal();
    montar();

    await user.type(screen.getByLabelText('Monto'), '0');
    await user.click(screen.getByRole('button', { name: /Comida/ }));
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useUiStore.getState().toasts[0]).toMatchObject({
      type: 'error',
      message: 'Ingresa un monto mayor a 0',
    });
  });

  it('exige categoría antes de guardar', async () => {
    const user = userEvent.setup();
    abrirModal();
    montar();

    await user.type(screen.getByLabelText('Monto'), '50');
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useUiStore.getState().toasts[0]).toMatchObject({
      type: 'error',
      message: 'Selecciona una categoría',
    });
  });
});

describe('TransactionModal — accesibilidad', () => {
  it('los tres campos de texto tienen nombre accesible', () => {
    abrirModal();
    montar();

    // Antes los <label> no llevaban htmlFor: el lector de pantalla anunciaba
    // "cuadro de texto" a secas en los tres.
    expect(screen.getByLabelText('Monto')).toBeInTheDocument();
    expect(screen.getByLabelText('Concepto')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument();
  });

  it('los grupos de botones se anuncian como grupos con nombre', () => {
    abrirModal();
    montar();

    // Encabezaban un <label> sin `for`, que no nombra nada.
    expect(screen.getByRole('group', { name: 'Tipo de movimiento' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ámbito del movimiento' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Método de pago' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Categoría del movimiento' })).toBeInTheDocument();
  });

  it('es un diálogo modal con título asociado', () => {
    abrirModal();
    montar();

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveAccessibleName('Nuevo movimiento');
  });

  it('el botón de borrar tiene nombre accesible al editar', async () => {
    const id = useFinanceStore.getState().addTransaction({
      type: 'expense',
      amount: 10,
      concept: 'X',
      date: '2026-08-10',
      category: 'comida',
      method: 'cash',
      businessType: 'personal',
    });
    abrirModal(id);
    montar();

    // Solo tenía `title`, que no siempre expone un lector de pantalla.
    expect(screen.getByRole('button', { name: 'Eliminar movimiento' })).toBeInTheDocument();
  });

  it('Escape cierra el modal', async () => {
    const user = userEvent.setup();
    abrirModal();
    montar();

    expect(useUiStore.getState().isModalOpen).toBe(true);
    await user.keyboard('{Escape}');
    expect(useUiStore.getState().isModalOpen).toBe(false);
  });
});

describe('TransactionModal — sincronización', () => {
  it('agenda el guardado en la nube tras registrar', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve(true));
    abrirModal();
    render(<TransactionModal onSave={onSave} />);

    await user.type(screen.getByLabelText('Monto'), '25');
    await user.click(screen.getByRole('button', { name: /Comida/ }));
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    expect(onSave).toHaveBeenCalled();
  });
});

describe('TransactionModal — sin «Repetir»', () => {
  it('no ofrece repetir el movimiento ni crea reglas al guardar', async () => {
    const user = userEvent.setup();
    useFinanceStore.setState({ recurrences: [] });
    abrirModal();
    montar();
    expect(screen.queryByRole('group', { name: /Repetir/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Monto/i), '120');
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    expect(useFinanceStore.getState().recurrences).toHaveLength(0);
  });
});


const nuevaDeuda = (o: Partial<Parameters<ReturnType<typeof useFinanceStore.getState>['addDebt']>[0]> = {}) =>
  useFinanceStore.getState().addDebt({ name: 'Visa Pichincha', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: null, ...o });

const clicCategoria = (nombre: RegExp) =>
  userEvent.click(within(screen.getByRole('group', { name: 'Categoría del movimiento' })).getByRole('button', { name: nombre }));

describe('TransactionModal — pago de una deuda (un pago no es gasto)', () => {
  it('con «Pago de Tarjetas» y una sola tarjeta la deja preseleccionada y al guardar es transferencia + debtId', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda();
    abrirModal();
    montar();

    expect(screen.queryByLabelText('¿Qué deuda pagas?')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Monto/i), '250');
    await clicCategoria(/Pago de Tarjetas/);

    expect(screen.getByLabelText('¿Qué deuda pagas?')).toHaveValue(debtId);
    expect(screen.getByText(/No cuenta como gasto/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    const [tx] = useFinanceStore.getState().expenses;
    expect(tx).toMatchObject({ type: 'transfer', category: TRANSFER_CATEGORY, debtId, amount: 250, toAccountId: null });
    expect(useFinanceStore.getState().debts[0].balance).toBe(750);
  });

  it('con varias deudas de otro tipo elige la que encaja con la categoría', async () => {
    const user = userEvent.setup();
    nuevaDeuda({ name: 'Visa' });
    const prestamo = nuevaDeuda({ name: 'Auto', kind: 'Préstamo' });
    abrirModal();
    montar();

    await user.type(screen.getByLabelText(/Monto/i), '100');
    await clicCategoria(/Préstamos/);
    expect(screen.getByLabelText('¿Qué deuda pagas?')).toHaveValue(prestamo);
  });

  it('con dos tarjetas no preselecciona ninguna: hay ambigüedad real y debe elegir el usuario', async () => {
    // Bug real: con «Tarjeta Pacífico» y «Tarjeta Pichincha», preseleccionar
    // la primera del array vinculaba en silencio el pago a la tarjeta
    // equivocada cuando el usuario no tocaba el selector a mano.
    const user = userEvent.setup();
    nuevaDeuda({ name: 'Tarjeta Pacífico' });
    nuevaDeuda({ name: 'Tarjeta Pichincha' });
    abrirModal();
    montar();

    await user.type(screen.getByLabelText(/Monto/i), '250');
    await clicCategoria(/Pago de Tarjetas/);

    expect(screen.getByLabelText('¿Qué deuda pagas?')).toHaveValue('');
    expect(screen.getByText(/Contará como gasto y no bajará ninguna deuda/)).toBeInTheDocument();
  });

  it('con ambigüedad y sin elegir deuda, guarda un gasto normal en vez de un pago sin deuda', async () => {
    // La preselección vacía no debe colarse como transferencia con debtId=''.
    const user = userEvent.setup();
    nuevaDeuda({ name: 'Tarjeta Pacífico' });
    nuevaDeuda({ name: 'Tarjeta Pichincha' });
    abrirModal();
    montar();

    await user.type(screen.getByLabelText(/Monto/i), '250');
    await clicCategoria(/Pago de Tarjetas/);
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    const [tx] = useFinanceStore.getState().expenses;
    expect(tx).toMatchObject({ type: 'expense', category: 'pago-tarjetas' });
    expect(tx.debtId).toBeUndefined();
    expect(useFinanceStore.getState().debts.every((d) => d.balance === 1000)).toBe(true);
  });

  it('con «Ninguna» guarda un gasto normal sin debtId, avisa y no baja ninguna deuda', async () => {
    const user = userEvent.setup();
    nuevaDeuda();
    abrirModal();
    montar();

    await user.type(screen.getByLabelText(/Monto/i), '250');
    await clicCategoria(/Pago de Tarjetas/);
    await user.selectOptions(screen.getByLabelText('¿Qué deuda pagas?'), '');
    expect(screen.getByText(/Contará como gasto y no bajará ninguna deuda/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    const [tx] = useFinanceStore.getState().expenses;
    expect(tx).toMatchObject({ type: 'expense', category: 'pago-tarjetas' });
    expect(tx.debtId).toBeUndefined();
    expect(useFinanceStore.getState().debts[0].balance).toBe(1000);
  });

  it('el pago sale de la cuenta elegida', async () => {
    const user = userEvent.setup();
    const cuenta = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 500 });
    nuevaDeuda();
    abrirModal();
    montar();

    await user.type(screen.getByLabelText(/Monto/i), '200');
    await clicCategoria(/Pago de Tarjetas/);
    await user.selectOptions(screen.getByLabelText('Cuenta'), cuenta);
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }));

    const [tx] = useFinanceStore.getState().expenses;
    expect(tx).toMatchObject({ type: 'transfer', accountId: cuenta, toAccountId: null });
    expect(accountBalance(useFinanceStore.getState().accounts[0], useFinanceStore.getState().expenses)).toBe(300);
  });

  it('al editar un gasto viejo de «Pago de Tarjetas» sin debtId no aparece el selector (evita bajar el saldo dos veces)', async () => {
    nuevaDeuda();
    const id = useFinanceStore.getState().addTransaction({
      type: 'expense', amount: 80, concept: 'Pago viejo', date: '2026-08-10',
      category: 'pago-tarjetas', method: 'cash', businessType: 'personal',
    });
    abrirModal(id);
    montar();

    expect(screen.queryByLabelText('¿Qué deuda pagas?')).not.toBeInTheDocument();
  });

  it('editar un pago ya enlazado permite cambiar el monto sin pedir cuenta destino y ajusta el saldo', async () => {
    const user = userEvent.setup();
    const cuenta = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 500 });
    useFinanceStore.getState().addAccount({ name: 'Efectivo', kind: 'Efectivo', initialBalance: 0 });
    const debtId = nuevaDeuda();
    useFinanceStore.getState().registerDebtPayment(debtId, { amount: 250, date: '2026-08-10', accountId: cuenta });
    const [pago] = useFinanceStore.getState().expenses;

    abrirModal(pago.id);
    montar();

    expect(screen.getByLabelText('¿Qué deuda pagas?')).toHaveValue(debtId);
    expect(screen.queryByLabelText('Cuenta destino')).not.toBeInTheDocument();
    const monto = screen.getByLabelText('Monto');
    await user.clear(monto);
    await user.type(monto, '300');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const { expenses, debts } = useFinanceStore.getState();
    expect(expenses[0]).toMatchObject({ id: pago.id, type: 'transfer', debtId, amount: 300, toAccountId: null });
    expect(debts[0].balance).toBe(700);
  });

  it('editar un gasto enlazado antiguo (expense + debtId) lo normaliza a transferencia sin tocar el saldo', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda({ balance: 750 });
    useFinanceStore.setState({
      expenses: [{
        id: 'viejo', type: 'expense', amount: 250, concept: 'Pago Visa', date: '2026-08-10',
        category: 'pago-tarjetas', method: 'cash', businessType: 'personal', debtId,
        updated_at: '2026-08-10T00:00:00.000Z',
      }],
    });
    abrirModal('viejo');
    montar();

    expect(screen.getByLabelText('¿Qué deuda pagas?')).toHaveValue(debtId);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(useFinanceStore.getState().expenses[0]).toMatchObject({ type: 'transfer', category: TRANSFER_CATEGORY, debtId });
    expect(useFinanceStore.getState().debts[0].balance).toBe(750);
  });

  it('al borrar un pago avisa de que el saldo de la deuda volverá a subir', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda({ name: 'Visa Pichincha', balance: 1000 });
    useFinanceStore.getState().registerDebtPayment(debtId, { amount: 250, date: '2026-08-10', accountId: null });
    const [pago] = useFinanceStore.getState().expenses;

    abrirModal(pago.id);
    montar();
    await user.click(screen.getByRole('button', { name: 'Eliminar movimiento' }));

    expect(screen.getByText(/El saldo de «Visa Pichincha» volverá a subir/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useFinanceStore.getState().debts[0].balance).toBe(1000);
  });

  it('al borrar un pago vinculado a mano dice que el saldo no cambia, y no lo cambia', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda({ name: 'Visa Pichincha', balance: 1000 });
    const txId = useFinanceStore.getState().addTransaction({
      type: 'expense', amount: 250, concept: 'Pago viejo', date: '2026-08-10',
      category: 'pago-tarjetas', method: 'cash', businessType: 'personal',
    });
    useFinanceStore.getState().vincularPagoHistorico(txId, debtId);

    abrirModal(txId);
    montar();
    await user.click(screen.getByRole('button', { name: 'Eliminar movimiento' }));

    expect(screen.getByText(/pago vinculado a mano: el saldo de «Visa Pichincha» no cambiará/)).toBeInTheDocument();
    expect(screen.queryByText(/volverá a subir/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useFinanceStore.getState().debts[0].balance).toBe(1000);
  });

  it('al borrar un pago mayor que el saldo avisa de lo que de verdad volverá a subir', async () => {
    const user = userEvent.setup();
    const debtId = nuevaDeuda({ name: 'Visa Pichincha', balance: 100 });
    useFinanceStore.getState().registerDebtPayment(debtId, { amount: 300, date: '2026-08-10', accountId: null });
    const [pago] = useFinanceStore.getState().expenses;

    abrirModal(pago.id);
    montar();
    await user.click(screen.getByRole('button', { name: 'Eliminar movimiento' }));
    expect(screen.getByText(/volverá a subir \$100\.00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(useFinanceStore.getState().debts[0].balance).toBe(100);
  });
});
