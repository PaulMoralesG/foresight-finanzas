// ================================================================
// BudgetsPage — Presupuestos (fase 3.4; referencia: viewPresupuestos() de Balance Dual)
//
// Tres pestañas: "Este mes" (presupuestado vs. real por grupo y las líneas
// de gasto con su barra), "Plan 12 meses" (planilla categoría × mes, base
// cero) y "Reporte anual" (lo realmente movido, categoría × mes). Toda la
// aritmética vive en lib/budget-lines.ts.
// ================================================================

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Target } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useBudgetLinesEnAmbito, useExpensesEnAmbito } from '@/hooks/useAmbito';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, parseMoneyInput, roundMoney, syncToCloud, MONTH_NAMES } from '@/lib/utils';
import { currentMonthKey, shiftMonthKey, monthKeyLabel } from '@/lib/month-keys';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryById, DEFAULT_GROUP } from '@/config/categories';
import { planFor, budgetStatus, actualFor, groupSummary, annualReport, monthsOfYear } from '@/lib/budget-lines';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ScopeBadge } from '@/components/ui/TransactionBits';
import type { BudgetLine, BusinessType, Category } from '@/types';

type Tab = 'mes' | 'plan' | 'anual';
const TAGS: BusinessType[] = ['personal', 'business'];
const tagLabel = (t: BusinessType) => (t === 'personal' ? 'Personal' : 'Negocio');
/** Etiqueta de un monto sin el símbolo, para las celdas apretadas de las tablas. */
const sinSimbolo = (v: number) => formatMoney(v).replace('$', '');

