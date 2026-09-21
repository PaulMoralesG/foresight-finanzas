// ================================================================
// useNetWorthSnapshot — el cierre mensual del patrimonio se arma solo
//
// Portado de syncNetWorth() de Balance Dual: cada vez que cambian cuentas,
// movimientos, activos o deudas, se recalcula el patrimonio de hoy y, si
// difiere del cierre guardado para el mes en curso, se reemplaza. Un
// aporte a una meta con cuenta también cuenta (savedFromAccounts). Con
// debounce, para no escribir en cada tecla. Se monta una vez, en App.
// ================================================================

import { useEffect } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { netWorthNow, needsSnapshot } from '@/lib/networth';
import { currentMonthKey } from '@/hooks/useBudget';

const DEBOUNCE_MS = 1200;

export function useNetWorthSnapshot(): void {
  const accounts = useFinanceStore((s) => s.accounts);
  const expenses = useFinanceStore((s) => s.expenses);
  const assets = useFinanceStore((s) => s.assets);
  const debts = useFinanceStore((s) => s.debts);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);

  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useFinanceStore.getState();
      const month = currentMonthKey();
      const now = netWorthNow({ accounts: state.accounts, expenses: state.expenses, assets: state.assets, debts: state.debts, savingsGoals: state.savingsGoals });
      const existing = state.networth.find((n) => n.month === month);
      // Sin nada que medir no se guarda un cierre en cero: ensuciaría la curva.
      if (now.assets === 0 && now.liabilities === 0 && !existing) return;
      if (!needsSnapshot(existing, now)) return;
      state.saveNetWorthSnapshot({ month, assets: now.assets, liabilities: now.liabilities, net: now.net });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [accounts, expenses, assets, debts, savingsGoals]);
}
