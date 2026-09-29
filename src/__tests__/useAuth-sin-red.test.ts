// ================================================================
// TESTS — useAuthSession no borra los datos locales por un fallo de red
//
// Abrir la app sin red con sesión guardada llevaba al `catch` del perfil o a
// la rama "sin sesión" (el token no se pudo refrescar), y ambas llamaban a
// financeStore.reset(): persist guardaba el estado vacío y se perdían los
// cambios sin sincronizar. Solo se borra si entra otra cuenta o si la sesión
// es inválida de verdad.
// ================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthRetryableFetchError } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  attach: vi.fn(() => Promise.resolve()),
  detach: vi.fn(),
  disable: vi.fn(),
}));

vi.mock('@/lib/sync', () => ({
  syncService: { attach: mocks.attach, detach: mocks.detach, disable: mocks.disable },
  isSchemaError: () => false,
  isTransientSchemaError: () => false,
}));

type Resultado = { data: unknown; error: unknown };
const sb = vi.hoisted(() => ({
  sesion: null as unknown,
  errorSesion: null as unknown,
  perfil: { data: null, error: null } as Resultado,
}));

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: sb.sesion }, error: sb.errorSesion })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve(sb.perfil)) })),
    })),
  })),
}));

vi.mock('@/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAvailable: true,
}));

import { useAuthSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore } from '@/stores/financeStore';
import { guardarDuenoDatos, leerDuenoDatos, duenoEnMemoria, fijarDuenoEnMemoria } from '@/lib/dueno-datos';

const sesionU1 = { user: { id: 'u1', email: 'ana@example.com', user_metadata: {}, new_email: undefined } };

async function arrancar() {
  renderHook(() => useAuthSession());
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}

function conGastoSinSubir() {
  useFinanceStore.getState().reset();
  useFinanceStore.getState().addTransaction({
    type: 'expense', amount: 42, concept: 'Sin subir', date: '2026-09-01',
    category: 'comida', method: 'cash', businessType: 'personal',
  });
}

beforeEach(() => {
  localStorage.clear();
  mocks.attach.mockClear();
  sb.sesion = null;
  sb.errorSesion = null;
  sb.perfil = { data: { email: 'ana@example.com', first_name: 'Ana', last_name: 'Pérez' }, error: null };
  useAuthStore.setState({ user: null, isLoading: true });
  fijarDuenoEnMemoria(null);
  conGastoSinSubir();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useAuthSession sin red', () => {
  it('si falla la consulta del perfil por red, conserva los datos y entra con el usuario', async () => {
    guardarDuenoDatos({ id: 'u1', email: 'ana@example.com' });
    sb.sesion = sesionU1;
    sb.perfil = { data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } };

    await arrancar();

    expect(useFinanceStore.getState().expenses).toHaveLength(1);
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', email: 'ana@example.com' });
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(mocks.attach).toHaveBeenCalledWith('u1');
  });

  it('si getSession no pudo refrescar el token por red, conserva los datos del dueño', async () => {
    guardarDuenoDatos({ id: 'u1', email: 'ana@example.com', firstName: 'Ana' });
    sb.errorSesion = new AuthRetryableFetchError('Failed to fetch', 0);

    await arrancar();

    expect(useFinanceStore.getState().expenses).toHaveLength(1);
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', firstName: 'Ana' });
    expect(leerDuenoDatos()?.id).toBe('u1');
  });

  it('sin sesión de verdad (sin error de red), sigue limpiando', async () => {
    guardarDuenoDatos({ id: 'u1', email: 'ana@example.com' });

    await arrancar();

    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useAuthStore.getState().user).toBeNull();
    expect(leerDuenoDatos()).toBeNull();
  });

  it('si entra otra cuenta distinta a la dueña de los datos locales, los borra', async () => {
    guardarDuenoDatos({ id: 'otra', email: 'otra@example.com' });
    sb.sesion = sesionU1;

    await arrancar();

    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1' });
    expect(leerDuenoDatos()?.id).toBe('u1');
  });

  it('la misma cuenta con el perfil bien conserva los datos y queda como dueña', async () => {
    guardarDuenoDatos({ id: 'u1', email: 'ana@example.com' });
    fijarDuenoEnMemoria('u1');
    sb.sesion = sesionU1;

    await arrancar();

    expect(useFinanceStore.getState().expenses).toHaveLength(1);
    expect(leerDuenoDatos()).toMatchObject({ id: 'u1', firstName: 'Ana' });
    expect(duenoEnMemoria()).toBe('u1');
  });

  it('varias pestañas: si la memoria es de otra cuenta, reinicia aunque localStorage ya diga la nueva', async () => {
    // La pestaña 1 ya dejó dueño=u1; ésta conserva en memoria los datos de A.
    guardarDuenoDatos({ id: 'u1', email: 'ana@example.com' });
    fijarDuenoEnMemoria('cuenta-a');
    sb.sesion = sesionU1;

    await arrancar();

    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(duenoEnMemoria()).toBe('u1');
  });
});
