// ================================================================
// TESTS — AppLayout no materializa recurrencias antes del primer sync
//
// Con Supabase, materializar antes del primer pull regeneraba ocurrencias
// que otro dispositivo había editado o borrado, con el mismo id y un
// `updated_at` más nuevo: ganaban el merge y pisaban ese cambio.
// ================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const cfg = vi.hoisted(() => ({ disponible: true }));

vi.mock('@/config/supabase', () => ({
  supabase: null,
  get supabaseAvailable() {
    return cfg.disponible;
  },
}));

// El cromo de la app no importa aquí y arrastra hooks de sesión.
vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/TabBar', () => ({ TabBar: () => null }));
vi.mock('@/components/ui/Toast', () => ({ Toast: () => null }));

import { AppLayout } from '@/components/layout/AppLayout';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';

const materializar = vi.fn(() => Promise.resolve(0));

beforeEach(() => {
  materializar.mockClear();
  useFinanceStore.setState({ materializarRecurrencias: materializar, ensureCurrentMonth: vi.fn() });
  useUiStore.setState({ primerSyncCompleto: false });
});

describe('AppLayout — materialización de recurrencias', () => {
  it('con Supabase, espera a que termine el primer ciclo de sync', async () => {
    cfg.disponible = true;
    render(<AppLayout><div /></AppLayout>);
    await act(async () => { await Promise.resolve(); });
    expect(materializar).not.toHaveBeenCalled();

    await act(async () => { useUiStore.getState().setPrimerSyncCompleto(true); });
    expect(materializar).toHaveBeenCalledTimes(1);
  });

  it('con Supabase, volver a la pestaña materializa una vez sincronizado', async () => {
    cfg.disponible = true;
    useUiStore.setState({ primerSyncCompleto: true });
    render(<AppLayout><div /></AppLayout>);
    await act(async () => { await Promise.resolve(); });
    expect(materializar).toHaveBeenCalledTimes(1);

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(materializar).toHaveBeenCalledTimes(2);
  });

  it('en modo offline materializa al montar, como siempre', async () => {
    cfg.disponible = false;
    render(<AppLayout><div /></AppLayout>);
    await act(async () => { await Promise.resolve(); });
    expect(materializar).toHaveBeenCalledTimes(1);
  });
});
