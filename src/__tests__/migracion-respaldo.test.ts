// ================================================================
// TESTS — respaldo del estado persistido cuando una migración falla
//
// Si una migrateVn lanza, el store arranca vacío y persist guarda ese estado
// vacío encima del original: sin respaldo, el historial local se perdía.
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFinanceStore, CLAVE_RESPALDO_MIGRACION } from '@/stores/financeStore';

vi.mock('@/config/supabase', () => ({
  supabase: null,
  supabaseAvailable: false,
}));

const CLAVE = 'foresight-finance-storage';

// Una meta `null` hace lanzar a migrateV8 (lee `g.id`).
const crudoRoto = JSON.stringify({
  state: {
    expenses: [{ id: 'e1', type: 'expense', amount: 50, concept: 'Café', date: '2026-01-02', category: 'comida' }],
    savingsGoals: [null],
  },
  version: 7,
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('migración fallida del estado persistido', () => {
  it('copia el estado crudo a la clave de respaldo antes de reiniciar', async () => {
    localStorage.setItem(CLAVE, crudoRoto);

    await useFinanceStore.persist.rehydrate();

    expect(useFinanceStore.getState().expenses).toEqual([]);
    expect(localStorage.getItem(CLAVE_RESPALDO_MIGRACION)).toBe(crudoRoto);
  });

  it('una migración que va bien no deja respaldo', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({ state: { expenses: [] }, version: 7 }));

    await useFinanceStore.persist.rehydrate();

    expect(localStorage.getItem(CLAVE_RESPALDO_MIGRACION)).toBeNull();
  });

  it('cerrar sesión borra también el respaldo', async () => {
    localStorage.setItem(CLAVE_RESPALDO_MIGRACION, crudoRoto);
    const { useAuth } = await import('@/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    await act(async () => { await result.current.signOut(); });

    expect(localStorage.getItem(CLAVE_RESPALDO_MIGRACION)).toBeNull();
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });
});
