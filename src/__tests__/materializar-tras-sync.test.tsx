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

// Ciclo de sync al volver a la pestaña: controlable desde cada test.
const sync = vi.hoisted(() => ({ alVolver: vi.fn(() => Promise.resolve(true)) }));
vi.mock('@/lib/sync', () => ({ syncService: { sincronizarAlVolver: sync.alVolver } }));

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
  materializar.mockImplementation(() => Promise.resolve(0));
  sync.alVolver.mockClear();
  sync.alVolver.mockImplementation(() => Promise.resolve(true));
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

  it('con Supabase, al volver a la pestaña espera al ciclo de sync antes de materializar', async () => {
    cfg.disponible = true;
    useUiStore.setState({ primerSyncCompleto: true });
    render(<AppLayout><div /></AppLayout>);
    await act(async () => { await Promise.resolve(); });
    expect(materializar).toHaveBeenCalledTimes(1);

    let terminarSync: (ok: boolean) => void = () => {};
    sync.alVolver.mockImplementation(() => new Promise<boolean>((r) => { terminarSync = r; }));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sync.alVolver).toHaveBeenCalledTimes(1);
    expect(materializar).toHaveBeenCalledTimes(1); // aún no: el pull puede traer cambios de otro dispositivo

    await act(async () => { terminarSync(true); });
    expect(materializar).toHaveBeenCalledTimes(2);
  });

  it('en modo offline, volver a la pestaña no espera a ningún sync', async () => {
    cfg.disponible = false;
    render(<AppLayout><div /></AppLayout>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sync.alVolver).not.toHaveBeenCalled();
    expect(materializar).toHaveBeenCalledTimes(2);
  });

  it('si materializar falla, no deja una promesa rechazada sin capturar y vuelve a intentarlo después', async () => {
    cfg.disponible = false;
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    materializar.mockImplementationOnce(() => Promise.reject(new Error('cuota llena')));
    render(<AppLayout><div /></AppLayout>);
    await act(async () => { await Promise.resolve(); });
    expect(consola).toHaveBeenCalled();

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(materializar).toHaveBeenCalledTimes(2);
    consola.mockRestore();
  });
});
