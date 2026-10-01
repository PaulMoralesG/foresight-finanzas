// ================================================================
// DebtsPage — Deudas (fase 3.2; referencia: viewDeudas() de Balance Dual)
//
// Método (bola de nieve / avalancha) y aporte extra arriba; cuatro KPIs;
// aviso si el plan no cierra; curva "Rumbo a cero" y comparación de
// métodos; orden de pago con registrar pago / editar / eliminar. Toda la
// aritmética vive en lib/debts.ts.
// ================================================================

import { useMemo, useState, type FormEvent } from 'react';
import { useAnchoContenedor } from '@/hooks/useAnchoContenedor';
import { Plus, Pencil, Trash2, CreditCard, AlertTriangle, FileSpreadsheet, Printer } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useDebtsEnAmbito } from '@/hooks/useAmbito';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, getTodayISO, parseMoneyInput, roundMoney, syncToCloud, downloadBlob, formatFechaCorta, formatFechaConAnio } from '@/lib/utils';
import { projectDebts, totalDebt, monthlyDebtPayment, payoffDate, debtsToCsv, tieneMinimoFijo, DEBT_KINDS, type DebtPlan } from '@/lib/debts';
import { imprimirDeudas } from '@/lib/print-debts';
import { escalaBonita, formatoTickDinero, trazarLinea } from '@/lib/chart-geometry';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { coloresGrafica } from '@/lib/chart-colors';
import { CardHeader } from '@/components/ui/CardHeader';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ScopeBadge } from '@/components/ui/TransactionBits';
import { AmbitoField } from '@/components/ui/AmbitoField';
import { Kpi } from '@/components/ui/Kpi';
import { Campo } from '@/components/ui/Campo';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { historialDeuda, cuentaSugeridaParaPago, gastosSinVincular, etiquetaPago, type DescuentosDePago } from '@/lib/debt-payments';
import { interesEstimadoMensual } from '@/lib/interes';
import { esTarjeta, estadoTarjeta } from '@/lib/credit-card';
import { accountName } from '@/lib/accounts';
import type { Debt, DebtKind, DebtMethod, BusinessType, Transaction } from '@/types';

