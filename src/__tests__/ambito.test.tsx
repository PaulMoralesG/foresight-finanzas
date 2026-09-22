// ================================================================
// TESTS — ámbito global (Todo / Personal / Negocio)
// lib/ambito.ts (puro), el segmentado de la cabecera y su efecto en el
// Resumen y en las vistas que filtran por etiqueta.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enAmbito, filtrarPorAmbito } from '@/lib/ambito';
import { Header } from '@/components/layout/Header';
import { HomePage } from '@/pages/HomePage';
import { DebtsPage } from '@/pages/DebtsPage';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Transaction } from '@/types';

let n = 0;
const mov = (o: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100,
  concept: '',
  date: '2026-08-15',
  category: 'comida',
  method: 'cash',
  businessType: 'personal',
  updated_at: '2026-08-15T10:00:00.000Z',
  ...o,
});

beforeEach(() => {
  cleanup();
  n = 0;
  useFinanceStore.getState().reset();
  useFinanceStore.setState({ currentViewDate: new Date(2026, 7, 1).toISOString(), ambito: 'all' });
  useUiStore.setState({ activeTab: 'home', toasts: [] });
});

describe('lib/ambito', () => {
  it('enAmbito: "all" acepta todo; personal/business exigen la etiqueta', () => {
    expect(enAmbito('all', 'business')).toBe(true);
    expect(enAmbito('all', undefined)).toBe(true);
    expect(enAmbito('personal', 'personal')).toBe(true);
    expect(enAmbito('personal', 'business')).toBe(false);
    expect(enAmbito('business', undefined)).toBe(false);
  });

  it('filtrarPorAmbito devuelve la misma lista con "all" y filtra con el resto', () => {
    const items = [{ tag: 'personal' as const }, { tag: 'business' as const }];
    expect(filtrarPorAmbito(items, 'all', (i) => i.tag)).toBe(items);
    expect(filtrarPorAmbito(items, 'business', (i) => i.tag)).toEqual([{ tag: 'business' }]);
  });
});

describe('segmentado de la cabecera', () => {
  it('cambia el ámbito del store y se oculta en Cuentas, Patrimonio y Ajustes', async () => {
    const { unmount } = render(<Header />);
    const grupo = screen.getAllByRole('group', { name: 'Ámbito' })[0];
    await userEvent.click(within(grupo).getByRole('button', { name: 'Negocio' }));
    expect(useFinanceStore.getState().ambito).toBe('business');
    expect(within(grupo).getByRole('button', { name: 'Negocio' })).toHaveAttribute('aria-pressed', 'true');
    unmount();

    for (const tab of ['accounts', 'networth', 'settings'] as const) {
      useUiStore.setState({ activeTab: tab });
      const r = render(<Header />);
      expect(screen.queryByRole('group', { name: 'Ámbito' })).not.toBeInTheDocument();
      r.unmount();
    }
  });
});

describe('Resumen con ámbito', () => {
  it('con "Personal" los KPIs solo suman lo personal y desaparece "Resultado del negocio"', () => {
    useFinanceStore.setState({
      expenses: [
        mov({ type: 'income', amount: 1000, businessType: 'personal' }),
        mov({ type: 'income', amount: 5000, businessType: 'business' }),
        mov({ type: 'expense', amount: 300, businessType: 'business' }),
      ],
    });
    const r = render(<HomePage />);
    expect(within(screen.getByTitle('Ver ingresos')).getByText('$6,000.00')).toBeInTheDocument();
    expect(screen.getByTitle('Ver movimientos de negocio')).toBeInTheDocument();
    r.unmount();

    useFinanceStore.setState({ ambito: 'personal' });
    render(<HomePage />);
    expect(within(screen.getByTitle('Ver ingresos')).getByText('$1,000.00')).toBeInTheDocument();
    expect(within(screen.getByTitle('Ver gastos')).getByText('$0.00')).toBeInTheDocument();
    expect(screen.queryByTitle('Ver movimientos de negocio')).not.toBeInTheDocument();
  });
});

describe('Deudas con ámbito', () => {
  it('solo proyecta las deudas del ámbito elegido', () => {
    const s = useFinanceStore.getState();
    s.addDebt({ name: 'Tarjeta personal', tag: 'personal', kind: 'Tarjeta de crédito', balance: 1000, annualRate: 20, minPayment: 100, payDay: null });
    s.addDebt({ name: 'Préstamo negocio', tag: 'business', kind: 'Préstamo', balance: 5000, annualRate: 10, minPayment: 300, payDay: null });
    useFinanceStore.setState({ ambito: 'business' });
    render(<DebtsPage />);
    expect(screen.getByText('Préstamo negocio')).toBeInTheDocument();
    expect(screen.queryByText('Tarjeta personal')).not.toBeInTheDocument();
    expect(screen.getByText('Deuda total').parentElement).toHaveTextContent('$5,000.00');
  });
});

describe('Movimientos con ámbito', () => {
  it('la lista y el resumen del mes solo cuentan el ámbito activo', async () => {
    const { MovementsPage } = await import('@/pages/MovementsPage');
    useFinanceStore.setState({
      expenses: [
        mov({ type: 'income', amount: 1000, concept: 'Sueldo', businessType: 'personal' }),
        mov({ type: 'income', amount: 5000, concept: 'Venta del mes', businessType: 'business' }),
      ],
      ambito: 'personal',
    });
    useUiStore.setState({ activeTab: 'movements' });
    render(<MovementsPage />);

    // La página pinta la lista dos veces (tarjetas en móvil, tabla en
    // escritorio); basta con que el movimiento del otro ámbito no esté.
    expect(screen.getAllByText('Sueldo').length).toBeGreaterThan(0);
    expect(screen.queryByText('Venta del mes')).not.toBeInTheDocument();
    // La línea de resumen: "1 transacción · $1,000.00 ingresos · $0.00 gastos"
    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('$6,000.00')).not.toBeInTheDocument();
  });
});
