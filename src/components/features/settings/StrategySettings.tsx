// ================================================================
// StrategySettings — "Metas y estrategia" (fase 3.5; Balance Dual viewAjustes)
// Meta de patrimonio neto, aporte extra mensual a deudas y método de
// pago. Se aplican a Patrimonio y a Deudas; se guardan al salir del campo.
// ================================================================

import { useEffect, useState } from 'react';
import { Target } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { parseMoneyInput, roundMoney, syncToCloud } from '@/lib/utils';
import type { DebtMethod } from '@/types';

export function StrategySettings({ saveData }: { saveData: () => Promise<boolean> }) {
  const settings = useFinanceStore((s) => s.settings);
  const setSettings = useFinanceStore((s) => s.setSettings);
  const addToast = useUiStore((s) => s.addToast);

  const [goal, setGoal] = useState(String(settings.netWorthGoal || ''));
  const [extra, setExtra] = useState(String(settings.extraPayment || ''));
  // Si llega un valor por sync mientras el campo no está en edición, se refleja.
  useEffect(() => { setGoal(String(settings.netWorthGoal || '')); }, [settings.netWorthGoal]);
  useEffect(() => { setExtra(String(settings.extraPayment || '')); }, [settings.extraPayment]);

  const soloDecimal = (v: string) => /^\d*[.,]?\d*$/.test(v);

  function commit(campo: 'netWorthGoal' | 'extraPayment', raw: string) {
    const v = roundMoney(parseMoneyInput(raw));
    if (v === settings[campo]) return;
    setSettings({ [campo]: v });
    syncToCloud(saveData, addToast);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500">
          <Target className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Metas y estrategia</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Se aplican a Patrimonio y a Deudas</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="set-goal" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Meta de patrimonio neto</label>
          <input
            id="set-goal"
            type="text"
            inputMode="decimal"
            value={goal}
            onChange={(e) => { if (soloDecimal(e.target.value)) setGoal(e.target.value); }}
            onBlur={(e) => commit('netWorthGoal', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="0"
            className="saas-input-sm text-xs tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="set-extra" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Aporte extra mensual a deudas</label>
          <input
            id="set-extra"
            type="text"
            inputMode="decimal"
            value={extra}
            onChange={(e) => { if (soloDecimal(e.target.value)) setExtra(e.target.value); }}
            onBlur={(e) => commit('extraPayment', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="0"
            className="saas-input-sm text-xs tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="set-method" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Método de pago de deudas</label>
          <select
            id="set-method"
            value={settings.debtMethod}
            onChange={(e) => { setSettings({ debtMethod: e.target.value as DebtMethod }); syncToCloud(saveData, addToast); }}
            className="saas-input-sm text-xs"
          >
            <option value="snowball">Bola de nieve (saldo menor primero)</option>
            <option value="avalanche">Avalancha (interés más alto primero)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
