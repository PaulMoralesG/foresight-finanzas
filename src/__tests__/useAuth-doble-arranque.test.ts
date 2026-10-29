// ================================================================
// TESTS — useAuthSession no carga la sesión dos veces al arrancar
//
// Con sesión guardada llegan DOS disparos casi a la vez: la promesa de
// getSession() y el evento INITIAL_SESSION de onAuthStateChange. Ambos
// llamaban a loadProfile, y el guard de "sesión ya cargada" no servía porque
// `sesionCargadaPara` solo se fija cuando el perfil termina de leerse: cada
// arranque leía el perfil dos veces y adjuntaba el sync dos veces (dos ciclos
// completos de import legacy + pull + merge + push).
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
const sb = vi.hoisted(() => ({
  sesion: null as unknown,
  perfil: { data: null, error: null } as Resultado,
  alCambiarSesion: null as ((evento: string, sesion: unknown) => unknown) | null,
  lecturasPerfil: 0,
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
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => {
          sb.lecturasPerfil += 1;
          return Promise.resolve(sb.perfil);
        }),
      })),
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
import { fijarDuenoEnMemoria } from '@/lib/dueno-datos';

const sesion = (id: string, email: string) => ({ user: { id, email, user_metadata: {}, new_email: undefined } });

async function tick(n = 8) {
  for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  localStorage.clear();
  mocks.attach.mockClear();
  sb.lecturasPerfil = 0;
  sb.alCambiarSesion = null;
  sb.sesion = sesion('u1', 'ana@example.com');
  sb.perfil = { data: { email: 'ana@example.com', first_name: 'Ana', last_name: 'Pérez' }, error: null };
  useAuthStore.setState({ user: null, isLoading: true });
  fijarDuenoEnMemoria(null);
});

describe('useAuthSession · arranque con getSession + INITIAL_SESSION', () => {
  it('carga el perfil y adjunta el sync UNA sola vez aunque lleguen ambos disparos', async () => {
    renderHook(() => useAuthSession());
    // INITIAL_SESSION llega mientras la carga de getSession aún está en vuelo.
    sb.alCambiarSesion!('INITIAL_SESSION', sb.sesion);
    await tick();

    expect(sb.lecturasPerfil).toBe(1);
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    expect(mocks.attach).toHaveBeenCalledWith('u1');
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', firstName: 'Ana' });
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('el guard no bloquea el cambio de cuenta: un SIGNED_IN de otra cuenta sí se carga', async () => {
    renderHook(() => useAuthSession());
    sb.alCambiarSesion!('INITIAL_SESSION', sb.sesion);
    await tick();
    expect(mocks.attach).toHaveBeenCalledTimes(1);

    sb.perfil = { data: { email: 'beto@example.com', first_name: 'Beto', last_name: '' }, error: null };
    sb.alCambiarSesion!('SIGNED_IN', sesion('u2', 'beto@example.com'));
    await tick();

    expect(mocks.attach).toHaveBeenCalledTimes(2);
    expect(mocks.attach).toHaveBeenLastCalledWith('u2');
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u2', firstName: 'Beto' });
  });

  it('tras cerrar sesión, volver a entrar con la misma cuenta vuelve a cargarla', async () => {
    renderHook(() => useAuthSession());
    await tick();
    expect(mocks.attach).toHaveBeenCalledTimes(1);

    sb.alCambiarSesion!('SIGNED_OUT', null);
    sb.alCambiarSesion!('SIGNED_IN', sb.sesion);
    await tick();

    expect(mocks.attach).toHaveBeenCalledTimes(2);
    expect(sb.lecturasPerfil).toBe(2);
  });

  it('tras un perfil fallido, un evento posterior del mismo usuario vuelve a intentarlo', async () => {
    sb.perfil = { data: null, error: { message: 'boom', code: 'XX000' } };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHook(() => useAuthSession());
    await tick();
    expect(sb.lecturasPerfil).toBe(1);
    expect(mocks.attach).not.toHaveBeenCalled();

    sb.perfil = { data: { email: 'ana@example.com', first_name: 'Ana', last_name: 'Pérez' }, error: null };
    sb.alCambiarSesion!('TOKEN_REFRESHED', sb.sesion);
    await tick();

    expect(sb.lecturasPerfil).toBe(2);
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
