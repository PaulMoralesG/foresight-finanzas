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
  attach: vi.fn(() => Promise.resolve()),
  detach: vi.fn(),
  disable: vi.fn(),
}));

vi.mock('@/lib/sync', () => ({
  syncService: mocks,
  isSchemaError: () => false,
  isTransientSchemaError: () => false,
}));

const supabaseMock = vi.hoisted(() => ({
  auth: {
    signOut: vi.fn((_opciones?: unknown) => Promise.resolve({ error: null })),
    getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

vi.mock('@/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAvailable: true,
}));

import { useAuth, useAuthSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { guardarDuenoDatos, leerDuenoDatos } from '@/lib/dueno-datos';

const CLAVE = 'foresight-finance-storage';

beforeEach(() => {
  localStorage.clear();
  mocks.flush.mockReset().mockResolvedValue(false);
  mocks.adjuntado.mockReset().mockReturnValue(true);
  supabaseMock.auth.signOut.mockClear();
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

  it('confirmado ("descartar"): borra estado, almacenamiento y dueño', async () => {
    await cerrar('descartar');

    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(localStorage.getItem(CLAVE)).toBeNull();
    expect(leerDuenoDatos()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
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

  it('con todo subido, cierra y borra como siempre', async () => {
    mocks.flush.mockResolvedValue(true);

    await cerrar();

    expect(useUiStore.getState().cierreConPendientes).toBe(false);
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });
});