export function DebtsPage() {
  const debts = useDebtsEnAmbito();
  const accounts = useFinanceStore((s) => s.accounts);
  const settings = useFinanceStore((s) => s.settings);
  const setSettings = useFinanceStore((s) => s.setSettings);
  const addDebt = useFinanceStore((s) => s.addDebt);
  const updateDebt = useFinanceStore((s) => s.updateDebt);
  const deleteDebt = useFinanceStore((s) => s.deleteDebt);
  const registerDebtPayment = useFinanceStore((s) => s.registerDebtPayment);
  const vincularPagoHistorico = useFinanceStore((s) => s.vincularPagoHistorico);
  const desvincularPago = useFinanceStore((s) => s.desvincularPago);
  const confirmarSaldoDeuda = useFinanceStore((s) => s.confirmarSaldoDeuda);
  const descuentosDePago = useFinanceStore((s) => s.descuentosDePago);
  const expenses = useFinanceStore((s) => s.expenses);
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
  // Estado de cuenta (solo tarjetas)
  const [fCut, setFCut] = useState('');
  const [fContado, setFContado] = useState('');
  const [fCupo, setFCupo] = useState('');

  // ── Actualizar estado de cuenta (cada corte) ──
  const [estado, setEstado] = useState<Debt | null>(null);
  const [eTotal, setETotal] = useState('');
  const [eContado, setEContado] = useState('');
  const [eMin, setEMin] = useState('');

  // ── Registrar pago ──
  const [paying, setPaying] = useState<Debt | null>(null);
  const [pAmount, setPAmount] = useState('');
  const [pDate, setPDate] = useState(getTodayISO());
  const [pAccount, setPAccount] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);
  // Confirmación antes de vincular un pago histórico sin categorizar a una
  // deuda: dos tarjetas comparten categoría de gasto, así que los candidatos
  // de una aparecen también en el panel de la otra — sin este paso un clic
  // al lado equivocado vincula por error (bug real reportado por un usuario).
  const [confirmVincular, setConfirmVincular] = useState<{ t: Transaction; d: Debt } | null>(null);
  const [extraInput, setExtraInput] = useState(String(extra));

  function openCreate() {
    setEditing(null);
    setFName(''); setFTag('personal'); setFKind('Tarjeta de crédito');
    setFBalance(''); setFRate(''); setFMin(''); setFDay('');
    setFCut(''); setFContado(''); setFCupo('');
    setFormOpen(true);
  }
  function openEdit(d: Debt) {
    setEditing(d);
    setFName(d.name); setFTag(d.tag); setFKind(d.kind);
    setFBalance(String(d.balance)); setFRate(String(d.annualRate)); setFMin(d.minPayment > 0 ? String(d.minPayment) : '');
    setFDay(d.payDay ? String(d.payDay) : '');
    setFCut(d.cutDay ? String(d.cutDay) : '');
    setFContado(d.statementBalance !== undefined ? String(d.statementBalance) : '');
    setFCupo(d.creditLimit !== undefined ? String(d.creditLimit) : '');
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
      // Vacío = sin dato: el store quita la clave (normalizarDeuda), y en una
      // deuda que no es tarjeta quita las tres.
      cutDay: fCut ? Math.min(31, Math.max(1, parseInt(fCut, 10) || 0)) || undefined : undefined,
      statementBalance: fContado.trim() ? roundMoney(parseMoneyInput(fContado)) : undefined,
      creditLimit: fCupo.trim() ? roundMoney(parseMoneyInput(fCupo)) : undefined,
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
    // Monto: el pago de contado pendiente (si lo hay) y, si no, el mínimo fijo.
    const contado = d.statementBalance !== undefined && d.statementBalance > 0 ? d.statementBalance : null;
    setPAmount(contado !== null ? String(contado) : tieneMinimoFijo(d) ? String(d.minPayment) : '');
    setPDate(getTodayISO());
    setPAccount(cuentaSugeridaParaPago(d, expenses, accounts) ?? '');
  }
  function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    const amount = roundMoney(parseMoneyInput(pAmount));
    if (amount <= 0) { addToast('Ingresa un monto mayor a 0', 'error'); return; }
    registerDebtPayment(paying.id, { amount, date: pDate, accountId: pAccount || null });
    addToast(`Pago de ${formatMoney(amount)} registrado ✅`, 'success');
    syncToCloud(saveData, addToast);
    setPaying(null);
  }

  function openEstado(d: Debt) {
    setEstado(d);
    setETotal(String(d.balance));
    setEContado(d.statementBalance !== undefined ? String(d.statementBalance) : '');
    setEMin(d.minPayment > 0 ? String(d.minPayment) : '');
  }
  function handleEstado(e: FormEvent) {
    e.preventDefault();
    if (!estado) return;
    updateDebt(estado.id, {
      balance: roundMoney(parseMoneyInput(eTotal)),
      statementBalance: eContado.trim() ? roundMoney(parseMoneyInput(eContado)) : undefined,
      minPayment: roundMoney(parseMoneyInput(eMin)),
    });
    addToast('Estado de cuenta actualizado ✅', 'success');
    syncToCloud(saveData, addToast);
    setEstado(null);
  }

  function openVincular(t: Transaction, d: Debt) {
    setConfirmVincular({ t, d });
  }
  function handleVincular() {
    if (!confirmVincular) return;
    const { t, d } = confirmVincular;
    vincularPagoHistorico(t.id, d.id);
    addToast(`Pago vinculado a ${d.name}: el saldo no cambió`, 'success');
    syncToCloud(saveData, addToast);
    setConfirmVincular(null);
  }
  function handleDesvincular(t: Transaction) {
    desvincularPago(t.id);
    addToast('Pago desvinculado: el saldo no cambió', 'info');
    syncToCloud(saveData, addToast);
  }

  function handleConfirmarSaldo(d: Debt) {
    confirmarSaldoDeuda(d.id);
    addToast(`Saldo de ${d.name} confirmado: se mantendrá igual en todos tus dispositivos`, 'success');
    syncToCloud(saveData, addToast);
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

  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null);

  const ultimoPagoEstado = useMemo(() => (estado ? historialDeuda(estado, expenses).pagos[0] ?? null : null), [estado, expenses]);

  const anyOpen = formOpen || !!paying || !!confirmDelete || !!estado || !!confirmVincular;
  useEscapeKey(() => {
    if (confirmDelete) setConfirmDelete(null);
    else if (confirmVincular) setConfirmVincular(null);
    else if (estado) setEstado(null);
    else if (paying) setPaying(null);
    else if (formOpen) setFormOpen(false);
  }, anyOpen);
  useScrollLock(anyOpen);

  const ordered = plan.order.map((id) => debts.find((d) => d.id === id)).filter((d): d is Debt => !!d);
  // Pago variable: no entran en la proyección, pero siguen en la lista (para
  // registrar pagos, editar o eliminar) y se avisa de que están fuera.
  const variables = plan.sinMinimo.map((id) => debts.find((d) => d.id === id)).filter((d): d is Debt => !!d);
  const filas: { d: Debt; n: number | null }[] = [
    ...ordered.map((d, i) => ({ d, n: i + 1 })),
    ...variables.map((d) => ({ d, n: null })),
  ];

  async function handleCSV() {
    try {
      const blob = debtsToCsv(debts);
      const outcome = await downloadBlob(blob, 'foresight-deudas.csv');
      if (outcome === 'cancelled') return;
      addToast(outcome === 'shared' ? 'CSV listo para compartir ✅' : 'CSV descargado ✅', 'success');
    } catch {
      addToast('Error al generar el CSV', 'error');
    }
  }

  function handlePDF() {
    try {
      imprimirDeudas(debts);
    } catch {
      addToast('Este navegador no permite imprimir desde la app', 'error');
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* La estrategia (método y aporte extra) vive en la tarjeta de comparación,
          como en la referencia: la primera fila de la vista es el dato, no un
          formulario. */}
      <div className="flex justify-end gap-1.5">
        {debts.length > 0 && (
          <>
            <button onClick={handleCSV} className="saas-btn-icon text-slate-600 dark:text-slate-400" aria-label="Descargar CSV" title="Descargar CSV (Excel)">
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </button>
            <button onClick={handlePDF} className="saas-btn-icon text-slate-600 dark:text-slate-400" aria-label="Guardar como PDF" title="Guardar como PDF">
              <Printer className="w-3.5 h-3.5" />
            </button>
          </>
        )}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
            <Kpi label="Deuda total" value={formatMoney(totalDebt(debts))} sub={`${debts.length} ${debts.length === 1 ? 'deuda' : 'deudas'}`} />
            <Kpi
              label="Pago mensual"
              value={formatMoney(monthlyDebtPayment(debts, extra))}
              sub={variables.length > 0 ? `mínimos fijos + ${formatMoney(extra)} extra · ${variables.length} con pago variable` : `mínimos + ${formatMoney(extra)} extra`}
            />
            <Kpi
              label="Libre de deudas"
              value={plan.ok && !plan.empty ? payoffDate(plan.months) : '—'}
              sub={plan.empty ? 'sin pagos fijos que proyectar' : plan.ok ? `en ${plan.months} meses` : 'el pago no alcanza'}
              tone={plan.empty ? undefined : plan.ok ? 'good' : 'crit'}
            />
            <Kpi label="Intereses proyectados" value={plan.ok && !plan.empty ? formatMoney(plan.totalInterest) : '—'} sub="hasta saldar todo" />
          </div>

          {!plan.ok && (
            <div role="alert" className="saas-card p-3 border-expense-500/50 flex items-start gap-2 text-xs text-expense-700 dark:text-expense-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Con los pagos actuales los intereses crecen más rápido que los abonos: sube el pago mínimo de alguna deuda o el aporte extra para que el plan cierre.</span>
            </div>
          )}

          {variables.length > 0 && (
            <div role="status" className="saas-card p-3 flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                {variables.length === 1 ? 'Esta deuda tiene pago variable y queda fuera de la proyección' : 'Estas deudas tienen pago variable y quedan fuera de la proyección'}
                {' '}(fecha libre de deudas, intereses y gráfica): <strong className="font-semibold">{variables.map((d) => d.name).join(', ')}</strong>.
                {' '}Ponles un pago mínimo con «Editar» si quieres incluirlas.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:items-start">
            <DebtCurveCard plan={plan} method={method} />
            <MethodCompareCard
              plan={plan}
              alt={alt}
              method={method}
              onMethod={(m) => { setSettings({ debtMethod: m }); syncToCloud(saveData, addToast); }}
              extra={{ value: extraInput, onChange: setExtraInput, commit: commitExtra }}
            />
          </div>

          {/* Orden de pago */}
          <div className="saas-card p-4 animate-slide-up">
            <CardHeader
              titulo="Orden de pago"
              sub={method === 'snowball' ? 'De menor a mayor saldo — bola de nieve: victorias rápidas.' : 'Del interés más alto al más bajo — avalancha: menos intereses.'}
            />
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filas.map(({ d, n }) => {
                const months = plan.payoff[d.id];
                return (
                  <li key={d.id} className="py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1">
                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold tabular-nums flex items-center justify-center flex-shrink-0">{n ?? '—'}</span>
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        {d.name} <ScopeBadge businessType={d.tag} />
                      </p>
                      <p className="text-2xs text-slate-600 dark:text-slate-400">
                        {d.kind} · {d.annualRate}% anual · {tieneMinimoFijo(d) ? `mínimo ${formatMoney(d.minPayment)}` : 'pago variable'}{d.payDay ? ` · paga el ${d.payDay}` : ''}
                      </p>
                      <PagoPendienteTarjeta debt={d} />
                      <div className="flex gap-x-2 gap-y-1 mt-1.5 flex-wrap">
                        <button onClick={() => openPay(d)} className="saas-btn saas-btn-secondary saas-btn-sm text-xs">Registrar pago</button>
                        {esTarjeta(d) && (
                          <button onClick={() => openEstado(d)} className="saas-btn saas-btn-secondary saas-btn-sm text-xs">Actualizar estado de cuenta</button>
                        )}
                        <button onClick={() => openEdit(d)} className="saas-btn saas-btn-ghost saas-btn-sm text-xs flex items-center gap-1" aria-label={`Editar ${d.name}`}><Pencil className="w-3 h-3" /> Editar</button>
                        <button onClick={() => setConfirmDelete(d)} className="saas-btn saas-btn-ghost saas-btn-sm text-xs flex items-center gap-1 text-expense-600 dark:text-expense-400" aria-label={`Eliminar ${d.name}`}><Trash2 className="w-3 h-3" /> Eliminar</button>
                      </div>
                      {/* Deuda no anclada (anterior al saldo derivado): su saldo
                          aún se lleva como contador en este dispositivo. Anclarla
                          es decisión del usuario (spec sync-saldo-deudas §5.4). */}
                      {d.saldoBase === undefined && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Confirma que el saldo de {formatMoney(d.balance)} coincide con tu banco para que se mantenga igual en todos tus dispositivos.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleConfirmarSaldo(d)}
                            className="saas-btn saas-btn-secondary saas-btn-sm text-xs"
                            aria-label={`Confirmar saldo de ${d.name}`}
                          >
                            Confirmar saldo
                          </button>
                        </div>
                      )}
                    </div>
                    {/* En móvil las cifras bajan a su propia línea (como .debt-figs
                        de la referencia) en vez de estrangular el nombre. */}
                    <div className="w-full sm:w-auto flex sm:block items-baseline gap-2 sm:text-right flex-shrink-0 pl-9 sm:pl-0">
                      <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(d.balance)}</p>
                      <p className="text-2xs text-slate-600 dark:text-slate-400">{months ? `libre en ${payoffDate(months)}` : n === null ? 'pago variable · sin proyección' : 'sin proyección'}</p>
                    </div>
                    <ResumenTarjeta debt={d} />
                    <HistorialPagos
                      debt={d}
                      expenses={expenses}
                      accounts={accounts}
                      debts={debts}
                      onVincular={openVincular}
                      onDesvincular={handleDesvincular}
                      descuentos={descuentosDePago}
                      abierto={historialAbierto === d.id}
                      onToggle={() => setHistorialAbierto(historialAbierto === d.id ? null : d.id)}
                    />
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
            <AmbitoField value={fTag} onChange={setFTag} />
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
              <Campo id="d-min" label="Pago mínimo (opcional)">
                <input id="d-min" type="text" inputMode="decimal" value={fMin} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFMin(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" aria-describedby="d-min-ayuda" />
              </Campo>
            </div>
            <p id="d-min-ayuda" className="text-xs text-slate-600 dark:text-slate-400 -mt-1">
              Déjalo vacío si cambia cada mes: la deuda queda como «pago variable» y fuera de la proyección.
            </p>
            {fKind === 'Tarjeta de crédito' ? (
              <>
                {/* Como en el estado de cuenta del banco: corte y fecha límite
                    lado a lado; pago de contado y cupo, opcionales. */}
                <div className="grid grid-cols-2 gap-2">
                  <Campo id="d-cut" label="Día de corte">
                    <input id="d-cut" type="number" inputMode="numeric" min={1} max={31} value={fCut} onChange={(e) => setFCut(e.target.value)} className="saas-input py-1.5 text-sm tabular-nums" />
                  </Campo>
                  <Campo id="d-day" label="Pagar hasta (día)">
                    <input id="d-day" type="number" inputMode="numeric" min={1} max={31} value={fDay} onChange={(e) => setFDay(e.target.value)} className="saas-input py-1.5 text-sm tabular-nums" />
                  </Campo>
                  <Campo id="d-contado" label="Pago de contado">
                    <input id="d-contado" type="text" inputMode="decimal" value={fContado} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFContado(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" placeholder="Opcional" />
                  </Campo>
                  <Campo id="d-cupo" label="Cupo total">
                    <input id="d-cupo" type="text" inputMode="decimal" value={fCupo} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFCupo(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" placeholder="Opcional" />
                  </Campo>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 -mt-1">
                  El pago de contado es lo que tu banco te pide pagar en este corte para no generar intereses. Nunca escribas el número de la tarjeta.
                </p>
              </>
            ) : (
              <Campo id="d-day" label="Día de pago del mes (opcional)">
                <input id="d-day" type="number" min={1} max={31} value={fDay} onChange={(e) => setFDay(e.target.value)} className="saas-input py-1.5 text-sm tabular-nums" />
              </Campo>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setFormOpen(false)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">{editing ? 'Guardar' : 'Crear'}</button>
            </div>
          </form>
        </ModalSheet>
      )}

      {/* Modal estado de cuenta (tarjetas) */}
      {estado && (
        <ModalSheet id="estado-form-title" titulo="Actualizar estado de cuenta" onClose={() => setEstado(null)} focoInicial="#e-total">
          <form onSubmit={handleEstado} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {estado.name} · copia las cifras del último corte de tu banco.
            </p>
            <Campo id="e-total" label="Deuda total">
              <input id="e-total" type="text" inputMode="decimal" value={eTotal} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setETotal(e.target.value); }} className="saas-input py-1.5 text-sm font-bold tabular-nums" required />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo id="e-contado" label="Pago de contado">
                <input id="e-contado" type="text" inputMode="decimal" value={eContado} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setEContado(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" placeholder="Opcional" />
              </Campo>
              <Campo id="e-min" label="Pago mínimo (opcional)">
                <input id="e-min" type="text" inputMode="decimal" value={eMin} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setEMin(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" placeholder="Variable" />
              </Campo>
            </div>
            <p className="text-2xs text-slate-600 dark:text-slate-400">
              El pago de contado es lo que debes pagar antes de la fecha límite para no pagar intereses. Los pagos que registres después lo irán bajando.
            </p>
            {ultimoPagoEstado && (
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Último pago registrado: <span className="tabular-nums font-semibold">{formatMoney(ultimoPagoEstado.amount)}</span> el {formatFechaConAnio(ultimoPagoEstado.date)}.
                Si tu estado de cuenta ya incluye ese pago, el total nuevo lo refleja; si es posterior al corte, réstalo tú.
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEstado(null)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">Guardar</button>
            </div>
          </form>
        </ModalSheet>
      )}

      {/* Modal pago */}
      {paying && (
        <ModalSheet id="pay-form-title" titulo="Registrar pago" onClose={() => setPaying(null)} focoInicial="#p-amount">
          <form onSubmit={handlePay} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <p className="text-xs text-slate-600 dark:text-slate-400">{paying.name} · saldo actual {formatMoney(paying.balance)}</p>
            <div className="grid grid-cols-2 gap-2">
              <Campo id="p-date" label="Fecha">
                <input id="p-date" type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className="saas-input py-1.5 text-sm" required />
              </Campo>
              <Campo id="p-amount" label="Monto">
                <input id="p-amount" type="text" inputMode="decimal" value={pAmount} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setPAmount(e.target.value); }} className="saas-input py-1.5 text-sm font-bold tabular-nums" required />
              </Campo>
            </div>
            {paying.statementBalance !== undefined && paying.statementBalance > 0 && tieneMinimoFijo(paying) && (
              <div className="flex flex-wrap gap-1.5 -mt-1" role="group" aria-label="Montos sugeridos">
                <button type="button" onClick={() => setPAmount(String(paying.statementBalance))} className="saas-chip-filter">
                  Contado {formatMoney(paying.statementBalance)}
                </button>
                <button type="button" onClick={() => setPAmount(String(paying.minPayment))} className="saas-chip-filter">
                  Mínimo {formatMoney(paying.minPayment)}
                </button>
              </div>
            )}
            {accounts.length > 0 && (
              <Campo id="p-acc" label="Cuenta de origen">
                <select id="p-acc" value={pAccount} onChange={(e) => setPAccount(e.target.value)} className="saas-input py-1.5 text-sm">
                  <option value="">No descontar de ninguna cuenta</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Campo>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Baja el saldo de la deuda{accounts.length > 0 ? ' y sale de la cuenta que elijas' : ''}. No cuenta como gasto del mes: la compra ya la registraste cuando la hiciste.
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

      <ConfirmDialog
        open={!!confirmVincular}
        title="¿Vincular este pago?"
        message={
          confirmVincular
            ? `¿Vincular «${confirmVincular.t.concept}» (${formatFechaConAnio(confirmVincular.t.date)}, ${formatMoney(confirmVincular.t.amount)}) al historial de «${confirmVincular.d.name}»? El saldo no cambia.`
            : ''
        }
        confirmLabel="Vincular"
        variant="warning"
        onConfirm={handleVincular}
        onCancel={() => setConfirmVincular(null)}
      />
    </div>
  );
}

/* ─── "Rumbo a cero": saldo total proyectado mes a mes (SVG, como la referencia) ─── */
function DebtCurveCard({ plan, method }: { plan: DebtPlan; method: DebtMethod }) {
  const isDark = useUiStore((s) => s.isDark);
  const { ref, ancho: W } = useAnchoContenedor<HTMLDivElement>();
  const data = plan.schedule.slice(0, Math.min(plan.schedule.length, 121));
  const H = 190, padL = 52, padR = 12, padB = 26, padT = 10;
  const innerH = H - padT - padB;
  const { grid, tick, income: linea } = coloresGrafica(isDark);

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
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Saldo de deuda proyectado hasta cero" className="block max-w-full">
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
      <CardHeader titulo="Rumbo a cero" sub="Saldo total proyectado mes a mes" />
      <div ref={ref}>{contenido}</div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-0 w-4 border-t-[3px]" style={{ borderColor: linea }} />
        Saldo total ({method === 'snowball' ? 'bola de nieve' : 'avalancha'})
      </p>
    </div>
  );
}

interface ExtraPago {
  value: string;
  onChange: (v: string) => void;
  commit: () => void;
}

function MethodCompareCard({ plan, alt, method, onMethod, extra }: {
  plan: DebtPlan;
  alt: DebtPlan;
  method: DebtMethod;
  onMethod: (m: DebtMethod) => void;
  extra: ExtraPago;
}) {
  const snow = method === 'snowball' ? plan : alt;
  const aval = method === 'snowball' ? alt : plan;

  // Cada bloque es el propio selector del método: se elige tocándolo.
  const bloque = (title: string, id: DebtMethod, p: DebtPlan, active: boolean) => (
    <button
      type="button"
      onClick={() => onMethod(id)}
      aria-pressed={active}
      className={`w-full text-left rounded-xl p-3 transition-colors ${active ? 'bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-200/60 dark:ring-brand-800/40' : 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
        {title}
        {active
          ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-income-100 dark:bg-income-950 text-income-700 dark:text-income-400">en uso</span>
          : <span className="text-2xs text-slate-600 dark:text-slate-400">tocar para usar</span>}
      </p>
      {!p.ok ? (
        <p className="text-2xs text-slate-600 dark:text-slate-400 mt-1">El plan no cierra con estos pagos.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <div>
            <p className="text-2xs text-slate-600 dark:text-slate-400">Libre en</p>
            <p className="text-sm font-bold tabular-nums">{p.months} meses</p>
          </div>
          <div>
            <p className="text-2xs text-slate-600 dark:text-slate-400">Intereses</p>
            <p className="text-sm font-bold tabular-nums">{formatMoney(p.totalInterest)}</p>
          </div>
        </div>
      )}
    </button>
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
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <CardHeader titulo="Bola de nieve vs. avalancha" sub="Con el mismo aporte extra" className="" />
        <div>
          <label htmlFor="d-extra" className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-0.5 block">Aporte extra mensual</label>
          <input
            id="d-extra"
            type="text"
            inputMode="decimal"
            value={extra.value}
            onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) extra.onChange(e.target.value); }}
            onBlur={extra.commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); extra.commit(); } }}
            className="saas-input-sm text-xs !w-28 tabular-nums"
          />
        </div>
      </div>
      {bloque('Bola de nieve', 'snowball', snow, method === 'snowball')}
      {bloque('Avalancha', 'avalanche', aval, method === 'avalanche')}
      {msg && <p className="text-xs text-slate-700 dark:text-slate-300">{msg}</p>}
    </div>
  );
}

/* ─── Historial de pagos de una deuda: sus movimientos enlazados (debtId) ─── */
function HistorialPagos({ debt, expenses, accounts, debts, onVincular, onDesvincular, descuentos, abierto, onToggle }: {
  debt: Debt;
  expenses: Transaction[];
  accounts: ReturnType<typeof useFinanceStore.getState>['accounts'];
  debts: Debt[];
  onVincular: (t: Transaction, d: Debt) => void;
  onDesvincular: (t: Transaction) => void;
  descuentos: DescuentosDePago;
  abierto: boolean;
  onToggle: () => void;
}) {
  const { pagos, totalPagado } = useMemo(() => historialDeuda(debt, expenses), [debt, expenses]);
  const sinVincular = useMemo(() => gastosSinVincular(debt, expenses), [debt, expenses]);
  const porId = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);
  const panelId = `historial-${debt.id}`;
  // Lo pagado frente a lo que se debía al primer pago registrado: saldo de
  // hoy + todo lo pagado desde entonces.
  const original = debt.balance + totalPagado;
  const pct = original > 0 ? (totalPagado / original) * 100 : 0;

  return (
    <div className="w-full pl-9">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-controls={panelId}
        className="saas-hit text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
      >
        {abierto ? 'Ocultar historial' : `Historial de pagos (${pagos.length})${sinVincular.length > 0 ? ` · ${sinVincular.length} sin vincular` : ''}`}
      </button>
      {abierto && (
        <div id={panelId} className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2.5">
          {pagos.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Aún no hay pagos. Usa «Registrar pago» o, en Movimientos, un gasto de «Pago de tarjetas» o «Préstamos» con esta deuda.
            </p>
          ) : (
            <>
              <div>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Pagado</span>
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                    {formatMoney(totalPagado)} <span className="font-normal text-slate-600 dark:text-slate-400">de {formatMoney(original)}</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar pct={pct} label={`${debt.name}: ${pct.toFixed(0)}% pagado`} color="bg-income-500 dark:bg-income-400" />
                </div>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {pagos.map((p) => {
                  const tx = porId.get(p.id);
                  return (
                    <li key={p.id} className="py-2 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-slate-900 dark:text-white">{formatFechaConAnio(p.date)}</p>
                        <p className="text-slate-700 dark:text-slate-300 break-words">{tx ? etiquetaPago(tx, debts) : 'Pago de deuda'}</p>
                        <p className="text-slate-600 dark:text-slate-400 break-words">
                          {p.accountId ? accountName(accounts, p.accountId) : 'Sin cuenta'}
                        </p>
                        {/* Solo se desvincula un pago histórico (vinculado a
                            mano): la marca `debtHistorico` viaja con el
                            movimiento, así todos los dispositivos muestran lo
                            mismo. En una deuda NO anclada se mantiene además la
                            regla legada (gasto sin registro de descuento o
                            marcado «vinculado» en este dispositivo). */}
                        {tx && tx.type === 'expense' && (
                          tx.debtHistorico ||
                          (debt.saldoBase === undefined && (!descuentos[tx.id] || descuentos[tx.id].vinculado))
                        ) && (
                          <button
                            type="button"
                            onClick={() => onDesvincular(tx)}
                            aria-label={`Desvincular pago de ${formatMoney(p.amount)} del ${formatFechaConAnio(p.date)} (no cambia el saldo)`}
                            className="saas-hit mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:underline"
                          >
                            Desvincular
                          </button>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="tabular-nums font-semibold text-income-600 dark:text-income-400 whitespace-nowrap">−{formatMoney(p.amount)}</p>
                        <p className="tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">saldo {formatMoney(p.saldoDespues)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {sinVincular.length > 0 && (
            <div className={pagos.length > 0 ? 'pt-2.5 border-t border-slate-200 dark:border-slate-700' : ''}>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">Pagos anteriores sin vincular ({sinVincular.length})</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Gastos de esta categoría registrados antes de enlazar pagos con deudas. Al vincularlos dejan de contar como gasto y entran al historial; el saldo de la deuda no cambia.
              </p>
              <ul className="mt-1.5 max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
                {sinVincular.map((t) => (
                  <li key={t.id} className="py-2 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-slate-900 dark:text-white break-words">{t.concept}</p>
                      <p className="text-slate-600 dark:text-slate-400">{formatFechaConAnio(t.date)}</p>
                      <button
                        type="button"
                        onClick={() => onVincular(t, debt)}
                        aria-label={`Vincular (no cambia el saldo): ${t.concept}, ${formatMoney(t.amount)}, ${formatFechaConAnio(t.date)}`}
                        className="saas-hit mt-0.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Vincular (no cambia el saldo)
                      </button>
                    </div>
                    <p className="tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap flex-shrink-0">{formatMoney(t.amount)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Tarjeta: dato principal «Pagar $X antes del día Y» ─── */
function PagoPendienteTarjeta({ debt }: { debt: Debt }) {
  const e = estadoTarjeta(debt, getTodayISO());
  if (!e) return null;
  const urgente = e.diasParaPagar !== null && e.diasParaPagar <= 3;
  const faltan = e.diasParaPagar === null ? '' : e.diasParaPagar === 0 ? ' (vence hoy)' : ` (faltan ${e.diasParaPagar} ${e.diasParaPagar === 1 ? 'día' : 'días'})`;
  const color = urgente ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-white';
  const clase = `text-sm font-semibold tabular-nums mt-1 ${color}`;

  // Contado ya cubierto: no hay nada que pagar para evitar intereses.
  if (e.contadoCubierto) {
    return <p className="text-sm font-semibold text-income-700 dark:text-income-400 mt-1">✅ Pago de contado cubierto: este corte no genera intereses.</p>;
  }
  if (e.montoAPagar !== null) {
    return (
      <p className={clase}>
        {`Pagar ${formatMoney(e.montoAPagar)}${e.origenMonto === 'minimo' ? ' mínimo' : ''}${e.proximoPago ? ` antes del ${formatFechaCorta(e.proximoPago)}` : ''}${faltan}${e.origenMonto === 'contado' ? ' para no pagar intereses' : ''}.`}
      </p>
    );
  }
  if (e.proximoPago) {
    return <p className={clase}>{`Paga antes del ${formatFechaCorta(e.proximoPago)}${faltan}.`}</p>;
  }
  return null;
}

/* ─── Resumen de tarjeta: corte, cupo disponible e interés estimado ─── */
function ResumenTarjeta({ debt }: { debt: Debt }) {
  const e = estadoTarjeta(debt, getTodayISO());
  if (!e) return null;
  const sinDatos = e.contado === null && e.proximoCorte === null && e.cupoDisponible === null && e.montoAPagar === null;
  // Si solo se paga el pago de contado, el interés corre sobre lo que queda del
  // saldo (saldo − contado); no sobre el saldo completo, para no sobreestimar.
  // Es una orientación (tasa 0 = sin definir: no se muestra).
  const saldoRestante = e.contado !== null && e.contado > 0 ? Math.max(0, debt.balance - e.contado) : 0;
  const interes = saldoRestante > 0 ? interesEstimadoMensual(saldoRestante, debt.annualRate) : 0;

  return (
    <div className="w-full pl-9 space-y-1.5">
      {(e.proximoCorte || e.proximoPago) && (
        <p className="text-2xs text-slate-600 dark:text-slate-400">
          {[e.proximoCorte && `Corte: ${formatFechaCorta(e.proximoCorte)}`, e.proximoPago && `Pagar hasta: ${formatFechaCorta(e.proximoPago)}`].filter(Boolean).join(' · ')}
        </p>
      )}
      {e.cupoDisponible !== null && e.usoPct !== null && debt.creditLimit !== undefined && (
        <div className="max-w-sm">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-slate-600 dark:text-slate-400">Cupo disponible</span>
            <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
              {formatMoney(Math.max(0, e.cupoDisponible))} <span className="font-normal text-slate-600 dark:text-slate-400">de {formatMoney(debt.creditLimit)}</span>
            </span>
          </div>
          <div className="mt-1">
            <ProgressBar
              pct={Math.min(100, e.usoPct)}
              label={`${debt.name}: ${e.usoPct.toFixed(0)}% del cupo en uso`}
              color={e.usoPct > 70 ? 'bg-expense-500 dark:bg-expense-400' : 'bg-brand-500 dark:bg-brand-400'}
            />
          </div>
          <p className="text-2xs text-slate-600 dark:text-slate-400 mt-0.5">{e.usoPct.toFixed(0)}% en uso{e.usoPct > 70 ? ' · por encima del 70% afecta tu historial crediticio' : ''}</p>
        </div>
      )}
      {interes > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {`Si pagas solo el pago de contado, el saldo restante generaría ~${formatMoney(interes)} de interés al mes (estimación; consulta tu estado de cuenta).`}
        </p>
      )}
      {sinDatos && (
        <p className="text-2xs text-slate-600 dark:text-slate-400">Usa «Actualizar estado de cuenta» para ver el pago de contado y tu cupo disponible.</p>
      )}
    </div>
  );
}
