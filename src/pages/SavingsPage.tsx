// ================================================================
// SavingsPage — Metas de ahorro: crear, editar, eliminar y progreso
// El progreso de cada meta = gastos con categoría "Ahorro" cuyo
// concepto coincide con el de la meta (histórico completo).
// ================================================================

import { useMemo, useState } from 'react';
import { PiggyBank, Plus, Pencil, Trash2, X, Target, Wallet, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, parseMoneyInput, syncToCloud } from '@/lib/utils';
import { computeSavingsByConcept, savingsForGoal } from '@/lib/savings';
import { useBudget, currentMonthKey, shiftMonthKey, monthKeyLabel } from '@/hooks/useBudget';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import type { SavingsGoal } from '@/types';

/* ─── Presupuesto mensual — editor completo (sección Planes) ───
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
    const v = parseMoneyInput(editValue);
    if (isNaN(v) || v < 0) {
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

      {/* Selector de mes */}
      <div className="flex items-center gap-1.5 mb-3">
        <button onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))} className="saas-btn-icon" aria-label="Mes anterior">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setMonthKey(currentMonthKey())}
          disabled={isCurrent}
          className={`relative text-sm font-semibold min-w-[110px] text-center select-none rounded-md px-2 py-1 transition-colors ${
            isCurrent
              ? 'text-slate-700 dark:text-slate-300 cursor-default'
              : 'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950 cursor-pointer'
          }`}
          title={isCurrent ? 'Mes actual' : 'Volver al mes actual'}
        >
          {monthKeyLabel(monthKey)}
          {!isCurrent && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-brand-400" />}
        </button>
        <button onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} className="saas-btn-icon" aria-label="Mes siguiente">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <span className="text-lg ml-auto">{emoji}</span>
      </div>

      {/* ── Modo edición ── */}
      {isEditing ? (
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Presupuesto para {monthKeyLabel(monthKey)}
          </label>
          <div className="flex gap-2">
            <input
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
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 underline"
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
            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
              Heredado de {carriedFrom ? monthKeyLabel(carriedFrom) : 'un mes anterior'} — define uno propio para {monthKeyLabel(monthKey)}
            </p>
          )}
          {pct > 100 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800">
              <span className="text-xs font-bold text-red-700 dark:text-red-400">
                ¡Excedido por {formatMoney(monthSpent - budget)}!
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className={`font-semibold ${pct > 100 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {formatMoney(monthSpent)} de {formatMoney(budget)}
            </span>
            <span className={`font-bold text-sm ${pct > 100 ? 'text-red-600 dark:text-red-400' : pct > 90 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {pct}%
            </span>
          </div>
          <div className={`h-2.5 rounded-full overflow-hidden ${pct > 100 ? 'bg-red-100 dark:bg-red-950/80 ring-1 ring-red-300 dark:ring-red-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
            <div
              className={`h-full ${colorBar} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className={`text-xs font-medium ${pct > 100 ? 'text-red-600 dark:text-red-400' : pct > 90 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {message}
          </p>
        </div>
      )}
    </div>
  );
}

export function SavingsPage() {
  const expenses = useFinanceStore((s) => s.expenses);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const addSavingsGoal = useFinanceStore((s) => s.addSavingsGoal);
  const updateSavingsGoal = useFinanceStore((s) => s.updateSavingsGoal);
  const deleteSavingsGoal = useFinanceStore((s) => s.deleteSavingsGoal);
  const addToast = useUiStore((s) => s.addToast);
  const openModal = useUiStore((s) => s.openModal);
  const { saveData } = useAuth();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavingsGoal | null>(null);
  const [concept, setConcept] = useState('');
  const [targetInput, setTargetInput] = useState('');

  // Histórico completo de ahorros por concepto
  const savingsByConcept = useMemo(() => computeSavingsByConcept(expenses), [expenses]);

  const totalSaved = useMemo(() => {
    let sum = 0;
    for (const saved of savingsByConcept.values()) sum += saved;
    return sum;
  }, [savingsByConcept]);

  const totalTarget = savingsGoals.reduce((sum, g) => sum + g.target, 0);
  const globalPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  function openCreate() {
    setEditingGoal(null);
    setConcept('');
    setTargetInput('');
    setIsModalOpen(true);
  }

  function openEdit(goal: SavingsGoal) {
    setEditingGoal(goal);
    setConcept(goal.concept);
    setTargetInput(String(goal.target));
    setIsModalOpen(true);
  }

  function handleSave() {
    const name = concept.trim();
    const target = parseMoneyInput(targetInput);
    if (!name) {
      addToast('Ingresa un concepto para la meta', 'error');
      return;
    }
    if (target <= 0) {
      addToast('El monto objetivo debe ser mayor a 0', 'error');
      return;
    }

    if (editingGoal) {
      updateSavingsGoal(editingGoal.id, { concept: name, target });
      addToast('Meta actualizada ✅', 'success');
    } else {
      addSavingsGoal({ concept: name, target });
      addToast('Meta creada ✅', 'success');
    }
    syncToCloud(saveData, addToast);
    setIsModalOpen(false);
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteSavingsGoal(confirmDelete.id);
    addToast(`Meta "${confirmDelete.concept}" eliminada`, 'info');
    syncToCloud(saveData, addToast);
    setConfirmDelete(null);
  }

  useEscapeKey(() => {
    if (confirmDelete) setConfirmDelete(null);
    else if (isModalOpen) setIsModalOpen(false);
  }, isModalOpen || !!confirmDelete);

  useScrollLock(isModalOpen || !!confirmDelete);

  return (
    <div className="space-y-4">
      {/* ── Presupuesto mensual (editor) ── */}
      <BudgetPlanner />

      {/* ── Header metas ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-brand-500" />
            Metas de ahorro
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Los gastos con categoría <strong>"Ahorro"</strong> cuyo concepto coincide con la meta suman a su progreso
          </p>
        </div>
        <button
          onClick={openCreate}
          className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Nueva meta
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="saas-card p-4 animate-slide-up">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Ahorrado total
          </span>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
            {formatMoney(totalSaved)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Histórico, todos los conceptos</p>
        </div>
        <div className="saas-card p-4 animate-slide-up">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Objetivo total
          </span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {formatMoney(totalTarget)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{savingsGoals.length} meta{savingsGoals.length === 1 ? '' : 's'}</p>
        </div>
        <div className="saas-card p-4 animate-slide-up">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Progreso global
          </span>
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-400 tabular-nums mt-1">
            {globalPct}%
          </p>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-brand-600 rounded-full transition-all duration-500"
              style={{ width: `${globalPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Lista de metas ── */}
      {savingsGoals.length === 0 ? (
        <div className="saas-card p-8 animate-slide-up text-center">
          <span className="text-3xl">💤</span>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2">Sin metas aún</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Creá una meta y registrá gastos con categoría <strong>"Ahorro"</strong> y el mismo concepto
            (ej: meta "Casa" + gastos de ahorro con concepto "Casa")
          </p>
          <button
            onClick={openCreate}
            className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5 mx-auto mt-4"
          >
            <Plus className="w-4 h-4" />
            Crear mi primera meta
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {savingsGoals.map((goal) => {
            const saved = savingsForGoal(savingsByConcept, goal.concept);
            const pct = goal.target > 0 ? Math.min(100, Math.round((saved / goal.target) * 100)) : 0;
            const remaining = Math.max(0, goal.target - saved);
            return (
              <div key={goal.id} className="saas-card p-4 animate-slide-up">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PiggyBank className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {goal.concept}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(goal)}
                      aria-label={`Editar meta ${goal.concept}`}
                      className="saas-btn saas-btn-ghost saas-btn-icon"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(goal)}
                      aria-label={`Eliminar meta ${goal.concept}`}
                      className="saas-btn saas-btn-ghost saas-btn-icon text-red-600 dark:text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Ahorrado {formatMoney(saved)} de {formatMoney(goal.target)}
                  </span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                    {pct}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-600'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    {remaining > 0 ? `Te falta ${formatMoney(remaining)} para cumplirla` : '🎉 ¡Meta cumplida!'}
                  </span>
                  <button
                    onClick={() => openModal(undefined, {
                      type: 'expense',
                      category: 'ahorro',
                      concept: goal.concept,
                      businessType: 'personal',
                    })}
                    className="saas-btn-primary saas-btn-sm flex items-center gap-1"
                    title={`Aportar a "${goal.concept}"`}
                  >
                    <Plus className="w-3 h-3" />
                    Aportar
                  </button>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal crear/editar ── */}
      {isModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[200] animate-fade-in" onClick={() => setIsModalOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="savings-goal-modal-title"
            className="fixed inset-0 z-[201] bg-white dark:bg-slate-950 md:rounded-2xl shadow-2xl flex flex-col w-full max-w-full md:max-w-md mx-auto overflow-hidden animate-scale-in md:inset-y-6 md:mx-auto pt-safe"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
              <h2 id="savings-goal-modal-title" className="font-bold text-sm text-slate-900 dark:text-white">
                {editingGoal ? 'Editar meta' : 'Nueva meta'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Cerrar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Concepto
                </label>
                <input
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej: Casa, Vacaciones, Auto…"
                  className="saas-input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Monto objetivo
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder="0.00"
                  className="saas-input w-full"
                />
              </div>
            </div>

            <div className="p-4 pt-0 flex gap-2">
              <button onClick={handleSave} className="saas-btn saas-btn-primary flex-1">
                <Target className="w-4 h-4" />
                {editingGoal ? 'Guardar cambios' : 'Crear meta'}
              </button>
              <button onClick={() => setIsModalOpen(false)} className="saas-btn saas-btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Confirmación de borrado ── */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[200] animate-fade-in" onClick={() => setConfirmDelete(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="savings-delete-modal-title"
            className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-[201] mx-auto w-[90%] max-w-sm bg-white dark:bg-slate-950 rounded-2xl shadow-2xl p-5 animate-scale-in"
          >
            <h3 id="savings-delete-modal-title" className="font-bold text-sm text-slate-900 dark:text-white">
              ¿Eliminar meta "{confirmDelete.concept}"?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Se eliminará solo la meta — tus movimientos de ahorro no se tocan.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={handleDelete} className="saas-btn saas-btn-danger flex-1">
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
              <button onClick={() => setConfirmDelete(null)} className="saas-btn saas-btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
