// ================================================================
// TESTS — src/stores/authStore.ts
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const mockUser: User = {
  id: 'abc-123',
  email: 'test@example.com',
  firstName: 'Juan',
  lastName: 'Pérez',
};

describe('authStore', () => {
  beforeEach(() => {
    // Resetear a estado inicial
    useAuthStore.setState({ user: null, isLoading: true });
  });

  it('tiene estado inicial correcto', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it('setUser actualiza el usuario y desactiva loading', () => {
    useAuthStore.getState().setUser(mockUser);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isLoading).toBe(false);
  });

  it('setUser(null) limpia el usuario', () => {
    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('logout limpia el usuario', () => {
    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    // logout NO cambia isLoading
  });

  it('setLoading controla el estado de carga', () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });
});
