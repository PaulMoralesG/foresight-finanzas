// ================================================================
// GoalsPage — Metas de ahorro (fase 3.8; referencia: viewMetas() de Balance Dual)
//
// Antes el progreso de una meta se derivaba buscando gastos categoría
// "ahorro" cuyo concepto de texto coincidiera con el nombre de la meta.
// Desde la 3.8 cada meta lleva su propio `saved`: se actualiza al
// "Registrar aporte" (con o sin cuenta) o al editar la meta directamente,
// como en la referencia. Con fecha objetivo, goalMath calcula cuántos
// meses quedan y cuánto guardar cada mes para llegar a tiempo.
// ================================================================

import { useMemo, useState, type FormEvent } from 'react';
import { PiggyBank, Plus, Pencil, Trash2 } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useGoalsEnAmbito } from '@/hooks/useAmbito';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, getTodayISO, parseMoneyInput, roundMoney, MONTH_NAMES, syncToCloud } from '@/lib/utils';
import { goalMath, isGoalLate, goalTotals } from '@/lib/goals';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { ScopeBadge } from '@/components/ui/TransactionBits';
import type { SavingsGoal, BusinessType } from '@/types';

/** 'YYYY-MM' de hoy más `meses` meses, para precargar el mes objetivo del formulario. */
function shiftMonthKey(meses: number, ahora = new Date()): string {
  const d = new Date(ahora.getFullYear(), ahora.getMonth() + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function GoalsPage() {
  const savingsGoals = useGoalsEnAmbito();
  const accounts = useFinanceStore((s) => s.accounts);
  const addSavingsGoal = useFinanceStore((s) => s.addSavingsGoal);
  const updateSavingsGoal = useFinanceStore((s) => s.updateSavingsGoal);
  const deleteSavingsGoal = useFinanceStore((s) => s.deleteSavingsGoal);
  const contributeToGoal = useFinanceStore((s) => s.contributeToGoal);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();

  const totals = useMemo(() => goalTotals(savingsGoals), [savingsGoals]);

  // ── Formulario de meta ──
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [fTag, setFTag] = useState<BusinessType>('personal');
  const [fName, setFName] = useState('');
  const [fTarget, setFTarget] = useState('');
  const [fDate, setFDate] = useState('');
  const [fSaved, setFSaved] = useState('0');

  // ── Registrar aporte ──
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const [cDate, setCDate] = useState(getTodayISO());
  const [cAmount, setCAmount] = useState('');
  const [cAccount, setCAccount] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<SavingsGoal | null>(null);

  function openCreate() {
    setEditing(null);
    setFTag('personal');
    setFName('');
    setFTarget('');
    setFDate(shiftMonthKey(12));
    setFSaved('0');
    setFormOpen(true);
  }
  function openEdit(g: SavingsGoal) {
    setEditing(g);
    setFTag(g.tag);
    setFName(g.concept);
    setFTarget(String(g.target));
    setFDate(g.targetDate ?? '');
    setFSaved(String(g.saved));
    setFormOpen(true);
  }
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const concept = fName.trim();
    if (!concept) { addToast('Ponle un nombre a la meta', 'error'); return; }
    const target = roundMoney(parseMoneyInput(fTarget));
    if (target <= 0) { addToast('El monto objetivo debe ser mayor a 0', 'error'); return; }
    // Safari de escritorio y Firefox no tienen selector para type="month" y
    // dejan escribir texto libre: el formato se comprueba aquí.
    if (fDate && !/^\d{4}-(0[1-9]|1[0-2])$/.test(fDate)) { addToast('El mes objetivo debe tener el formato AAAA-MM', 'error'); return; }
    const data = { concept, tag: fTag, target, targetDate: fDate || null, saved: roundMoney(parseMoneyInput(fSaved)) };
    if (editing) {
      updateSavingsGoal(editing.id, data);
      addToast('Meta actualizada ✅', 'success');
    } else {
      addSavingsGoal(data);
      addToast('Meta creada ✅', 'success');
    }
    syncToCloud(saveData, addToast);
    setFormOpen(false);
  }

  function openContribute(g: SavingsGoal) {
    setContributing(g);
    const m = goalMath(g);
    setCDate(getTodayISO());
    setCAmount(m.monthly ? String(m.monthly) : '');
    setCAccount('');
  }
  function handleContribute(e: FormEvent) {
    e.preventDefault();
    if (!contributing) return;
    const amount = roundMoney(parseMoneyInput(cAmount));
    if (amount <= 0) { addToast('Ingresa un monto mayor a 0', 'error'); return; }
    contributeToGoal(contributing.id, { amount, date: cDate, accountId: cAccount || null });
    addToast(`Aporte de ${formatMoney(amount)} registrado ✅`, 'success');
    syncToCloud(saveData, addToast);
    setContributing(null);
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteSavingsGoal(confirmDelete.id);
    addToast(`Meta "${confirmDelete.concept}" eliminada`, 'info');
    syncToCloud(saveData, addToast);
    setConfirmDelete(null);
  }

  const anyOpen = formOpen || !!contributing || !!confirmDelete;
  useEscapeKey(() => {
    if (confirmDelete) setConfirmDelete(null);
    else if (contributing) setContributing(null);
    else if (formOpen) setFormOpen(false);
  }, anyOpen);
  useScrollLock(anyOpen);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-end">
        <button onClick={openCreate} className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Nueva meta
        </button>
      </div>

      {savingsGoals.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Sin metas todavía"
          description="Un fondo de emergencia, un viaje, capital para el negocio: define el monto y la fecha y la app calcula cuánto guardar cada mes."
          action={{ label: 'Nueva meta', icon: Plus, onClick: openCreate }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
            <Kpi label="Metas activas" value={String(savingsGoals.length)} sub={savingsGoals.length === 1 ? 'una meta' : 'en total'} />
            <Kpi label="Ahorrado" value={formatMoney(totals.saved)} sub={`de ${formatMoney(totals.target)}`} />
            <Kpi label="Falta" value={formatMoney(Math.max(0, roundMoney(totals.target - totals.saved)))} sub="para completar todo" />
            <Kpi label="A guardar por mes" value={formatMoney(totals.monthly)} sub="para llegar a tiempo" />
          </div>

          <div className="saas-card p-4 animate-slide-up">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {savingsGoals.map((g) => {
                const m = goalMath(g);
                const late = isGoalLate(m);
                const barColor = late ? 'bg-expense-500' : 'bg-brand-500 dark:bg-brand-400';
                return (
                  <li key={g.id} className="py-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        {g.concept} <ScopeBadge businessType={g.tag} />
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white flex-shrink-0">
                        {formatMoney(m.saved)} <span className="font-normal text-slate-500 dark:text-slate-400">/ {formatMoney(m.target)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${m.pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                      {m.pct.toFixed(0)}% · faltan {formatMoney(m.missing)}
                      {g.targetDate
                        ? late
                          ? ' · la fecha objetivo ya pasó'
                          : m.months !== null
                            ? ` · ${m.months} mes${m.months === 1 ? '' : 'es'} para ${monthLabel(g.targetDate)}`
                            : ''
                        : ' · sin fecha objetivo'}
                      {m.monthly !== null && m.missing > 0 ? ` · guarda ${formatMoney(m.monthly)} al mes` : ''}
                    </p>
                    <div className="flex gap-x-2 gap-y-1 mt-2 flex-wrap">
                      <button onClick={() => openContribute(g)} className="saas-btn saas-btn-secondary saas-btn-sm text-xs">Registrar aporte</button>
                      <button onClick={() => openEdit(g)} className="saas-btn saas-btn-ghost saas-btn-sm text-xs flex items-center gap-1" aria-label={`Editar ${g.concept}`}><Pencil className="w-3 h-3" /> Editar</button>
                      <button onClick={() => setConfirmDelete(g)} className="saas-btn saas-btn-ghost saas-btn-sm text-xs flex items-center gap-1 text-expense-600 dark:text-expense-400" aria-label={`Eliminar ${g.concept}`}><Trash2 className="w-3 h-3" /> Eliminar</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {/* Modal meta */}
      {formOpen && (
        <ModalSheet id="goal-form-title" titulo={editing ? 'Editar meta' : 'Nueva meta de ahorro'} onClose={() => setFormOpen(false)} trapActivo={!confirmDelete} focoInicial="#g-name">
          <form onSubmit={handleSubmit} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div>
              <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Ámbito</span>
              <div className="flex gap-1" role="group" aria-label="Ámbito">
                {(['personal', 'business'] as BusinessType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setFTag(t)}
                    className={`flex-1 py-1 rounded-md text-2xs font-semibold ${fTag === t ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                    {t === 'personal' ? 'Personal' : 'Negocio'}
                  </button>
                ))}
              </div>
            </div>
            <Campo id="g-name" label="Nombre">
              <input id="g-name" type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Fondo de emergencia" className="saas-input py-1.5 text-sm" required maxLength={80} />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo id="g-target" label="Monto objetivo">
                <input id="g-target" type="text" inputMode="decimal" value={fTarget} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFTarget(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" required />
              </Campo>
              <Campo id="g-date" label="Mes objetivo">
                <input id="g-date" type="month" placeholder="AAAA-MM" pattern="[0-9]{4}-(0[1-9]|1[0-2])" value={fDate} onChange={(e) => setFDate(e.target.value)} className="saas-input py-1.5 text-sm" />
              </Campo>
            </div>
            <Campo id="g-saved" label="Ahorrado hasta hoy">
              <input id="g-saved" type="text" inputMode="decimal" value={fSaved} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFSaved(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" />
            </Campo>
            <p className="text-2xs text-slate-500 dark:text-slate-400">
              Lo que ya tienes guardado dentro de una cuenta déjalo aquí como saldo inicial: no vuelve a contarse en tu patrimonio.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setFormOpen(false)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">{editing ? 'Guardar' : 'Crear'}</button>
            </div>
          </form>
        </ModalSheet>
      )}

      {/* Modal aporte */}
      {contributing && (
        <ModalSheet id="contrib-form-title" titulo="Registrar aporte" onClose={() => setContributing(null)} focoInicial="#gc-amount">
          <form onSubmit={handleContribute} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {contributing.concept} · llevas {formatMoney(contributing.saved)} de {formatMoney(contributing.target)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Campo id="gc-date" label="Fecha">
                <input id="gc-date" type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} className="saas-input py-1.5 text-sm" required />
              </Campo>
              <Campo id="gc-amount" label="Monto">
                <input id="gc-amount" type="text" inputMode="decimal" value={cAmount} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setCAmount(e.target.value); }} className="saas-input py-1.5 text-sm font-bold tabular-nums" required />
              </Campo>
            </div>
            {accounts.length > 0 && (
              <Campo id="gc-acc" label="Cuenta de origen">
                <select id="gc-acc" value={cAccount} onChange={(e) => setCAccount(e.target.value)} className="saas-input py-1.5 text-sm">
                  <option value="">Solo registrar el avance</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Campo>
            )}
            <p className="text-2xs text-slate-500 dark:text-slate-400">
              Si eliges cuenta, el aporte sale de ese saldo y queda como movimiento en Ahorro. Tu patrimonio no cambia: el dinero solo cambia de sitio.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setContributing(null)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">Registrar</button>
            </div>
          </form>
        </ModalSheet>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="¿Eliminar esta meta?"
        message={confirmDelete ? `"${confirmDelete.concept}" desaparecerá, junto con su progreso.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">{label}</label>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="saas-card p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-[clamp(1rem,4.6vw,1.25rem)] md:text-xl font-bold tabular-nums mt-1 whitespace-nowrap text-slate-900 dark:text-white">{value}</p>
      <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}
