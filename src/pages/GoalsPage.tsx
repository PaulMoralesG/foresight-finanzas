// ================================================================
// GoalsPage — Metas de ahorro: crear, editar, eliminar y progreso
// El progreso de cada meta = gastos con categoría "Ahorro" cuyo
// concepto coincide con el de la meta (histórico completo).
// ================================================================

import { useMemo, useState } from 'react';
import { PiggyBank, Plus, Pencil, Trash2, Target } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, parseMoneyInput, roundMoney, syncToCloud } from '@/lib/utils';
import { computeSavingsByConcept, savingsForGoal } from '@/lib/savings';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalSheet } from '@/components/ui/ModalSheet';
import type { SavingsGoal } from '@/types';

export function GoalsPage() {
  const expenses = useFinanceStore((s) => s.expenses);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const addSavingsGoal = useFinanceStore((s) => s.addSavingsGoal);
  const updateSavingsGoal = useFinanceStore((s) => s.updateSavingsGoal);
  const deleteSavingsGoal = useFinanceStore((s) => s.deleteSavingsGoal);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
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
    return roundMoney(sum);
  }, [savingsByConcept]);

  const totalTarget = roundMoney(savingsGoals.reduce((sum, g) => sum + g.target, 0));
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
    const target = roundMoney(parseMoneyInput(targetInput));
    if (!name) {
      addToast('Ingresa un concepto para la meta', 'error');
      return;
    }
    if (target <= 0) {
      addToast('El monto objetivo debe ser mayor a 0', 'error');
      return;
    }

    // Dos metas con el mismo concepto compartirían progreso, porque el avance
    // se empareja por texto y no por id: los aportes de una sumarían también
    // en la otra y el usuario vería el mismo dinero contado dos veces.
    //
    // Atarlos por id pide una columna nueva en `expenses`, su migración de
    // datos y tocar el sync — mucho riesgo para un caso poco frecuente.
    // Impedir el nombre repetido elimina el síntoma sin nada de eso.
    const yaExiste = savingsGoals.some(
      (g) => g.id !== editingGoal?.id && g.concept.trim().toLowerCase() === name.toLowerCase(),
    );
    if (yaExiste) {
      addToast('Ya tienes una meta con ese concepto', 'error');
      return;
    }

    if (editingGoal) {
      const conceptoAnterior = editingGoal.concept.trim();
      updateSavingsGoal(editingGoal.id, { concept: name, target });

      // El progreso de una meta se calcula emparejando su concepto con el de
      // los gastos de categoría "ahorro" — no hay id que los ate. Sin esto,
      // renombrar la meta la desvinculaba de todos sus aportes y el progreso
      // volvía a cero, con el dinero aparentemente perdido.
      const renombrada = conceptoAnterior.toLowerCase() !== name.toLowerCase();
      if (renombrada) {
        const aportes = useFinanceStore
          .getState()
          .expenses.filter(
            (e) =>
              e.type === 'expense' &&
              e.category === 'ahorro' &&
              e.concept.trim().toLowerCase() === conceptoAnterior.toLowerCase(),
          );
        aportes.forEach((e) => updateTransaction(e.id, { concept: name }));
        addToast(
          aportes.length > 0
            ? `Meta actualizada ✅ — ${aportes.length} aporte${aportes.length > 1 ? 's' : ''} renombrado${aportes.length > 1 ? 's' : ''}`
            : 'Meta actualizada ✅',
          'success',
        );
      } else {
        addToast('Meta actualizada ✅', 'success');
      }
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
        <EmptyState
          emoji="💤"
          title="Sin metas aún"
          description={'Creá una meta y registrá gastos con categoría "Ahorro" y el mismo concepto (ej: meta "Casa" + gastos de ahorro con concepto "Casa")'}
          action={{ label: 'Crear mi primera meta', icon: Plus, onClick: openCreate }}
        />
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
                {/* div y no p: un <button> dentro de <p> es HTML inválido y el
                    navegador reubica el botón fuera del párrafo al parsear. */}
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center justify-between gap-2 flex-wrap">
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
                    aria-label={`Aportar a la meta ${goal.concept}`}
                    title={`Aportar a "${goal.concept}"`}
                  >
                    <Plus className="w-3 h-3" />
                    Aportar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal crear/editar ── */}
      {isModalOpen && (
        <ModalSheet
          id="savings-goal-modal-title"
          titulo={editingGoal ? 'Editar meta' : 'Nueva meta'}
          onClose={() => setIsModalOpen(false)}
          trapActivo={isModalOpen && !confirmDelete}
          focoInicial="#goal-concept"
        >

            <div className="p-4 space-y-4">
              <div>
                <label htmlFor="goal-concept" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Concepto
                </label>
                <input
                  id="goal-concept"
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej: Casa, Vacaciones, Auto…"
                  className="saas-input w-full"
                />
              </div>
              <div>
                <label htmlFor="goal-target" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Monto objetivo
                </label>
                <input
                  id="goal-target"
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
        </ModalSheet>
      )}

      {/* ── Confirmación de borrado ──
          Era un diálogo escrito a mano, con su propio overlay, su trampa de
          foco y su marcado, mientras ConfirmDialog hacía exactamente esto
          mismo en el perfil, en las categorías y al cerrar sesión. Dos
          implementaciones de "¿seguro?" es una de más. */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title={`¿Eliminar meta "${confirmDelete?.concept ?? ''}"?`}
        message="Se eliminará solo la meta — tus movimientos de ahorro no se tocan."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
