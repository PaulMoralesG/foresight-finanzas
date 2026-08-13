// ================================================================
// SavingsPage — Metas de ahorro: crear, editar, eliminar y progreso
// El progreso de cada meta = gastos con categoría "Ahorro" cuyo
// concepto coincide con el de la meta (histórico completo).
// ================================================================

import { useMemo, useState } from 'react';
import { PiggyBank, Plus, Pencil, Trash2, X, Target } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, parseMoneyInput, syncToCloud } from '@/lib/utils';
import { computeSavingsByConcept, savingsForGoal } from '@/lib/savings';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import type { SavingsGoal } from '@/types';

export function SavingsPage() {
  const expenses = useFinanceStore((s) => s.expenses);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const addSavingsGoal = useFinanceStore((s) => s.addSavingsGoal);
  const updateSavingsGoal = useFinanceStore((s) => s.updateSavingsGoal);
  const deleteSavingsGoal = useFinanceStore((s) => s.deleteSavingsGoal);
  const addToast = useUiStore((s) => s.addToast);
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
      {/* ── Header ── */}
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
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {formatMoney(totalSaved)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Histórico, todos los conceptos</p>
        </div>
        <div className="saas-card p-4 animate-slide-up">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Objetivo total
          </span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {formatMoney(totalTarget)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{savingsGoals.length} meta{savingsGoals.length === 1 ? '' : 's'}</p>
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
                    <PiggyBank className="w-4 h-4 text-emerald-500 flex-shrink-0" />
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
                      className="saas-btn saas-btn-ghost saas-btn-icon text-red-500 hover:text-red-600"
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
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                  {remaining > 0 ? `Te falta ${formatMoney(remaining)} para cumplirla` : '🎉 ¡Meta cumplida!'}
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
          <div className="fixed inset-0 z-[201] bg-white dark:bg-gray-950 md:rounded-2xl shadow-2xl flex flex-col w-full max-w-full md:max-w-md mx-auto overflow-hidden animate-scale-in md:inset-y-6 md:mx-auto pt-safe">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                {editingGoal ? 'Editar meta' : 'Nueva meta'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Cerrar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="text-xs" />
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
          <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-[201] mx-auto w-[90%] max-w-sm bg-white dark:bg-gray-950 rounded-2xl shadow-2xl p-5 animate-scale-in">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
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
