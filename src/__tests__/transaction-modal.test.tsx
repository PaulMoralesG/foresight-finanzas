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

