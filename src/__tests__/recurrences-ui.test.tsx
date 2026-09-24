// ================================================================
// TESTS — la interfaz de los movimientos recurrentes:
// la sub-pestaña de Movimientos y la tarjeta "Próximos cargos".
// ================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementsPage } from '@/pages/MovementsPage';
import { HomePage } from '@/pages/HomePage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Recurrence } from '@/types';

beforeEach(() => {
  cleanup();
  useFinanceStore.getState().reset();
  useUiStore.setState({ activeTab: 'movements', toasts: [] });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 22)); // 22 de septiembre de 2026
  useFinanceStore.setState({ currentViewDate: new Date(2026, 8, 1).toISOString() });
});
afterEach(() => vi.useRealTimers());

const alta = (o: Partial<Recurrence> = {}) =>
  useFinanceStore.getState().addRecurrence({
    type: 'expense',
    amount: 4500,
    concept: 'Renta',
    category: 'vivienda',
    method: 'transfer',
    businessType: 'personal',
    accountId: null,
    toAccountId: null,
    frecuencia: 'monthly',
    intervalo: 1,
    diaMes: 5,
    desde: '2026-10-05',
    hasta: null,
    activa: true,
    ...o,
  });

describe('Movimientos › Recurrentes', () => {
  it('lista las reglas y deja pausarlas', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    alta();
    render(<MovementsPage />);

    await user.click(screen.getByRole('tab', { name: /Recurrentes/ }));
    expect(screen.getByText('Movimientos recurrentes')).toBeInTheDocument();
    expect(screen.getByText(/Cada mes, el 5/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(useFinanceStore.getState().recurrences[0].activa).toBe(false);
    expect(screen.getByText('En pausa')).toBeInTheDocument();
  });

  it('permite editar el día del mes sin borrar ni recrear la regla', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    alta(); // diaMes: 5
    render(<MovementsPage />);
    await user.click(screen.getByRole('tab', { name: /Recurrentes/ }));

    const input = screen.getByLabelText('Día del mes');
    await user.clear(input);
    await user.type(input, '20');
    await user.tab();

    expect(useFinanceStore.getState().recurrences[0].diaMes).toBe(20);
    expect(screen.getByText(/Cada mes, el 20/)).toBeInTheDocument();
  });

  it('ignora un día fuera de rango y deja el que ya tenía', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    alta();
    render(<MovementsPage />);
    await user.click(screen.getByRole('tab', { name: /Recurrentes/ }));

    const input = screen.getByLabelText('Día del mes');
    await user.clear(input);
    await user.type(input, '45');
    await user.tab();

    expect(useFinanceStore.getState().recurrences[0].diaMes).toBe(5);
  });

  it('no muestra el campo de día en reglas semanales o diarias', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    alta({ frecuencia: 'weekly', diaMes: null, desde: '2026-09-07' });
    render(<MovementsPage />);
    await user.click(screen.getByRole('tab', { name: /Recurrentes/ }));

    expect(screen.queryByLabelText('Día del mes')).not.toBeInTheDocument();
  });

  it('sin reglas no muestra la pestaña Recurrentes', () => {
    render(<MovementsPage />);
    expect(screen.queryByRole('tab', { name: /Recurrentes/ })).not.toBeInTheDocument();
  });
});

describe('Resumen › Próximos cargos', () => {
  it('muestra lo que se registrará en los próximos 30 días', () => {
    alta();
    useUiStore.setState({ activeTab: 'home' });
    render(<HomePage />);
    expect(screen.getByText('Próximos cargos')).toBeInTheDocument();
    expect(screen.getByText(/Renta/)).toBeInTheDocument();
    expect(screen.getByText('Salidas previstas: $4,500.00')).toBeInTheDocument();
  });

  it('no aparece si lo siguiente cae más allá de 30 días', () => {
    alta({ desde: '2027-01-05' });
    useUiStore.setState({ activeTab: 'home' });
    render(<HomePage />);
    expect(screen.queryByText('Próximos cargos')).not.toBeInTheDocument();
  });
});

describe('Resumen › Próximos cargos fuera del mes actual', () => {
  it('no aparece al navegar a otro mes', () => {
    alta({ desde: '2026-09-25', diaMes: 25 });
    useFinanceStore.setState({ currentViewDate: new Date(2026, 2, 1).toISOString() }); // marzo
    useUiStore.setState({ activeTab: 'home' });
    render(<HomePage />);
    expect(screen.queryByText('Próximos cargos')).not.toBeInTheDocument();
  });
});
