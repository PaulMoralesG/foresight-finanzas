// ================================================================
// DebtsPage — Deudas (fase 3.2; referencia: viewDeudas() de Balance Dual)
//
// Método (bola de nieve / avalancha) y aporte extra arriba; cuatro KPIs;
// aviso si el plan no cierra; curva "Rumbo a cero" y comparación de
// métodos; orden de pago con registrar pago / editar / eliminar. Toda la
// aritmética vive en lib/debts.ts.
// ================================================================

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, CreditCard, AlertTriangle } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, getTodayISO, parseMoneyInput, roundMoney, syncToCloud } from '@/lib/utils';
import { projectDebts, totalDebt, monthlyDebtPayment, payoffDate, DEBT_KINDS, type DebtPlan } from '@/lib/debts';
import { escalaBonita, formatoTickDinero, trazarLinea } from '@/lib/chart-geometry';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ScopeBadge } from '@/components/ui/TransactionBits';
import type { Debt, DebtKind, DebtMethod, BusinessType } from '@/types';

export function DebtsPage() {
  const debts = useFinanceStore((s) => s.debts);
  const accounts = useFinanceStore((s) => s.accounts);
  const settings = useFinanceStore((s) => s.settings);
  const setSettings = useFinanceStore((s) => s.setSettings);
  const addDebt = useFinanceStore((s) => s.addDebt);
  const updateDebt = useFinanceStore((s) => s.updateDebt);
  const deleteDebt = useFinanceStore((s) => s.deleteDebt);
  const registerDebtPayment = useFinanceStore((s) => s.registerDebtPayment);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();

  const method = settings.debtMethod;
  const extra = settings.extraPayment;
  const plan = useMemo(() => projectDebts(debts, extra, method), [debts, extra, method]);
  const alt = useMemo(
    () => projectDebts(debts, extra, method === 'snowball' ? 'avalanche' : 'snowball'),
    [debts, extra, method],
  );

  // ── Formulario de deuda ──
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [fName, setFName] = useState('');
  const [fTag, setFTag] = useState<BusinessType>('personal');
  const [fKind, setFKind] = useState<DebtKind>('Tarjeta de crédito');
  const [fBalance, setFBalance] = useState('');
  const [fRate, setFRate] = useState('');
  const [fMin, setFMin] = useState('');
  const [fDay, setFDay] = useState('');

  // ── Registrar pago ──
  const [paying, setPaying] = useState<Debt | null>(null);
  const [pAmount, setPAmount] = useState('');
  const [pDate, setPDate] = useState(getTodayISO());
  const [pAccount, setPAccount] = useState('');
  const [pAsExpense, setPAsExpense] = useState(true);

  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);
  const [extraInput, setExtraInput] = useState(String(extra));

  function openCreate() {
    setEditing(null);
    setFName(''); setFTag('personal'); setFKind('Tarjeta de crédito');
    setFBalance(''); setFRate(''); setFMin(''); setFDay('');
    setFormOpen(true);
  }
  function openEdit(d: Debt) {
    setEditing(d);
    setFName(d.name); setFTag(d.tag); setFKind(d.kind);
    setFBalance(String(d.balance)); setFRate(String(d.annualRate)); setFMin(String(d.minPayment));
    setFDay(d.payDay ? String(d.payDay) : '');
    setFormOpen(true);
  }
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = fName.trim();
    if (!name) { addToast('Ponle un nombre a la deuda', 'error'); return; }
    const data = {
      name,
      tag: fTag,
      kind: fKind,
      balance: roundMoney(parseMoneyInput(fBalance)),
      annualRate: roundMoney(parseMoneyInput(fRate)),
      minPayment: roundMoney(parseMoneyInput(fMin)),
      payDay: fDay ? Math.min(31, Math.max(1, parseInt(fDay, 10) || 0)) || null : null,
    };
    if (editing) {
      updateDebt(editing.id, data);
      addToast('Deuda actualizada ✅', 'success');
    } else {
      addDebt(data);
      addToast('Deuda creada ✅', 'success');
    }
    syncToCloud(saveData, addToast);
    setFormOpen(false);
  }

  function openPay(d: Debt) {
    setPaying(d);
    setPAmount(d.minPayment ? String(d.minPayment) : '');
    setPDate(getTodayISO());
    setPAccount('');
    setPAsExpense(true);
  }
  function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    const amount = roundMoney(parseMoneyInput(pAmount));
    if (amount <= 0) { addToast('Ingresa un monto mayor a 0', 'error'); return; }
    registerDebtPayment(paying.id, { amount, date: pDate, accountId: pAccount || null, asExpense: pAsExpense });
    addToast(`Pago de ${formatMoney(amount)} registrado ✅`, 'success');
    syncToCloud(saveData, addToast);
    setPaying(null);
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteDebt(confirmDelete.id);
    addToast(`Deuda "${confirmDelete.name}" eliminada`, 'info');
    syncToCloud(saveData, addToast);
    setConfirmDelete(null);
  }

  function commitExtra() {
    const v = roundMoney(parseMoneyInput(extraInput));
    if (v !== extra) {
      setSettings({ extraPayment: v });
      syncToCloud(saveData, addToast);
    }
    setExtraInput(String(v));
  }

  const anyOpen = formOpen || !!paying || !!confirmDelete;
  useEscapeKey(() => {
    if (confirmDelete) setConfirmDelete(null);
    else if (paying) setPaying(null);
    else if (formOpen) setFormOpen(false);
  }, anyOpen);
  useScrollLock(anyOpen);

  const ordered = plan.order.map((id) => debts.find((d) => d.id === id)).filter((d): d is Debt => !!d);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Estrategia + alta */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <div>
            <label htmlFor="d-method" className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5 block">Método</label>
            <select
              id="d-method"
              value={method}
              onChange={(e) => { setSettings({ debtMethod: e.target.value as DebtMethod }); syncToCloud(saveData, addToast); }}
              className="saas-input-sm text-2xs"
            >
              <option value="snowball">Bola de nieve (saldo menor primero)</option>
              <option value="avalanche">Avalancha (interés más alto primero)</option>
            </select>
          </div>
          <div>
            <label htmlFor="d-extra" className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5 block">Aporte extra mensual</label>
            <input
              id="d-extra"
              type="text"
              inputMode="decimal"
              value={extraInput}
              onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setExtraInput(e.target.value); }}
              onBlur={commitExtra}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitExtra(); } }}
              className="saas-input-sm text-2xs w-28 tabular-nums"
            />
          </div>
        </div>
        <button onClick={openCreate} className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Agregar deuda
        </button>
      </div>

      {debts.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Sin deudas registradas"
          description="Agrega una para ver tu fecha libre de deudas."
          action={{ label: 'Agregar deuda', icon: Plus, onClick: openCreate }}
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-slide-up">
            <Kpi label="Deuda total" value={formatMoney(totalDebt(debts))} sub={`${debts.length} ${debts.length === 1 ? 'deuda' : 'deudas'}`} />
            <Kpi label="Pago mensual" value={formatMoney(monthlyDebtPayment(debts, extra))} sub={`mínimos + ${formatMoney(extra)} extra`} />
            <Kpi
              label="Libre de deudas"
              value={plan.ok ? payoffDate(plan.months) : '—'}
              sub={plan.ok ? `en ${plan.months} meses` : 'el pago no alcanza'}
              tone={plan.ok ? 'good' : 'crit'}
            />
            <Kpi label="Intereses proyectados" value={plan.ok ? formatMoney(plan.totalInterest) : '—'} sub="hasta saldar todo" />
          </div>

          {!plan.ok && (
            <div role="alert" className="saas-card p-3 border-expense-500/50 flex items-start gap-2 text-xs text-expense-700 dark:text-expense-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Con los pagos actuales los intereses crecen más rápido que los abonos: sube el pago mínimo de alguna deuda o el aporte extra para que el plan cierre.</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
            <DebtCurveCard plan={plan} method={method} />
            <MethodCompareCard plan={plan} alt={alt} method={method} />
          </div>

          {/* Orden de pago */}
          <div className="saas-card p-4 animate-slide-up">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Orden de pago</h2>
            <p className="text-2xs text-slate-500 dark:text-slate-400 mb-2">
              {method === 'snowball' ? 'De menor a mayor saldo — el método de la plantilla.' : 'Del interés más alto al más bajo — paga menos intereses.'}
            </p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {ordered.map((d, i) => {
                const months = plan.payoff[d.id];
                return (
                  <li key={d.id} className="py-2.5 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold tabular-nums flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        {d.name} <ScopeBadge businessType={d.tag} />
                      </p>
                      <p className="text-2xs text-slate-500 dark:text-slate-400">
                        {d.kind} · {d.annualRate}% anual · mínimo {formatMoney(d.minPayment)}{d.payDay ? ` · paga el ${d.payDay}` : ''}
                      </p>
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        <button onClick={() => openPay(d)} className="saas-btn saas-btn-secondary saas-btn-sm text-2xs">Registrar pago</button>
                        <button onClick={() => openEdit(d)} className="saas-btn saas-btn-ghost saas-btn-sm text-2xs flex items-center gap-1" aria-label={`Editar ${d.name}`}><Pencil className="w-3 h-3" /> Editar</button>
                        <button onClick={() => setConfirmDelete(d)} className="saas-btn saas-btn-ghost saas-btn-sm text-2xs flex items-center gap-1 text-expense-600 dark:text-expense-400" aria-label={`Eliminar ${d.name}`}><Trash2 className="w-3 h-3" /> Eliminar</button>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(d.balance)}</p>
                      <p className="text-2xs text-slate-500 dark:text-slate-400">{months ? `libre en ${payoffDate(months)}` : 'sin proyección'}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {/* Modal deuda */}
      {formOpen && (
        <ModalSheet id="debt-form-title" titulo={editing ? 'Editar deuda' : 'Nueva deuda'} onClose={() => setFormOpen(false)} trapActivo={!confirmDelete} focoInicial="#d-name">
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
            <Campo id="d-name" label="Nombre">
              <input id="d-name" type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Tarjeta Banco Pichincha" className="saas-input py-1.5 text-sm" required maxLength={80} />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo id="d-kind" label="Tipo">
                <select id="d-kind" value={fKind} onChange={(e) => setFKind(e.target.value as DebtKind)} className="saas-input py-1.5 text-sm">
                  {DEBT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Campo>
              <Campo id="d-balance" label="Saldo actual">
                <input id="d-balance" type="text" inputMode="decimal" value={fBalance} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFBalance(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" required />
              </Campo>
              <Campo id="d-rate" label="Interés anual (%)">
                <input id="d-rate" type="text" inputMode="decimal" value={fRate} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFRate(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" required />
              </Campo>
              <Campo id="d-min" label="Pago mínimo mensual">
                <input id="d-min" type="text" inputMode="decimal" value={fMin} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFMin(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" required />
              </Campo>
            </div>
            <Campo id="d-day" label="Día de pago del mes (opcional)">
              <input id="d-day" type="number" min={1} max={31} value={fDay} onChange={(e) => setFDay(e.target.value)} className="saas-input py-1.5 text-sm tabular-nums" />
            </Campo>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setFormOpen(false)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">{editing ? 'Guardar' : 'Crear'}</button>
            </div>
          </form>
        </ModalSheet>
      )}

      {/* Modal pago */}
      {paying && (
        <ModalSheet id="pay-form-title" titulo="Registrar pago" onClose={() => setPaying(null)} focoInicial="#p-amount">
          <form onSubmit={handlePay} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <p className="text-xs text-slate-500 dark:text-slate-400">{paying.name} · saldo actual {formatMoney(paying.balance)}</p>
            <div className="grid grid-cols-2 gap-2">
              <Campo id="p-date" label="Fecha">
                <input id="p-date" type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className="saas-input py-1.5 text-sm" required />
              </Campo>
              <Campo id="p-amount" label="Monto">
                <input id="p-amount" type="text" inputMode="decimal" value={pAmount} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setPAmount(e.target.value); }} className="saas-input py-1.5 text-sm font-bold tabular-nums" required />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={pAsExpense} onChange={(e) => setPAsExpense(e.target.checked)} className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600" />
              Registrarlo también como gasto del mes
            </label>
            {pAsExpense && accounts.length > 0 && (
              <Campo id="p-acc" label="Cuenta de origen">
                <select id="p-acc" value={pAccount} onChange={(e) => setPAccount(e.target.value)} className="saas-input py-1.5 text-sm">
                  <option value="">No descontar de ninguna cuenta</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Campo>
            )}
            <p className="text-2xs text-slate-500 dark:text-slate-400">
              Baja el saldo de la deuda y, si lo registras como gasto, queda además como movimiento del mes{accounts.length > 0 ? ' (descontado de la cuenta que elijas)' : ''}.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setPaying(null)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">Registrar</button>
            </div>
          </form>
        </ModalSheet>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="¿Eliminar esta deuda?"
        message={confirmDelete ? `"${confirmDelete.name}" desaparecerá del plan de pago.` : ''}
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

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'crit' }) {
  const color = tone === 'good' ? 'text-income-600 dark:text-income-400' : tone === 'crit' ? 'text-expense-600 dark:text-expense-400' : 'text-slate-900 dark:text-white';
  return (
    <div className="saas-card p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-1 truncate ${color}`}>{value}</p>
      <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

/* ─── "Rumbo a cero": saldo total proyectado mes a mes (SVG, como la referencia) ─── */
function DebtCurveCard({ plan, method }: { plan: DebtPlan; method: DebtMethod }) {
  const isDark = useUiStore((s) => s.isDark);
  const data = plan.schedule.slice(0, Math.min(plan.schedule.length, 121));
  const W = 520, H = 190, padL = 52, padR = 12, padB = 26, padT = 10;
  const innerH = H - padT - padB;
  const grid = isDark ? '#4a4944' : '#e6e4dd';
  const tick = isDark ? '#a3a099' : '#5f5e58';
  const linea = '#1baf7a';

  let contenido: React.ReactNode;
  if (data.length < 2) {
    contenido = <EmptyState variant="compact" title="Sin proyección disponible." />;
  } else {
    const escala = escalaBonita(0, Math.max(...data.map((d) => d.total)), 4);
    const stepX = (W - padL - padR) / (data.length - 1);
    const pts = data.map((d, i) => [padL + i * stepX, padT + innerH * (1 - d.total / (escala.max || 1))] as const);
    const line = trazarLinea(pts);
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${padT + innerH} L${pts[0][0].toFixed(1)} ${padT + innerH} Z`;
    contenido = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={200} role="img" aria-label="Saldo de deuda proyectado hasta cero">
        {escala.ticks.map((t) => {
          const y = padT + innerH * (1 - t / (escala.max || 1));
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={grid} strokeWidth={1} strokeDasharray="3 3" />
              <text x={padL - 8} y={y + 3.5} fontSize={10} fill={tick} textAnchor="end" className="font-mono">{formatoTickDinero(t)}</text>
            </g>
          );
        })}
        <path d={area} fill={linea} opacity={0.13} />
        <path d={line} fill="none" stroke={linea} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4} fill={linea} />
        <text x={padL} y={H - 8} fontSize={10} fill={tick}>hoy</text>
        <text x={W - padR} y={H - 8} fontSize={10} fill={tick} textAnchor="end">{plan.ok ? payoffDate(plan.months) : 'no cierra'}</text>
      </svg>
    );
  }

  return (
    <div className="saas-card p-4 animate-slide-up">
      <h2 className="text-sm font-bold text-slate-900 dark:text-white">Rumbo a cero</h2>
      <p className="text-2xs text-slate-500 dark:text-slate-400 mb-2">Saldo total proyectado mes a mes</p>
      {contenido}
      <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-0 w-4 border-t-[3px]" style={{ borderColor: linea }} />
        Saldo total ({method === 'snowball' ? 'bola de nieve' : 'avalancha'})
      </p>
    </div>
  );
}

function MethodCompareCard({ plan, alt, method }: { plan: DebtPlan; alt: DebtPlan; method: DebtMethod }) {
  const snow = method === 'snowball' ? plan : alt;
  const aval = method === 'snowball' ? alt : plan;

  const bloque = (title: string, p: DebtPlan, active: boolean) => (
    <div className={`rounded-xl p-3 ${active ? 'bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-200/60 dark:ring-brand-800/40' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
      <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
        {title}
        {active && <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-income-100 dark:bg-income-950 text-income-700 dark:text-income-400">en uso</span>}
      </p>
      {!p.ok ? (
        <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">El plan no cierra con estos pagos.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <div>
            <p className="text-2xs text-slate-500 dark:text-slate-400">Libre en</p>
            <p className="text-sm font-bold tabular-nums">{p.months} meses</p>
          </div>
          <div>
            <p className="text-2xs text-slate-500 dark:text-slate-400">Intereses</p>
            <p className="text-sm font-bold tabular-nums">{formatMoney(p.totalInterest)}</p>
          </div>
        </div>
      )}
    </div>
  );

  let msg: string | null = null;
  if (snow.ok && aval.ok) {
    const diff = roundMoney(snow.totalInterest - aval.totalInterest);
    if (Math.abs(diff) < 1) msg = 'Con tus deudas actuales los dos métodos cuestan casi lo mismo: quédate con el que te motive más.';
    else if (diff > 0) msg = `La avalancha te ahorra ${formatMoney(diff)} en intereses; la bola de nieve te da victorias más rápido.`;
    else msg = `La bola de nieve sale ${formatMoney(Math.abs(diff))} más barata en tu caso, además de liquidar deudas antes.`;
  }

  return (
    <div className="saas-card p-4 animate-slide-up space-y-2">
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Bola de nieve vs. avalancha</h2>
        <p className="text-2xs text-slate-500 dark:text-slate-400">Con el mismo aporte extra</p>
      </div>
      {bloque('Bola de nieve', snow, method === 'snowball')}
      {bloque('Avalancha', aval, method === 'avalanche')}
      {msg && <p className="text-xs text-slate-700 dark:text-slate-300">{msg}</p>}
    </div>
  );
}
