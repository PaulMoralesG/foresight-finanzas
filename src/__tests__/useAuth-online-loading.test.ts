// ================================================================
// TESTS — useAuthSession (modo online): la app no debe esperar a que
// termine un sync completo con Supabase para dejar de mostrar el
// esqueleto de carga. Los datos locales (financeStore, persistidos en
// localStorage) ya están listos; syncService.attach() corre en segundo
// plano y actualiza el ícono de estado del header por su cuenta.
// ================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => {
  let resolverAttach: (() => void) | null = null;
  return {
    attach: vi.fn(() => new Promise<void>((resolve) => { resolverAttach = resolve; })),
    detach: vi.fn(),
    disable: vi.fn(),
    getResolverAttach: () => resolverAttach,
  };
});

vi.mock('@/lib/sync', () => ({
  syncService: {
    attach: mocks.attach,
    detach: mocks.detach,
    disable: mocks.disable,
  },
  isSchemaError: () => false,
  isTransientSchemaError: () => false,
}));

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(() => Promise.resolve({
      data: { session: { user: { id: 'u1', email: 'ana@example.com', user_metadata: {}, new_email: undefined } } },
    })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: { email: 'ana@example.com', first_name: 'Ana', last_name: 'Pérez' }, error: null })),
      })),
    })),
  })),
}));

vi.mock('@/config/supabase', () => ({
  supabase: supabaseMock,
  supabaseAvailable: true,
}));

import { useAuthSession } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

async function tick(n = 1) {
  for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  mocks.attach.mockClear();
  useAuthStore.setState({ user: null, isLoading: true });
});

describe('useAuthSession (online)', () => {
  it('deja de cargar y expone al usuario sin esperar a que attach() termine', async () => {
    renderHook(() => useAuthSession());

    // Deja correr la cadena getSession → perfil, SIN resolver el attach()
    // que está deliberadamente pendiente todavía.
    await tick(6);

    expect(mocks.attach).toHaveBeenCalledWith('u1');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', email: 'ana@example.com', firstName: 'Ana' });

    // El sync en segundo plano se puede resolver después, sin que nada
    // dependa de eso para haber mostrado la app.
    const resolver = mocks.getResolverAttach();
    expect(resolver).not.toBeNull();
    await act(async () => { resolver?.(); await Promise.resolve(); });
  });
});
