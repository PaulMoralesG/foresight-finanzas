// ================================================================
// BudgetsPage — Presupuestos
// Hoy: el presupuesto global del mes (editor que vivía en Planes).
// Paso 3.4 del spec: presupuesto por categoría con Este mes / Plan 12
// meses / Reporte anual, como en Balance Dual.
// ================================================================

import { useState } from 'react';
import { Wallet, Check, Pencil, X } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { parseMoneyInput, roundMoney, syncToCloud } from '@/lib/utils';
import { useBudget, currentMonthKey, shiftMonthKey, monthKeyLabel } from '@/hooks/useBudget';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { MonthStepper } from '@/components/ui/MonthStepper';

/* ─── Presupuesto mensual — editor completo ───
   Aquí sí se edita: formulario explícito con selector de mes.
   El dashboard solo lee el resultado vía useBudget. */
function BudgetPlanner() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const setBudget = useFinanceStore((s) => s.setBudget);
  const budgets = useFinanceStore((s) => s.budgets);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();

  const { budget, monthSpent, pct, isCarriedOver, carriedFrom, colorBar, emoji, message } = useBudget(monthKey);

  const isCurrent = monthKey === currentMonthKey();
  const hasOwn = (budgets[monthKey] ?? 0) > 0;

  const save = () => {
    // `parseMoneyInput` ya devuelve 0 para cualquier cosa que no sepa leer, así
    // que comprobar isNaN sobre su salida no detectaba nada: escribir "abc"
    // guardaba un presupuesto de 0 y anunciaba "Presupuesto eliminado". Hay que
    // mirar el texto crudo, y aceptar el 0 explícito (el botón de quitar).
    const crudo = editValue.trim();
    const v = roundMoney(parseMoneyInput(crudo));
    if (!/\d/.test(crudo) || v < 0) {
      addToast('Ingresa un monto válido', 'error');
      return;
    }
    setBudget(monthKey, v);
    setIsEditing(false);
    setEditValue('');
    addToast(
      v > 0 ? `Presupuesto de ${monthKeyLabel(monthKey)} guardado ✅` : 'Presupuesto eliminado',
      v > 0 ? 'success' : 'info'
    );
    syncToCloud(saveData, addToast);
  };

  const startEdit = () => {
    setEditValue(String(hasOwn ? budgets[monthKey] : budget));
    setIsEditing(true);
  };

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="w-4 h-4 text-brand-500" />
          Presupuesto mensual
        </h2>
        {!isEditing && (hasOwn || budget > 0) && (
          <button
            onClick={startEdit}
            className="saas-btn saas-btn-ghost saas-btn-icon"
            aria-label="Editar presupuesto"
            title="Editar presupuesto"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Límite de gastos del mes. Si un mes no tiene presupuesto propio, se hereda el más reciente.
      </p>

      {/* Selector de mes. Navega por monthKey propio, no por el mes visto en
          el dashboard: aquí se planifica un mes concreto sin mover el resto
          de la app. La presentación es la misma que la de MonthNav. */}
      <div className="mb-3">
        <MonthStepper
          label={monthKeyLabel(monthKey)}
          isCurrent={isCurrent}
          onPrev={() => setMonthKey(shiftMonthKey(monthKey, -1))}
          onNext={() => setMonthKey(shiftMonthKey(monthKey, 1))}
          onCurrent={() => setMonthKey(currentMonthKey())}
        >
          <span className="text-lg ml-auto">{emoji}</span>
        </MonthStepper>
      </div>

      {/* ── Modo edición ── */}
      {isEditing ? (
        <div className="space-y-2.5">
          <label htmlFor="budget-amount" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Presupuesto para {monthKeyLabel(monthKey)}
          </label>
          <div className="flex gap-2">
            <input
              id="budget-amount"
              type="text"
              inputMode="decimal"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Ej: 15000"
              className="saas-input flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setIsEditing(false);
              }}
            />
            <button onClick={save} className="saas-btn-primary" aria-label="Guardar presupuesto">
              <Check className="w-3.5 h-3.5 mr-1" />
              Guardar
            </button>
            <button onClick={() => setIsEditing(false)} className="saas-btn-secondary" aria-label="Cancelar edición">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {hasOwn && (
            <button
              onClick={() => { setEditValue('0'); }}
              className="text-2xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 underline"
            >
              Quitar presupuesto de este mes (guardar 0)
            </button>
          )}
        </div>
      ) : budget === 0 ? (
        /* ── Sin presupuesto: formulario directo ── */
        <div className="space-y-2.5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No hay presupuesto para {monthKeyLabel(monthKey)}. Defínelo aquí:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Ej: 15000"
              aria-label={`Presupuesto para ${monthKeyLabel(monthKey)}`}
              className="saas-input flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
            <button
              onClick={save}
              className="saas-btn-primary"
              aria-label="Guardar presupuesto"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Guardar
            </button>
          </div>
        </div>
      ) : (
        /* ── Presupuesto vigente: estado ── */
        <div className="space-y-2.5">
          {isCarriedOver && (
            <p className="text-2xs text-slate-500 dark:text-slate-400 italic">
              Heredado de {carriedFrom ? monthKeyLabel(carriedFrom) : 'un mes anterior'} — define uno propio para {monthKeyLabel(monthKey)}
            </p>
          )}
          <BudgetProgress
            monthSpent={monthSpent}
            budget={budget}
            pct={pct}
            colorBar={colorBar}
            message={message}
          />
        </div>
      )}
    </div>
  );
}

export function BudgetsPage() {
  return (
    <div className="space-y-4">
      <BudgetPlanner />
    </div>
  );
}
