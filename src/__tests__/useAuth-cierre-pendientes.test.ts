// ================================================================
// TESTS — signOut con cambios sin sincronizar
//
// signOut ignoraba que flush() devolviera false y borraba estado y
// almacenamiento igual: los cambios sin subir se perdían sin aviso.
// ================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  flush: vi.fn(() => Promise.resolve(false)),
  adjuntado: vi.fn(() => true),
  hayCambiosSinSubir: vi.fn(() => false),
  attach: vi.fn(() => Promise.resolve()),
  detach: vi.fn(),
  disable: vi.fn(),
}));

// El resto del módulo real (borrarMarcaDeAgua) sí se usa: solo se sustituye el servicio.
vi.mock('@/lib/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sync')>()),
  syncService: mocks,
}));

const supabaseMock = vi.hoisted(() => ({
  auth: {
    signOut: vi.fn((_opciones?: unknown) => Promise.resolve({ error: null })),
    getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

const olvidarSesionGuardada = vi.hoisted(() => vi.fn());

vi.mock('@/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAvailable: true,
  olvidarSesionGuardada,
}));

import { useAuth, useAuthSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore, CLAVE_RESPALDO_MIGRACION } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { guardarDuenoDatos, leerDuenoDatos } from '@/lib/dueno-datos';

const CLAVE = 'foresight-finance-storage';

beforeEach(() => {
  localStorage.clear();
  mocks.flush.mockReset().mockResolvedValue(false);
  mocks.adjuntado.mockReset().mockReturnValue(true);
  mocks.hayCambiosSinSubir.mockReset().mockReturnValue(false);
  supabaseMock.auth.signOut.mockReset().mockResolvedValue({ error: null });
  olvidarSesionGuardada.mockClear();
  useUiStore.setState({ cierreConPendientes: false });
  useAuthStore.setState({ user: { id: 'u1', email: 'ana@example.com', firstName: 'Ana', lastName: '' }, isLoading: false });
  guardarDuenoDatos({ id: 'u1', email: 'ana@example.com' });
  useFinanceStore.getState().reset();
  useFinanceStore.getState().addTransaction({
    type: 'expense', amount: 42, concept: 'Sin subir', date: '2026-09-01',
    category: 'comida', method: 'cash', businessType: 'personal',
  });
});

async function cerrar(modo?: 'preguntar' | 'descartar' | 'conservar') {
  const { result } = renderHook(() => useAuth());
  await act(async () => { await result.current.signOut(modo); });
}

describe('signOut con cambios sin subir', () => {
  it('cierre manual: no borra nada y pide confirmación', async () => {
    await cerrar();

    expect(useUiStore.getState().cierreConPendientes).toBe(true);
    expect(useFinanceStore.getState().expenses).toHaveLength(1);
    expect(localStorage.getItem(CLAVE)).not.toBeNull();
    expect(useAuthStore.getState().user).not.toBeNull();
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();
  });

  it('sin sync adjuntado (arranque sin red) también cuenta como pendiente', async () => {
    mocks.adjuntado.mockReturnValue(false);
    mocks.flush.mockResolvedValue(true);

    await cerrar();

    expect(useUiStore.getState().cierreConPendientes).toBe(true);
    expect(useFinanceStore.getState().expenses).toHaveLength(1);
  });

  it('modo local-only: flush() da true sin subir nada, y aun así pide confirmación', async () => {
    mocks.flush.mockResolvedValue(true);
    mocks.hayCambiosSinSubir.mockReturnValue(true);

    await cerrar();

    expect(useUiStore.getState().cierreConPendientes).toBe(true);
    expect(useFinanceStore.getState().expenses).toHaveLength(1);
  });

  it('confirmado ("descartar"): borra estado, almacenamiento, dueño, respaldo y marca de agua', async () => {
    localStorage.setItem(CLAVE_RESPALDO_MIGRACION, '{"state":{},"version":7}');
    localStorage.setItem('foresight-sync-watermark:u1', '2026-09-01T00:00:00.000Z');

    await cerrar('descartar');

    expect(localStorage.getItem(CLAVE_RESPALDO_MIGRACION)).toBeNull();
    expect(localStorage.getItem('foresight-sync-watermark:u1')).toBeNull();
    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(localStorage.getItem(CLAVE)).toBeNull();
    expect(leerDuenoDatos()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('"descartar" sin red: si el cierre global falla, cierra la sesión en local', async () => {
    supabaseMock.auth.signOut.mockResolvedValueOnce({ error: new Error('Failed to fetch') } as never);

    await cerrar('descartar');

    expect(supabaseMock.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
  });

  it('por inactividad ("conservar"): vuelve al login sin borrar los datos locales', async () => {
    await cerrar('conservar');

    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAuthStore.getState().user).toBeNull();
    expect(useFinanceStore.getState().expenses).toHaveLength(1);
    expect(localStorage.getItem(CLAVE)).not.toBeNull();
    expect(leerDuenoDatos()).toMatchObject({ id: 'u1', conservarDatos: true });

    // El siguiente arranque sin sesión tampoco los borra
    renderHook(() => useAuthSession());
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
    expect(useFinanceStore.getState().expenses).toHaveLength(1);
  });

  it('si salta la inactividad con la confirmación abierta, el aviso no queda para el siguiente usuario', async () => {
    useUiStore.setState({ cierreConPendientes: true });

    await cerrar('conservar');

    expect(useUiStore.getState().cierreConPendientes).toBe(false);
  });

  it('con todo subido, cierra y borra como siempre', async () => {
    mocks.flush.mockResolvedValue(true);

    await cerrar();

    expect(useUiStore.getState().cierreConPendientes).toBe(false);
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it('"descartar" sin red y con el token caducado: borra a mano la sesión guardada', async () => {
    const red = { error: new Error('Failed to fetch') } as never;
    supabaseMock.auth.signOut.mockResolvedValueOnce(red).mockResolvedValueOnce(red);

    await cerrar('descartar');

    expect(olvidarSesionGuardada).toHaveBeenCalled();
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
  });

  it('"conservar" sin red y con el token caducado: borra la sesión, no los datos', async () => {
    supabaseMock.auth.signOut.mockRejectedValueOnce(new Error('Failed to fetch'));

    await cerrar('conservar');

    expect(olvidarSesionGuardada).toHaveBeenCalled();
    expect(useFinanceStore.getState().expenses).toHaveLength(1);
  });

  it('si el cierre local va bien, no toca la clave de sesión a mano', async () => {
    await cerrar('conservar');

    expect(olvidarSesionGuardada).not.toHaveBeenCalled();
  });
});
