// ================================================================
// TESTS — MovementsPage, tarjeta móvil: el toque en el concepto abre el
// editor y los chips de la fila 2 siguen filtrando sin abrirlo.
//
// Regresión: en táctil, la zona ampliada (::after de 44px) de los chips
// `.saas-chip-click` tapaba el concepto y el toque iba al filtro. La
// corrección es CSS (`[data-tarjeta-mov] .saas-chip-click::after`), que jsdom
// no evalúa; aquí se fija el contrato que la hace posible (el atributo) y el
// comportamiento de clic que no debe cambiar.
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

const mov = (o: Partial<Transaction>): Transaction => ({
  id: 'tx-cafe',
  type: 'expense',
  amount: 100,
  concept: 'Café de la esquina',
  date: `${mk}-10`,
  category: 'comida',
  method: 'card',
  businessType: 'personal',
  updated_at: '2026-09-10T00:00:00.000Z',
  ...o,
});

beforeEach(() => {
  cleanup();
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [], pendingFilter: undefined, isModalOpen: false, editingId: null });
  useFinanceStore.setState({
    expenses: [mov({}), mov({ id: 'tx-bus', concept: 'Bus', category: 'transporte' })],
  });
});

/** La tarjeta móvil es el contenedor `role=button` marcado con `data-tarjeta-mov`. */
function tarjetaDe(concepto: string): HTMLElement {
  const tarjetas = Array.from(document.querySelectorAll<HTMLElement>('[data-tarjeta-mov]'));
  const tarjeta = tarjetas.find((t) => within(t).queryByText(concepto));
  if (!tarjeta) throw new Error(`Sin tarjeta móvil para «${concepto}»`);
  return tarjeta;
}

describe('MovementsPage — tarjeta móvil', () => {
  it('la tarjeta lleva data-tarjeta-mov (gancho del CSS que quita la zona ampliada de los chips)', () => {
    render(<MovementsPage />);
    const tarjeta = tarjetaDe('Café de la esquina');
    expect(tarjeta).toHaveAttribute('role', 'button');
    expect(tarjeta.querySelectorAll('.saas-chip-click').length).toBeGreaterThan(0);
  });

  it('tocar el concepto abre el editor de ese movimiento', async () => {
    render(<MovementsPage />);
    await userEvent.click(within(tarjetaDe('Café de la esquina')).getByText('Café de la esquina'));
    expect(useUiStore.getState().isModalOpen).toBe(true);
    expect(useUiStore.getState().editingId).toBe('tx-cafe');
  });

  it('tocar el chip de categoría filtra y no abre el editor', async () => {
    render(<MovementsPage />);
    // Orden de la fila 2: tipo, categoría, ámbito.
    const chips = within(tarjetaDe('Café de la esquina')).getAllByTitle(/Filtrar solo/);
    expect(chips).toHaveLength(3);
    await userEvent.click(chips[1]);
    expect(useUiStore.getState().isModalOpen).toBe(false);
    expect(useUiStore.getState().editingId).toBeNull();
    // El filtro de categoría deja fuera el otro movimiento.
    expect(screen.queryByText('Bus')).not.toBeInTheDocument();
  });
});
