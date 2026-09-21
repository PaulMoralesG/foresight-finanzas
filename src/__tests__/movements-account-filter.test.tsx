// ================================================================
// TESTS — MovementsPage: filtro por cuenta (paridad con Balance Dual,
// que filtra Movimientos por categoría, cuenta, período y nota).
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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

describe('MovementsPage — filtro por cuenta', () => {
  it('sin cuentas, no se ofrece el selector', () => {
    render(<MovementsPage />);
    expect(screen.queryByLabelText('Filtrar por cuenta')).not.toBeInTheDocument();
  });

  it('filtra por la cuenta elegida, y una transferencia cuenta en origen y destino', async () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 0 });
    const efectivo = useFinanceStore.getState().addAccount({ name: 'Efectivo', kind: 'Efectivo', initialBalance: 0 });
    useFinanceStore.setState({
      expenses: [
        mov({ concept: 'Café', accountId: banco }),
        mov({ concept: 'Renta', accountId: efectivo }),
        mov({ concept: 'Traspaso', type: 'transfer', category: 'transferencia', amount: 50, accountId: banco, toAccountId: efectivo }),
      ],
    });
    render(<MovementsPage />);

    const selects = screen.getAllByLabelText('Filtrar por cuenta');
    await userEvent.selectOptions(selects[0], banco);

    // La página renderiza la vista móvil y la de escritorio a la vez
    // (una se oculta por CSS); por eso getAllByText en vez de getByText.
    expect(screen.getAllByText('Café').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Traspaso').length).toBeGreaterThan(0);
    expect(screen.queryByText('Renta')).not.toBeInTheDocument();

    // El chip activo permite quitar el filtro
    const chips = screen.getAllByTitle('Quitar filtro de cuenta');
    await userEvent.click(within(chips[0]).getByText('Banco'));
    expect(screen.getAllByText('Renta').length).toBeGreaterThan(0);
  });
});
