// ================================================================
// TESTS — persistencia en modo offline
//
// Sin Supabase configurado, `useAuthSession` toma la rama offline. Esa rama
// llamaba a financeStore.reset() en CADA arranque, así que un gasto guardado
// desaparecía en la siguiente recarga: la app parecía funcionar hasta que
// cerrabas la pestaña, justo lo contrario de lo que promete el README.
//
// El reset existe para que la siguiente cuenta no vea datos de la anterior.
// En offline no hay cuentas —siempre es el mismo OFFLINE_USER—, así que ahí
// no protege de nada y solo borra trabajo.
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFinanceStore } from '@/stores/financeStore';
import { useAuthStore } from '@/stores/authStore';

// Sin variables de entorno de Supabase, que es la definición de modo offline
vi.mock('@/config/supabase', () => ({
  supabase: null,
  supabaseAvailable: false,
}));

const gasto = {
  type: 'expense' as const,
  amount: 777,
  concept: 'Sobrevive a la recarga',
  date: '2026-08-15',
  category: 'comida',
  method: 'cash' as const,
  businessType: 'personal' as const,
};

beforeEach(() => {
  useFinanceStore.setState({
    expenses: [],
    budgets: {},
    budgetUpdatedAt: {},
    savingsGoals: [],
    customExpenseCategories: [],
    customIncomeCategories: [],
    tombstones: {},
  });
  useAuthStore.setState({ user: null, isLoading: true });
});

describe('modo offline', () => {
  it('arrancar la sesión NO borra los datos ya guardados', async () => {
    const { useAuthSession } = await import('@/hooks/useAuth');

    // Estado como quedaría tras una sesión anterior, ya rehidratado del disco
    useFinanceStore.getState().addTransaction(gasto);
    useFinanceStore.getState().addBudgetLine({ tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 1500, plan: {} });
    useFinanceStore.getState().addSavingsGoal({ concept: 'Casa', target: 5000 });
    expect(useFinanceStore.getState().expenses).toHaveLength(1);

    // Esto es lo que ocurre en cada recarga de la app
    renderHook(() => useAuthSession());

    const estado = useFinanceStore.getState();
    expect(estado.expenses).toHaveLength(1);
    expect(estado.expenses[0].concept).toBe('Sobrevive a la recarga');
    expect(estado.budgetLines[0].limit).toBe(1500);
    expect(estado.savingsGoals).toHaveLength(1);
  });

  it('deja la sesión en el usuario local', async () => {
    const { useAuthSession } = await import('@/hooks/useAuth');
    renderHook(() => useAuthSession());

    const user = useAuthStore.getState().user;
    expect(user?.id).toBe('offline-user');
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('sobrevive a varios arranques seguidos', async () => {
    const { useAuthSession } = await import('@/hooks/useAuth');
    useFinanceStore.getState().addTransaction(gasto);

    for (let i = 0; i < 3; i++) {
      const { unmount } = renderHook(() => useAuthSession());
      unmount();
    }

    expect(useFinanceStore.getState().expenses).toHaveLength(1);
  });
});