export function BudgetsPage() {
  // Todas las líneas (para detectar duplicados al crear) y las del ámbito (para mostrar).
  const todasLasLineas = useFinanceStore((s) => s.budgetLines);
  const budgetLines = useBudgetLinesEnAmbito();
  const expenses = useExpensesEnAmbito();
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const addBudgetLine = useFinanceStore((s) => s.addBudgetLine);
  const updateBudgetLine = useFinanceStore((s) => s.updateBudgetLine);
  const deleteBudgetLine = useFinanceStore((s) => s.deleteBudgetLine);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();
  const customCats = useMemo(() => [...customExpenseCategories, ...customIncomeCategories], [customExpenseCategories, customIncomeCategories]);

  const [tab, setTab] = useState<Tab>('mes');
  const [mk, setMk] = useState(currentMonthKey());
  const [year, setYear] = useState(new Date().getFullYear());

  // ── Formulario ──
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [fTag, setFTag] = useState<BusinessType>('personal');
  const [fKind, setFKind] = useState<'income' | 'expense'>('expense');
  const [fCat, setFCat] = useState('');
  const [fLimit, setFLimit] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<BudgetLine | null>(null);

  const catsFor = (kind: 'income' | 'expense'): Category[] =>
    kind === 'income' ? [...INCOME_CATEGORIES, ...customIncomeCategories] : [...EXPENSE_CATEGORIES, ...customExpenseCategories];

  function openCreate() {
    setEditing(null); setFTag('personal'); setFKind('expense'); setFCat(EXPENSE_CATEGORIES[0].id); setFLimit('');
    setFormOpen(true);
  }
  function openEdit(l: BudgetLine) {
    setEditing(l); setFTag(l.tag); setFKind(l.kind); setFCat(l.categoryId); setFLimit(String(l.limit));
    setFormOpen(true);
  }
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const limit = roundMoney(parseMoneyInput(fLimit));
    if (limit <= 0) { addToast('Ingresa un límite mayor a 0', 'error'); return; }
    const dup = todasLasLineas.find((b) => b.tag === fTag && b.kind === fKind && b.categoryId === fCat && b.id !== editing?.id);
    if (dup) { addToast('Ya existe un presupuesto para esa categoría y ámbito', 'error'); return; }
    if (editing) {
      updateBudgetLine(editing.id, { tag: fTag, kind: fKind, categoryId: fCat, limit });
      addToast('Presupuesto actualizado ✅', 'success');
    } else {
      addBudgetLine({ tag: fTag, kind: fKind, categoryId: fCat, limit, plan: {} });
      addToast('Presupuesto creado ✅', 'success');
    }
    syncToCloud(saveData, addToast);
    setFormOpen(false);
  }
  function handleDelete() {
    if (!confirmDelete) return;
    deleteBudgetLine(confirmDelete.id);
    addToast('Presupuesto eliminado', 'info');
    syncToCloud(saveData, addToast);
    setConfirmDelete(null);
  }

  useEscapeKey(() => { if (confirmDelete) setConfirmDelete(null); else if (formOpen) setFormOpen(false); }, formOpen || !!confirmDelete);
  useScrollLock(formOpen || !!confirmDelete);

  const grupos = (kind: 'income' | 'expense') => {
    const lista = catsFor(kind);
    const porGrupo = new Map<string, Category[]>();
    for (const c of lista) {
      const g = c.group || DEFAULT_GROUP;
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), c]);
    }
    return [...porGrupo.entries()];
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Subpestañas + alta */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800" role="tablist" aria-label="Vista de presupuestos">
          {([['mes', 'Este mes'], ['plan', 'Plan 12 meses'], ['anual', 'Reporte anual']] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nuevo presupuesto
        </button>
      </div>

      {tab === 'mes' && (
        <EsteMes mk={mk} setMk={setMk} lines={budgetLines} expenses={expenses} customCats={customCats} onEdit={openEdit} onDelete={setConfirmDelete} />
      )}
      {tab === 'plan' && <PlanAnual year={year} setYear={setYear} lines={budgetLines} customCats={customCats} />}
      {tab === 'anual' && <ReporteAnual year={year} setYear={setYear} expenses={expenses} customCats={customCats} />}

      {formOpen && (
        <ModalSheet id="budget-form-title" titulo={editing ? 'Editar presupuesto' : 'Nuevo presupuesto'} onClose={() => setFormOpen(false)} trapActivo={!confirmDelete} focoInicial="#b-limit">
          <form onSubmit={handleSubmit} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Ámbito</span>
                <div className="flex gap-1" role="group" aria-label="Ámbito">
                  {TAGS.map((t) => (
                    <button key={t} type="button" onClick={() => setFTag(t)}
                      className={`flex-1 py-1 rounded-md text-2xs font-semibold ${fTag === t ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                      {tagLabel(t)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Tipo</span>
                <div className="flex gap-1" role="group" aria-label="Tipo de presupuesto">
                  {(['expense', 'income'] as const).map((k) => (
                    <button key={k} type="button" onClick={() => { setFKind(k); setFCat(catsFor(k)[0]?.id ?? ''); }}
                      className={`flex-1 py-1 rounded-md text-2xs font-semibold ${fKind === k ? (k === 'expense' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                      {k === 'expense' ? 'Gasto' : 'Ingreso'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="b-cat" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Categoría</label>
              <select id="b-cat" value={fCat} onChange={(e) => setFCat(e.target.value)} className="saas-input py-1.5 text-sm">
                {grupos(fKind).map(([g, cats]) => (
                  <optgroup key={g} label={g}>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="b-limit" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Límite mensual</label>
              <input id="b-limit" type="text" inputMode="decimal" value={fLimit} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFLimit(e.target.value); }} className="saas-input py-1.5 text-sm font-bold tabular-nums" required />
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">Es la base de cada mes; en "Plan 12 meses" puedes ajustar meses concretos.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setFormOpen(false)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">{editing ? 'Guardar' : 'Crear'}</button>
            </div>
          </form>
        </ModalSheet>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="¿Eliminar este presupuesto?"
        message={confirmDelete ? `Se borra el límite y el plan de "${getCategoryById(confirmDelete.categoryId, customCats).label}".` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/* ─── Este mes ─── */
function EsteMes({ mk, setMk, lines, expenses, customCats, onEdit, onDelete }: {
  mk: string; setMk: (v: string) => void; lines: BudgetLine[]; expenses: ReturnType<typeof useFinanceStore.getState>['expenses'];
  customCats: Category[]; onEdit: (l: BudgetLine) => void; onDelete: (l: BudgetLine) => void;
}) {
  const meses = Array.from({ length: 9 }, (_, i) => shiftMonthKey(currentMonthKey(), i - 6));
  const resumen = useMemo(() => groupSummary(lines, expenses, mk, customCats), [lines, expenses, mk, customCats]);
  const esActual = mk === currentMonthKey();

  return (
    <>
      <div className="flex items-center gap-2">
        <label htmlFor="sum-month" className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mes</label>
        <select id="sum-month" value={mk} onChange={(e) => setMk(e.target.value)} className="saas-input-sm text-2xs">
          {meses.map((m) => <option key={m} value={m}>{monthKeyLabel(m)}</option>)}
        </select>
      </div>

      {/* Presupuestado vs. real por grupo */}
      <div className="saas-card p-4 animate-slide-up">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Presupuestado vs. real</h2>
        <p className="text-2xs text-slate-500 dark:text-slate-400 mb-2">{monthKeyLabel(mk)} · por grupo</p>
        {resumen.rows.length === 0 ? (
          <EmptyState variant="compact" title="Sin presupuestos ni movimientos en este mes." />
        ) : (
          <div className="saas-table-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-1 pr-2 font-semibold saas-col-fija">Grupo</th>
                  <th className="py-1 font-semibold text-right">Presupuestado</th>
                  <th className="py-1 font-semibold text-right">Real</th>
                  <th className="py-1 font-semibold text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {(['income', 'expense'] as const).map((kind) => {
                  const filas = resumen.rows.filter((r) => r.kind === kind);
                  if (filas.length === 0) return null;
                  return (
                    <SeccionTabla key={kind} titulo={kind === 'income' ? 'Ingresos' : 'Gastos'} colSpan={4}>
                      {filas.map((r) => (
                        <tr key={kind + r.group} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-300 saas-col-fija">{r.group}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.planned ? formatMoney(r.planned) : '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatMoney(r.actual)}</td>
                          <td className={`py-1.5 text-right tabular-nums font-semibold ${r.planned === 0 ? '' : r.diff >= 0 ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
                            {r.planned ? formatMoney(r.diff) : '—'}
                          </td>
                        </tr>
                      ))}
                    </SeccionTabla>
                  );
                })}
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-semibold">
                  <td className="py-1.5 pr-2 saas-col-fija">Resultado del mes</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(resumen.planResult)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(resumen.realResult)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${resumen.realResult >= resumen.planResult ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
                    {formatMoney(roundMoney(resumen.realResult - resumen.planResult))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {resumen.plannedIncome > 0 && Math.abs(resumen.planResult) > 0.005 && (
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-3">
            {resumen.planResult > 0
              ? `Te quedan ${formatMoney(resumen.planResult)} planificados sin destino. En base cero eso va a ahorro, inversión o deuda.`
              : `Tu plan gasta ${formatMoney(Math.abs(resumen.planResult))} más de lo que planificaste ingresar este mes.`}
          </p>
        )}
      </div>

      {/* Líneas de gasto por ámbito */}
      <div className="saas-card p-4 animate-slide-up space-y-4">
        {TAGS.map((tag) => {
          const lista = lines.filter((l) => l.tag === tag && l.kind === 'expense');
          return (
            <div key={tag}>
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">{tagLabel(tag)}</h3>
              {lista.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">Sin presupuestos en {tagLabel(tag).toLowerCase()} todavía.</p>
              ) : (
                <div className="space-y-3">
                  {lista.map((l) => {
                    const limit = planFor(l, mk);
                    const spent = actualFor(expenses, l, mk);
                    const st = budgetStatus(spent, limit);
                    const cat = getCategoryById(l.categoryId, customCats);
                    const color = st.status === 'good' ? 'bg-income-500' : st.status === 'warn' ? 'bg-amber-500' : 'bg-expense-500';
                    const pill = st.status === 'good' ? 'bg-income-100 dark:bg-income-950 text-income-700 dark:text-income-400' : st.status === 'warn' ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'bg-expense-100 dark:bg-expense-950 text-expense-700 dark:text-expense-400';
                    return (
                      <div key={l.id}>
                        <div className="flex items-center justify-between gap-2 text-xs mb-1">
                          <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                            <span>{cat.icon}</span>{cat.label} <ScopeBadge businessType={l.tag} />
                          </span>
                          <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${pill}`}>{st.label}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, st.pct)}%` }} />
                        </div>
                        {/* Cifra a 12px (es contenido, no rótulo) y acciones en su propia
                            fila en móvil: a 360px se partían en dos líneas junto a la cifra. */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mt-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatMoney(spent)} de {formatMoney(limit)}{esActual ? ' este mes' : ` en ${monthKeyLabel(mk)}`}
                          </span>
                          <span className="flex gap-3">
                            <button onClick={() => onEdit(l)} className="saas-btn saas-btn-ghost saas-btn-sm text-xs flex items-center gap-1 whitespace-nowrap" aria-label={`Editar límite de ${cat.label}`}><Pencil className="w-3 h-3" /> Editar límite</button>
                            <button onClick={() => onDelete(l)} className="saas-btn saas-btn-ghost saas-btn-sm text-xs flex items-center gap-1 whitespace-nowrap text-expense-600 dark:text-expense-400" aria-label={`Eliminar presupuesto de ${cat.label}`}><Trash2 className="w-3 h-3" /> Eliminar</button>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function SeccionTabla({ titulo, colSpan, children }: { titulo: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={colSpan} className="pt-2 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</td>
      </tr>
      {children}
    </>
  );
}

function BarraAnio({ year, setYear, hint }: { year: number; setYear: (y: number) => void; hint?: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={() => setYear(year - 1)} className="saas-btn-icon" aria-label="Año anterior"><ChevronLeft className="w-4 h-4" /></button>
      <strong className="tabular-nums text-sm">{year}</strong>
      <button onClick={() => setYear(year + 1)} className="saas-btn-icon" aria-label="Año siguiente"><ChevronRight className="w-4 h-4" /></button>
      {hint && <span className="text-2xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </div>
  );
}

/* ─── Plan 12 meses: planilla con la regla de base cero ─── */
function PlanAnual({ year, setYear, lines, customCats }: { year: number; setYear: (y: number) => void; lines: BudgetLine[]; customCats: Category[] }) {
  const setBudgetPlan = useFinanceStore((s) => s.setBudgetPlan);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();
  const months = monthsOfYear(year);

  const totals = useMemo(() => {
    const t = { income: {} as Record<string, number>, expense: {} as Record<string, number> };
    for (const m of months) { t.income[m] = 0; t.expense[m] = 0; }
    for (const l of lines) for (const m of months) t[l.kind][m] += planFor(l, m);
    return t;
  }, [lines, months]);

  const secciones = TAGS.flatMap((tag) =>
    (['income', 'expense'] as const).map((kind) => ({ tag, kind, list: lines.filter((l) => l.tag === tag && l.kind === kind) })),
  ).filter((s) => s.list.length > 0);

  function commit(l: BudgetLine, m: string, raw: string) {
    const v = roundMoney(parseMoneyInput(raw));
    if (v === planFor(l, m)) return;
    setBudgetPlan(l.id, m, v);
    syncToCloud(saveData, addToast);
  }

  const anyOff = months.some((m) => Math.abs(totals.income[m] - totals.expense[m]) > 0.005);
  const yearDiff = roundMoney(months.reduce((s, m) => s + totals.income[m] - totals.expense[m], 0));

  return (
    <>
      <BarraAnio year={year} setYear={setYear} hint="Escribe el monto planificado de cada mes; se guarda al salir de la casilla." />
      <div className="saas-card p-3 animate-slide-up">
        {secciones.length === 0 ? (
          <EmptyState variant="compact" icon={Target} title="Crea presupuestos (de ingreso y de gasto) para planificar el año." />
        ) : (
          <>
            <div className="saas-table-scroll">
              <table className="text-xs min-w-[900px]">
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-2 font-semibold min-w-[150px] saas-col-fija">Categoría</th>
                    {months.map((m) => <th key={m} className="py-1 px-1 font-semibold text-right">{MONTH_NAMES[parseInt(m.split('-')[1], 10) - 1].slice(0, 3)}</th>)}
                    <th className="py-1 pl-2 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {secciones.map(({ tag, kind, list }) => (
                    <SeccionTabla key={tag + kind} titulo={`${tagLabel(tag)} · ${kind === 'income' ? 'Ingresos planificados' : 'Gastos planificados'}`} colSpan={months.length + 2}>
                      {list.map((l) => {
                        const cat = getCategoryById(l.categoryId, customCats);
                        const rowTotal = roundMoney(months.reduce((s, m) => s + planFor(l, m), 0));
                        return (
                          <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="py-1 pr-2 whitespace-nowrap text-slate-700 dark:text-slate-300 saas-col-fija">{cat.icon} {cat.label}</td>
                            {months.map((m) => (
                              <td key={m} className="py-0.5 px-0.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  defaultValue={planFor(l, m) || ''}
                                  key={`${l.id}-${m}-${planFor(l, m)}`}
                                  onBlur={(e) => commit(l, m, e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  aria-label={`${cat.label} ${monthKeyLabel(m)}`}
                                  className="saas-input-sm !w-[76px] text-right tabular-nums text-xs py-1 px-1.5"
                                />
                              </td>
                            ))}
                            <td className="py-1 pl-2 text-right tabular-nums font-semibold">{sinSimbolo(rowTotal)}</td>
                          </tr>
                        );
                      })}
                    </SeccionTabla>
                  ))}
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-semibold">
                    <td className="py-1.5 pr-2 saas-col-fija">Resultado mensual</td>
                    {months.map((m) => {
                      const diff = roundMoney(totals.income[m] - totals.expense[m]);
                      const cls = Math.abs(diff) < 0.005 ? '' : diff > 0 ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400';
                      return <td key={m} className={`py-1.5 px-1 text-right tabular-nums ${cls}`}>{diff === 0 ? '0' : sinSimbolo(diff)}</td>;
                    })}
                    <td className="py-1.5 pl-2 text-right tabular-nums">{sinSimbolo(yearDiff)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-3">
              {anyOff
                ? 'Presupuesto base cero: cada mes debería quedar en 0. Lo que sobra tiene destino — mándalo a ahorro, a inversión o a pagar deuda; lo que falta hay que recortarlo.'
                : 'Cada mes cuadra en cero: todo tu ingreso planificado tiene un destino asignado.'}
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ─── Reporte anual: lo realmente movido, categoría × 12 meses ─── */
function ReporteAnual({ year, setYear, expenses, customCats }: { year: number; setYear: (y: number) => void; expenses: ReturnType<typeof useFinanceStore.getState>['expenses']; customCats: Category[] }) {
  const months = monthsOfYear(year);
  const rows = useMemo(() => annualReport(expenses, year, customCats), [expenses, year, customCats]);

  const secciones = TAGS.flatMap((tag) =>
    (['income', 'expense'] as const).map((kind) => ({
      tag, kind,
      list: rows.filter((r) => r.tag === tag && r.kind === kind).sort((a, b) => getCategoryById(a.categoryId, customCats).label.localeCompare(getCategoryById(b.categoryId, customCats).label)),
    })),
  ).filter((s) => s.list.length > 0);

  return (
    <>
      <BarraAnio year={year} setYear={setYear} />
      <div className="saas-card p-3 animate-slide-up">
        {secciones.length === 0 ? (
          <EmptyState variant="compact" title={`Sin movimientos registrados en ${year}.`} />
        ) : (
          <>
            <div className="saas-table-scroll">
              <table className="text-xs min-w-[900px]">
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-2 font-semibold min-w-[150px] saas-col-fija">Categoría</th>
                    {months.map((m) => <th key={m} className="py-1 px-1 font-semibold text-right">{MONTH_NAMES[parseInt(m.split('-')[1], 10) - 1].slice(0, 3)}</th>)}
                    <th className="py-1 pl-2 font-semibold text-right">Total</th>
                    <th className="py-1 pl-2 font-semibold text-right">Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {secciones.map(({ tag, kind, list }) => {
                    const groupTotals: Record<string, number> = {};
                    for (const m of months) groupTotals[m] = 0;
                    for (const r of list) for (const m of months) groupTotals[m] += r.byMonth[m] ?? 0;
                    const yearTotal = roundMoney(Object.values(groupTotals).reduce((s, v) => s + v, 0));
                    return (
                      <SeccionTabla key={tag + kind} titulo={`${tagLabel(tag)} · ${kind === 'income' ? 'Ingresos' : 'Gastos'}`} colSpan={months.length + 3}>
                        {list.map((r) => {
                          const cat = getCategoryById(r.categoryId, customCats);
                          return (
                            <tr key={r.categoryId} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="py-1 pr-2 whitespace-nowrap text-slate-700 dark:text-slate-300 saas-col-fija">{cat.icon} {cat.label}</td>
                              {months.map((m) => {
                                const v = r.byMonth[m] ?? 0;
                                return <td key={m} className={`py-1 px-1 text-right tabular-nums ${v ? '' : 'text-slate-400 dark:text-slate-600'}`}>{v ? sinSimbolo(v) : '—'}</td>;
                              })}
                              <td className="py-1 pl-2 text-right tabular-nums font-semibold">{sinSimbolo(r.total)}</td>
                              <td className="py-1 pl-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{sinSimbolo(r.average)}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-slate-200 dark:border-slate-700 font-semibold">
                          <td className="py-1.5 pr-2 saas-col-fija">Total {kind === 'income' ? 'ingresos' : 'gastos'}</td>
                          {months.map((m) => <td key={m} className="py-1.5 px-1 text-right tabular-nums">{groupTotals[m] ? sinSimbolo(roundMoney(groupTotals[m])) : '—'}</td>)}
                          <td className="py-1.5 pl-2 text-right tabular-nums">{sinSimbolo(yearTotal)}</td>
                          <td className="py-1.5 pl-2 text-right tabular-nums">{sinSimbolo(roundMoney(yearTotal / 12))}</td>
                        </tr>
                      </SeccionTabla>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-2xs text-slate-500 dark:text-slate-400 mt-3">
              El promedio considera solo los meses con movimiento en esa categoría; el de los totales usa los 12 meses.
            </p>
          </>
        )}
      </div>
    </>
  );
}
