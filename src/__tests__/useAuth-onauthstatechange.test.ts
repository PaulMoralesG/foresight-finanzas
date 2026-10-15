// ================================================================
// TESTS — el callback de onAuthStateChange no debe hacer `await` de otros
// métodos del SDK de Supabase: auth-js mantiene un lock durante el callback y
// esperar una llamada que también necesita ese lock provoca un deadlock. Lo
// que toque la red (aquí, profiles.update) se difiere fuera del callback.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/sync', () => ({
  syncService: {
    attach: vi.fn(() => Promise.resolve()),
    detach: vi.fn(),
    disable: vi.fn(),
    hayCambiosSinSubir: vi.fn(() => false),
  },
  isSchemaError: () => false,
  isTransientSchemaError: () => false,
  borrarMarcaDeAgua: vi.fn(),
}));

const h = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: unknown) => unknown),
  update: vi.fn(),
  eq: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: h.getSession,
      onAuthStateChange: (cb: (event: string, session: unknown) => unknown) => {
        h.callback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: () => ({ update: h.update }),
  },
  supabaseAvailable: true,
  olvidarSesionGuardada: vi.fn(),
}));

import { useAuthSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

beforeEach(() => {
  vi.useFakeTimers();
  h.callback = null;
  h.eq.mockReset().mockResolvedValue({ error: null });
  h.update.mockReset().mockImplementation(() => ({ eq: h.eq }));
  // getSession nunca resuelve: el test controla solo el listener.
  h.getSession.mockReset().mockReturnValue(new Promise(() => {}));
  useAuthStore.setState({
    user: { id: 'u1', email: 'viejo@example.com', firstName: 'Ana', lastName: 'Pérez' },
    isLoading: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('onAuthStateChange · USER_UPDATED con email confirmado', () => {
  it('no llama a profiles dentro del callback: se difiere y el callback no devuelve una promesa', async () => {
    renderHook(() => useAuthSession());
    expect(h.callback).not.toBeNull();

    const ret = h.callback!('USER_UPDATED', { user: { id: 'u1', email: 'nuevo@example.com' } });

    // El callback es síncrono: nada que el lock de auth-js tenga que esperar.
    expect(ret).toBeUndefined();
    // El store local se actualiza ya, pero la red todavía no se ha tocado.
    expect(useAuthStore.getState().user?.email).toBe('nuevo@example.com');
    expect(h.update).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(h.update).toHaveBeenCalledWith({ email: 'nuevo@example.com' });
    expect(h.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('si el update de profiles falla, no lanza (solo avisa)', async () => {
    h.eq.mockRejectedValue(new TypeError('Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useAuthSession());

    h.callback!('USER_UPDATED', { user: { id: 'u1', email: 'nuevo@example.com' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(warn).toHaveBeenCalled();
    expect(useAuthStore.getState().user?.email).toBe('nuevo@example.com');
    warn.mockRestore();
  });
});
