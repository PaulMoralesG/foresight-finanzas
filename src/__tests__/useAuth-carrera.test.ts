// ================================================================
// TESTS — useAuthSession: carrera entre cargas de perfil de dos cuentas
//
// Si llega un SIGNED_IN de la cuenta B mientras la carga de perfil de la
// cuenta A (getSession) sigue en vuelo, ambas corrían hasta el final y ganaba
// la ÚLTIMA en terminar: con A lenta, la app quedaba con setUser(A), dueño A y
// el sync adjuntado a A aunque la sesión vigente fuera la de B. Cada carga
// lleva ahora una generación: la obsoleta descarta su resultado.
// ================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  attach: vi.fn(() => Promise.resolve()),
  detach: vi.fn(),
  disable: vi.fn(),
  hayCambiosSinSubir: vi.fn(() => false),
}));

vi.mock('@/lib/sync', () => ({
  syncService: {
    attach: mocks.attach,
    detach: mocks.detach,
    disable: mocks.disable,
    hayCambiosSinSubir: mocks.hayCambiosSinSubir,
  },
  isSchemaError: () => false,
  isTransientSchemaError: () => false,
  borrarMarcaDeAgua: vi.fn(),
}));

type Resultado = { data: unknown; error: unknown };
type Diferido = { promesa: Promise<Resultado>; resolver: (r: Resultado) => void };

function diferido(): Diferido {
  let resolver!: (r: Resultado) => void;
  const promesa = new Promise<Resultado>((r) => { resolver = r; });
  return { promesa, resolver };
}

const sb = vi.hoisted(() => ({
  sesion: null as unknown,
  alCambiarSesion: null as ((evento: string, sesion: unknown) => unknown) | null,
  // Respuesta del perfil por uid; si no hay, responde al momento.
  perfiles: {} as Record<string, Promise<{ data: unknown; error: unknown }>>,
}));

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: sb.sesion }, error: null })),
    onAuthStateChange: vi.fn((cb: (evento: string, sesion: unknown) => unknown) => {
      sb.alCambiarSesion = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn((_col: string, uid: string) => ({
        maybeSingle: vi.fn(() => sb.perfiles[uid] ?? Promise.resolve({ data: null, error: null })),
      })),
    })),
    upsert: vi.fn(() => ({
      select: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
    })),
  })),
}));

vi.mock('@/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAvailable: true,
  olvidarSesionGuardada: vi.fn(),
}));

import { useAuthSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { fijarDuenoEnMemoria, leerDuenoDatos, duenoEnMemoria } from '@/lib/dueno-datos';

const sesion = (id: string, email: string) => ({ user: { id, email, user_metadata: {}, new_email: undefined } });

async function tick(n = 10) {
  for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  localStorage.clear();
  mocks.attach.mockClear();
  mocks.detach.mockClear();
  sb.alCambiarSesion = null;
  sb.perfiles = {};
  sb.sesion = sesion('uA', 'ana@example.com');
  useAuthStore.setState({ user: null, isLoading: true });
  fijarDuenoEnMemoria(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useAuthSession · carrera entre cuentas', () => {
  it('A lenta (getSession) y B rápida (SIGNED_IN): queda B, y A no hace setUser ni attach', async () => {
    const perfilA = diferido();
    sb.perfiles.uA = perfilA.promesa;
    sb.perfiles.uB = Promise.resolve({ data: { email: 'beto@example.com', first_name: 'Beto', last_name: '' }, error: null });

    renderHook(() => useAuthSession());
    await tick(); // la carga de A (getSession) queda en vuelo

    sb.alCambiarSesion!('SIGNED_IN', sesion('uB', 'beto@example.com'));
    await tick();
    expect(useAuthStore.getState().user).toMatchObject({ id: 'uB', firstName: 'Beto' });

    // A termina DESPUÉS: su resultado es obsoleto.
    perfilA.resolver({ data: { email: 'ana@example.com', first_name: 'Ana', last_name: '' }, error: null });
    await tick();

    expect(useAuthStore.getState().user).toMatchObject({ id: 'uB', firstName: 'Beto' });
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    expect(mocks.attach).toHaveBeenCalledWith('uB');
    expect(leerDuenoDatos()?.id).toBe('uB');
    expect(duenoEnMemoria()).toBe('uB');
  });

  it('si la carga obsoleta de A falla, no desadjunta el sync de B ni toca la sesión', async () => {
    const perfilA = diferido();
    sb.perfiles.uA = perfilA.promesa;
    sb.perfiles.uB = Promise.resolve({ data: { email: 'beto@example.com', first_name: 'Beto', last_name: '' }, error: null });

    renderHook(() => useAuthSession());
    await tick();
    sb.alCambiarSesion!('SIGNED_IN', sesion('uB', 'beto@example.com'));
    await tick();
    mocks.detach.mockClear();

    perfilA.resolver({ data: null, error: { message: 'boom', code: 'XX000' } });
    await tick();

    expect(mocks.detach).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toMatchObject({ id: 'uB' });
  });

  it('una carga que termina después de un SIGNED_OUT no resucita la sesión', async () => {
    const perfilA = diferido();
    sb.perfiles.uA = perfilA.promesa;

    renderHook(() => useAuthSession());
    await tick();
    sb.alCambiarSesion!('SIGNED_OUT', null);
    await tick();

    perfilA.resolver({ data: { email: 'ana@example.com', first_name: 'Ana', last_name: '' }, error: null });
    await tick();

    expect(useAuthStore.getState().user).toBeNull();
    expect(mocks.attach).not.toHaveBeenCalled();
  });
});
