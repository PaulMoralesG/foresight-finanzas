// ================================================================
// TESTS — MovementsPage: los pagos de deuda se muestran como pagos, no como
// gastos (spec deudas-pagos-unificados, D4/D6).
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementsPage } from '@/pages/MovementsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Transaction } from '@/types';

const hoy = new Date();
const mk = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

let n = 0;
const mov = (o: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100,
  concept: `Mov ${n}`,
  date: `${mk}-10`,
  category: 'comida',
  method: 'card',
  businessType: 'personal',
  updated_at: '2026-09-10T00:00:00.000Z',
  ...o,
});

beforeEach(() => {
  cleanup();
  n = 0;
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [], pendingFilter: undefined });
});

function conDeudas() {
  const visa = useFinanceStore.getState().addDebt({ name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 30, minPayment: 50, payDay: null });
  const auto = useFinanceStore.getState().addDebt({ name: 'Auto', tag: 'personal', kind: 'Préstamo', balance: 5000, annualRate: 10, minPayment: 200, payDay: null });
  return { visa, auto };
}

describe('MovementsPage — pagos de deuda', () => {
  it('muestra «Pago de tarjeta · X» y «Pago de préstamo · X» en lugar del concepto', () => {
    const { visa, auto } = conDeudas();
    useFinanceStore.setState({
      expenses: [
        mov({ concept: 'Pago Visa', type: 'transfer', category: 'transferencia', debtId: visa }),
        mov({ concept: 'Cuota auto', type: 'expense', category: 'prestamos', debtId: auto }),
      ],
    });
    render(<MovementsPage />);

    expect(screen.getAllByText('Pago de tarjeta · Visa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pago de préstamo · Auto').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pago Visa')).not.toBeInTheDocument();
  });

  it('si la deuda ya no existe dice «Pago de deuda eliminada»', () => {
    useFinanceStore.setState({
      expenses: [mov({ concept: 'Pago Visa', type: 'transfer', category: 'transferencia', debtId: 'no-existe' })],
    });
    render(<MovementsPage />);
    expect(screen.getAllByText('Pago de deuda eliminada').length).toBeGreaterThan(0);
  });

  it('no se presenta como gasto: píldora «Pago de deuda» y no suma a los gastos del filtro', () => {
    const { visa } = conDeudas();
    useFinanceStore.setState({
      expenses: [
        mov({ concept: 'Café', amount: 30 }),
        mov({ concept: 'Cuota', amount: 900, type: 'expense', category: 'pago-tarjetas', debtId: visa }),
      ],
    });
    render(<MovementsPage />);

    expect(screen.getAllByText('Pago de deuda').length).toBeGreaterThan(0);
    // Solo el Café lleva la píldora «Gasto» (una en móvil y otra en escritorio).
    expect(screen.getAllByText('Gasto', { selector: 'button' })).toHaveLength(2);
  });

  it('con el filtro «Gastos» no aparecen los pagos de deuda; con «Todos» sí', async () => {
    const { visa } = conDeudas();
    useFinanceStore.setState({
      expenses: [
        mov({ concept: 'Café', amount: 30 }),
        mov({ concept: 'Pago Visa', type: 'transfer', category: 'transferencia', debtId: visa }),
        mov({ concept: 'Cuota vieja', type: 'expense', category: 'pago-tarjetas', debtId: visa }),
      ],
    });
    render(<MovementsPage />);
    expect(screen.getAllByText('Pago de tarjeta · Visa').length).toBe(4); // 2 pagos × (móvil + escritorio)

    // Los chips de filtro se pintan también en la barra móvil: basta con el primero.
    await userEvent.click(screen.getAllByRole('button', { name: 'Gastos' })[0]);
    expect(screen.getAllByText('Café').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pago de tarjeta · Visa')).not.toBeInTheDocument();
  });
});
describe('MovementsPage — borrado masivo con pagos de deuda', () => {
  const seleccionarYEliminar = async (nombres: string[]) => {
    for (const nombre of nombres) {
      await userEvent.click(screen.getAllByRole('checkbox', { name: `Seleccionar ${nombre}` })[0]);
    }
    await userEvent.click(screen.getByRole('button', { name: /Eliminar/ }));
    return useUiStore.getState().toasts.map((t) => t.message).join(' | ');
  };

  it('avisa de que los pagos de deuda eliminados vuelven a subir su deuda', async () => {
    const { visa } = conDeudas();
    useFinanceStore.getState().registerDebtPayment(visa, { amount: 300, date: `${mk}-10`, accountId: null });
    const pago = useFinanceStore.getState().expenses[0];
    useFinanceStore.setState({ expenses: [...useFinanceStore.getState().expenses, mov({ concept: 'Café', amount: 30 })] });
    render(<MovementsPage />);

    const mensaje = await seleccionarYEliminar(['Pago de tarjeta · Visa', 'Café']);
    expect(mensaje).toContain('2 transacciones eliminadas');
    expect(mensaje).toContain('El pago de deuda eliminado vuelve a subir el saldo de su deuda');
    expect(useFinanceStore.getState().debts.find((d) => d.id === visa)!.balance).toBe(1000);
    expect(pago.debtId).toBe(visa);
  });

  it('sin pagos de deuda entre los borrados, el aviso no aparece; un vinculado a mano tampoco lo dispara', async () => {
    const { visa } = conDeudas();
    const vinculado = useFinanceStore.getState().addTransaction({
      type: 'expense', amount: 200, concept: 'Cuota vieja', date: `${mk}-11`, category: 'pago-tarjetas', method: 'cash', businessType: 'personal',
    });
    useFinanceStore.getState().vincularPagoHistorico(vinculado, visa);
    useFinanceStore.setState({ expenses: [...useFinanceStore.getState().expenses, mov({ concept: 'Café', amount: 30 })] });
    render(<MovementsPage />);

    const mensaje = await seleccionarYEliminar(['Pago de tarjeta · Visa', 'Café']);
    expect(mensaje).toContain('2 transacciones eliminadas');
    expect(mensaje).not.toContain('vuelve');
    expect(useFinanceStore.getState().debts.find((d) => d.id === visa)!.balance).toBe(1000);
  });
});

