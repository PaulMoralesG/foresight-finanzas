// ================================================================
// TESTS — NetWorthPage (Patrimonio), cierre mensual y migración v11
// ================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetWorthPage } from '@/pages/NetWorthPage';
import { useNetWorthSnapshot } from '@/hooks/useNetWorthSnapshot';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { currentMonthKey } from '@/hooks/useBudget';

beforeEach(() => {
  cleanup();
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NetWorthPage', () => {
  it('muestra los KPIs a partir de cuentas, activos y deudas', () => {
    const banco = useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    useFinanceStore.getState().addAsset({ name: 'Moto', tag: 'personal', group: 'Otros activos', value: 3000 });
    useFinanceStore.getState().addDebt({ name: 'Tarjeta', tag: 'personal', kind: 'Tarjeta de crédito', balance: 2400, annualRate: 22, minPayment: 85, payDay: null });
    void banco;
    render(<NetWorthPage />);

    // 'Patrimonio neto' aparece también en la leyenda de la curva: se acota al KPI (<p>)
    expect(screen.getByText('Patrimonio neto', { selector: 'p' }).parentElement).toHaveTextContent('$1,600.00'); // 4000 − 2400
    expect(screen.getByText('Total de activos').parentElement).toHaveTextContent('$4,000.00');
    expect(screen.getByText('Total de pasivos').parentElement).toHaveTextContent('$2,400.00');
    expect(screen.getByText('Falta para la meta').parentElement).toHaveTextContent('Sin meta');
    // Composición
    const comp = screen.getByRole('heading', { name: 'De qué se compone' }).closest('.saas-card') as HTMLElement;
    expect(within(comp).getByText('Cuentas y efectivo')).toBeInTheDocument();
    expect(within(comp).getByText('Otros activos')).toBeInTheDocument();
    expect(within(comp).getByText('Deudas registradas')).toBeInTheDocument();
  });

  it('con meta definida, muestra lo que falta', () => {
    useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    useFinanceStore.getState().setSettings({ netWorthGoal: 5000 });
    render(<NetWorthPage />);
    expect(screen.getByText('Falta para la meta').parentElement).toHaveTextContent('$4,000.00');
  });

  it('crea un activo agrupado y lo borra', async () => {
    render(<NetWorthPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar activo' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Nombre'), 'Fondo de inversión');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'Inversiones');
    await userEvent.type(within(dialogo).getByLabelText('Valor actual'), '1500');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Crear' }));

    expect(useFinanceStore.getState().assets[0]).toMatchObject({ name: 'Fondo de inversión', group: 'Inversiones', value: 1500 });
    expect(screen.getByRole('heading', { name: 'Inversiones' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Fondo de inversión' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(useFinanceStore.getState().assets).toHaveLength(0);
  });

  it('con menos de dos cierres, la curva avisa que empieza el mes que viene', () => {
    useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 100 });
    render(<NetWorthPage />);
    expect(screen.getByText(/La curva empieza a dibujarse el próximo mes/)).toBeInTheDocument();
  });

  it('con historial dibuja la curva', () => {
    useFinanceStore.setState({
      networth: [
        { month: '2026-07', assets: 1000, liabilities: 0, net: 1000, updated_at: '2026-07-31T00:00:00.000Z' },
        { month: '2026-08', assets: 1200, liabilities: 100, net: 1100, updated_at: '2026-08-31T00:00:00.000Z' },
      ],
    });
    render(<NetWorthPage />);
    expect(screen.getByRole('img', { name: 'Patrimonio neto por mes' })).toBeInTheDocument();
  });
});

describe('useNetWorthSnapshot (cierre mensual automático)', () => {
  it('guarda el cierre del mes cuando cambian los datos, y no lo repite si no cambió', () => {
    vi.useFakeTimers();
    useFinanceStore.getState().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 500 });
    const { rerender } = renderHook(() => useNetWorthSnapshot());

    act(() => { vi.advanceTimersByTime(1300); });
    const mes = currentMonthKey();
    let snaps = useFinanceStore.getState().networth;
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ month: mes, assets: 500, liabilities: 0, net: 500 });
    const marca = snaps[0].updated_at;

    // Sin cambios: no se reescribe
    rerender();
    act(() => { vi.advanceTimersByTime(1300); });
    expect(useFinanceStore.getState().networth[0].updated_at).toBe(marca);

    // Con una deuda nueva: se reemplaza el cierre del mismo mes
    act(() => {
      useFinanceStore.getState().addDebt({ name: 'X', tag: 'personal', kind: 'Otro', balance: 200, annualRate: 0, minPayment: 0, payDay: null });
    });
    rerender();
    act(() => { vi.advanceTimersByTime(1300); });
    snaps = useFinanceStore.getState().networth;
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ month: mes, assets: 500, liabilities: 200, net: 300 });
  });

  it('sin nada que medir no crea un cierre en cero', () => {
    vi.useFakeTimers();
    renderHook(() => useNetWorthSnapshot());
    act(() => { vi.advanceTimersByTime(1300); });
    expect(useFinanceStore.getState().networth).toHaveLength(0);
  });
});

describe('migración v11 del estado persistido', () => {
  it('añade assets y networth vacíos', () => {
    const opciones = useFinanceStore.persist.getOptions();
    expect(opciones.version).toBe(11);
    const migrado = opciones.migrate!({ expenses: [], savingsGoals: [] }, 10) as { assets: unknown[]; networth: unknown[] };
    expect(migrado.assets).toEqual([]);
    expect(migrado.networth).toEqual([]);
  });
});
