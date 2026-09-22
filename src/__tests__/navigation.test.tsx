// ================================================================
// TESTS — Navegación (fase 3): ocho vistas en dos secciones
// Sidebar en escritorio, TabBar de 4 + "Más" en móvil, y la traducción
// de los ids de pestaña anteriores guardados en localStorage.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/Sidebar';
import { TabBar } from '@/components/layout/TabBar';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { VIEWS, MOBILE_TABS, normalizarTabId } from '@/config/views';

beforeEach(() => {
  cleanup();
  useUiStore.setState({ activeTab: 'home' });
  useAuthStore.setState({ user: null, isLoading: false });
});

describe('catálogo de vistas', () => {
  it('son ocho, en dos secciones, como Balance Dual', () => {
    expect(VIEWS.map((v) => v.label)).toEqual([
      'Resumen', 'Movimientos', 'Presupuestos',
      'Deudas', 'Metas', 'Patrimonio', 'Cuentas', 'Ajustes',
    ]);
    expect(VIEWS.filter((v) => v.seccion === 'dia-a-dia')).toHaveLength(3);
    expect(VIEWS.filter((v) => v.seccion === 'patrimonio')).toHaveLength(5);
  });

  it('traduce los ids anteriores a la reorganización y tolera basura', () => {
    expect(normalizarTabId('stats')).toBe('home');
    expect(normalizarTabId('savings')).toBe('goals');
    expect(normalizarTabId('profile')).toBe('settings');
    expect(normalizarTabId('budgets')).toBe('budgets');
    expect(normalizarTabId(null)).toBe('home');
    expect(normalizarTabId('lo-que-sea')).toBe('home');
  });
});

describe('Sidebar', () => {
  it('lista las ocho vistas bajo sus cabeceras de sección', () => {
    render(<Sidebar />);
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByText('Día a día')).toBeInTheDocument();
    expect(within(nav).getByText('Patrimonio', { selector: 'p' })).toBeInTheDocument();
    for (const v of VIEWS) {
      expect(within(nav).getByRole('button', { name: v.label })).toBeInTheDocument();
    }
  });

  it('cambia de vista al pulsar', async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: 'Cuentas' }));
    expect(useUiStore.getState().activeTab).toBe('accounts');
  });
});

describe('TabBar (móvil)', () => {
  it('muestra cuatro vistas y "Más"; el resto queda en la hoja', async () => {
    render(<TabBar />);
    for (const id of MOBILE_TABS) {
      const label = VIEWS.find((v) => v.id === id)!.label;
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Deudas' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Más secciones' }));
    const hoja = screen.getByRole('dialog', { name: 'Más secciones' });
    for (const label of ['Deudas', 'Metas', 'Cuentas', 'Ajustes']) {
      expect(within(hoja).getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('elegir una vista de la hoja la activa, cierra la hoja y la muestra en el botón "Más"', async () => {
    render(<TabBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Más secciones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajustes' }));

    expect(useUiStore.getState().activeTab).toBe('settings');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // El botón "Más" pasa a mostrar el nombre de la vista activa que aloja
    expect(screen.getByRole('button', { name: 'Más secciones' })).toHaveTextContent('Ajustes');
  });

  it('Escape cierra la hoja', async () => {
    render(<TabBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Más secciones' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el FAB de nueva transacción solo está activo en Resumen y Movimientos', () => {
    render(<TabBar />);
    const fab = screen.getByRole('button', { name: 'Agregar transacción' });
    expect(fab).toHaveStyle({ opacity: '1' });
    act(() => {
      useUiStore.setState({ activeTab: 'budgets' });
    });
    expect(fab).toHaveStyle({ opacity: '0' });
  });
});
