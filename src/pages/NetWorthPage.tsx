// ================================================================
// NetWorthPage — Patrimonio (fase 3.3; referencia: viewPatrimonio() de Balance Dual)
//
// Cuatro KPIs, la curva de cierres mensuales (SVG), de qué se compone el
// patrimonio hoy, y "Otros activos" agrupados con alta/edición/borrado.
// La meta de patrimonio se define en Ajustes.
// ================================================================

import { useMemo, useState, type FormEvent } from 'react';
import { useAnchoContenedor } from '@/hooks/useAnchoContenedor';
import { Plus, Pencil, Trash2, FileSpreadsheet, Printer } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, parseMoneyInput, roundMoney, syncToCloud, downloadBlob } from '@/lib/utils';
import { monthKeyLabel, monthKeyLabelCorto } from '@/lib/month-keys';
import { netWorthNow, netWorthHistory, netWorthHistoryToCsv, ASSET_GROUPS, type NetWorth } from '@/lib/networth';
import { imprimirPatrimonio } from '@/lib/print-networth';
import { escalaBonita, formatoTickDinero, trazarLinea } from '@/lib/chart-geometry';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { coloresGrafica } from '@/lib/chart-colors';
import { CardHeader } from '@/components/ui/CardHeader';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ScopeBadge } from '@/components/ui/TransactionBits';
import type { Asset, AssetGroup, BusinessType, NetWorthSnapshot } from '@/types';

export function NetWorthPage() {
  const accounts = useFinanceStore((s) => s.accounts);
  const expenses = useFinanceStore((s) => s.expenses);
  const assets = useFinanceStore((s) => s.assets);
  const debts = useFinanceStore((s) => s.debts);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const networth = useFinanceStore((s) => s.networth);
  const goal = useFinanceStore((s) => s.settings.netWorthGoal);
  const addAsset = useFinanceStore((s) => s.addAsset);
  const updateAsset = useFinanceStore((s) => s.updateAsset);
  const deleteAsset = useFinanceStore((s) => s.deleteAsset);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();

  const nw = useMemo(() => netWorthNow({ accounts, expenses, assets, debts, savingsGoals }), [accounts, expenses, assets, debts, savingsGoals]);
  const history = useMemo(() => netWorthHistory(networth, 12), [networth]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [fName, setFName] = useState('');
  const [fTag, setFTag] = useState<BusinessType>('personal');
  const [fGroup, setFGroup] = useState<AssetGroup>('Otros activos');
  const [fValue, setFValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Asset | null>(null);

  function openCreate() {
    setEditing(null); setFName(''); setFTag('personal'); setFGroup('Otros activos'); setFValue('');
    setFormOpen(true);
  }
  function openEdit(a: Asset) {
    setEditing(a); setFName(a.name); setFTag(a.tag); setFGroup(a.group); setFValue(String(a.value));
    setFormOpen(true);
  }
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = fName.trim();
    if (!name) { addToast('Ponle un nombre al activo', 'error'); return; }
    const data = { name, tag: fTag, group: fGroup, value: roundMoney(parseMoneyInput(fValue)) };
    if (editing) { updateAsset(editing.id, data); addToast('Activo actualizado ✅', 'success'); }
    else { addAsset(data); addToast('Activo creado ✅', 'success'); }
    syncToCloud(saveData, addToast);
    setFormOpen(false);
  }
  function handleDelete() {
    if (!confirmDelete) return;
    deleteAsset(confirmDelete.id);
    addToast(`Activo "${confirmDelete.name}" eliminado`, 'info');
    syncToCloud(saveData, addToast);
    setConfirmDelete(null);
  }

  useEscapeKey(() => { if (confirmDelete) setConfirmDelete(null); else if (formOpen) setFormOpen(false); }, formOpen || !!confirmDelete);
  useScrollLock(formOpen || !!confirmDelete);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
        <Kpi label="Patrimonio neto" value={formatMoney(nw.net)} sub="activos menos pasivos" tone={nw.net >= 0 ? 'good' : 'crit'} />
        <Kpi label="Total de activos" value={formatMoney(nw.assets)} sub={`${formatMoney(nw.liquid)} en cuentas`} />
        <Kpi label="Total de pasivos" value={formatMoney(nw.liabilities)} sub={`${formatMoney(nw.debts)} en deudas`} />
        <Kpi
          label="Falta para la meta"
          value={goal > 0 ? formatMoney(Math.max(0, goal - nw.net)) : 'Sin meta'}
          sub={goal > 0 ? `meta ${formatMoney(goal)}` : 'defínela en Ajustes'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:items-start">
        <NetWorthTrendCard history={history} goal={goal} hoy={nw.net} />
        <NetWorthBreakdownCard nw={nw} />
      </div>

      {/* Otros activos */}
      <div className="saas-card p-4 animate-slide-up">
        <CardHeader
          titulo="Otros activos"
          sub="Lo que la app no ve en tus cuentas: vehículos, inversiones, equipos"
          className="mb-2"
          accion={
            <button onClick={openCreate} className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5 flex-shrink-0">
              <Plus className="w-3.5 h-3.5" /> Agregar activo
            </button>
          }
        />
        {assets.length === 0 ? (
          <EmptyState variant="compact" title="Sin activos registrados. Tus cuentas ya cuentan como activo líquido." />
        ) : (
          ASSET_GROUPS.map((g) => {
            const lista = assets.filter((a) => a.group === g);
            if (lista.length === 0) return null;
            return (
              <div key={g} className="mt-3">
                <h3 className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">{g}</h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lista.map((a) => (
                    <li key={a.id} className="py-2 flex items-center gap-3">
                      <span className="flex-1 min-w-0 text-sm text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        {a.name} <ScopeBadge businessType={a.tag} />
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{formatMoney(a.value)}</span>
                      <button onClick={() => openEdit(a)} className="saas-btn-icon text-slate-600 dark:text-slate-400" aria-label={`Editar ${a.name}`} title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setConfirmDelete(a)} className="saas-btn-icon text-expense-600 dark:text-expense-400" aria-label={`Eliminar ${a.name}`} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>

      {formOpen && (
        <ModalSheet id="asset-form-title" titulo={editing ? 'Editar activo' : 'Nuevo activo'} onClose={() => setFormOpen(false)} trapActivo={!confirmDelete} focoInicial="#as-name">
          <form onSubmit={handleSubmit} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div>
              <span className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Ámbito</span>
              <div className="flex gap-1" role="group" aria-label="Ámbito">
                {(['personal', 'business'] as BusinessType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setFTag(t)}
                    className={`flex-1 py-1 rounded-md text-2xs font-semibold ${fTag === t ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                    {t === 'personal' ? 'Personal' : 'Negocio'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="as-name" className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Nombre</label>
              <input id="as-name" type="text" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Moto, terreno, fondo de inversión" className="saas-input py-1.5 text-sm" required maxLength={80} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="as-group" className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Grupo</label>
                <select id="as-group" value={fGroup} onChange={(e) => setFGroup(e.target.value as AssetGroup)} className="saas-input py-1.5 text-sm">
                  {ASSET_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="as-value" className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Valor actual</label>
                <input id="as-value" type="text" inputMode="decimal" value={fValue} onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value)) setFValue(e.target.value); }} className="saas-input py-1.5 text-sm tabular-nums" required />
              </div>
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
        title="¿Eliminar este activo?"
        message={confirmDelete ? `"${confirmDelete.name}" dejará de contar en tu patrimonio.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'crit' }) {
  const color = tone === 'good' ? 'text-income-600 dark:text-income-400' : tone === 'crit' ? 'text-expense-600 dark:text-expense-400' : 'text-slate-900 dark:text-white';
  return (
    <div className="saas-card p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</p>
      <p className={`text-[clamp(1rem,4.6vw,1.25rem)] md:text-xl font-bold tabular-nums mt-1 whitespace-nowrap ${color}`}>{value}</p>
      <p className="text-2xs text-slate-600 dark:text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

/* ─── Evolución del patrimonio: los cierres mensuales (SVG, como la referencia) ─── */
function NetWorthTrendCard({ history, goal, hoy }: { history: NetWorthSnapshot[]; goal: number; hoy: number }) {
  const isDark = useUiStore((s) => s.isDark);
  const addToast = useUiStore((s) => s.addToast);
  const { grid, tick, tipFg: ink, income: linea } = coloresGrafica(isDark);
  const { ref, ancho: W } = useAnchoContenedor<HTMLDivElement>();

  async function handleCSV() {
    try {
      const blob = netWorthHistoryToCsv(history);
      const outcome = await downloadBlob(blob, 'foresight-patrimonio.csv');
      if (outcome === 'cancelled') return;
      addToast(outcome === 'shared' ? 'CSV listo para compartir ✅' : 'CSV descargado ✅', 'success');
    } catch {
      addToast('Error al generar el CSV', 'error');
    }
  }

  function handlePDF() {
    try {
      imprimirPatrimonio(history);
    } catch {
      addToast('Este navegador no permite imprimir desde la app', 'error');
    }
  }
  const H = 190, padL = 52, padR = 12, padB = 26, padT = 12;
  const innerH = H - padT - padB;

  let contenido: React.ReactNode;
  if (history.length < 2) {
    contenido = (
      <EmptyState variant="compact" title={`La curva empieza a dibujarse el próximo mes. Hoy tu patrimonio es ${formatMoney(hoy)}.`} />
    );
  } else {
    const vals = history.map((h) => h.net);
    // La meta entra en la escala para que su línea se vea aunque quede lejos.
    const escala = escalaBonita(Math.min(...vals), Math.max(...vals, goal > 0 ? goal : -Infinity), 4);
    const range = escala.max - escala.min || 1;
    const stepX = (W - padL - padR) / (history.length - 1);
    const yDe = (v: number) => padT + innerH * (1 - (v - escala.min) / range);
    const pts = history.map((h, i) => [padL + i * stepX, yDe(h.net)] as const);
    const last = pts[pts.length - 1];
    contenido = (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Patrimonio neto por mes" className="block max-w-full">
        {escala.ticks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={yDe(t)} x2={W - padR} y2={yDe(t)} stroke={grid} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 3'} />
            <text x={padL - 8} y={yDe(t) + 3.5} fontSize={10} fill={tick} textAnchor="end" className="font-mono">{formatoTickDinero(t)}</text>
          </g>
        ))}
        {goal > 0 && goal <= escala.max && goal >= escala.min && (
          <line x1={padL} y1={yDe(goal)} x2={W - padR} y2={yDe(goal)} stroke={tick} strokeWidth={1} strokeDasharray="6 4" />
        )}
        <path d={trazarLinea(pts)} fill="none" stroke={linea} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.5} fill={linea}>
            <title>{monthKeyLabel(history[i].month)}: {formatMoney(history[i].net)}</title>
          </circle>
        ))}
        {history.map((h, i) =>
          history.length <= 8 || i % 2 === 0 || i === history.length - 1 ? (
            <text key={h.month} x={pts[i][0]} y={H - 8} fontSize={10} fill={tick} textAnchor="middle">
              {monthKeyLabelCorto(h.month).slice(0, 3)}
            </text>
          ) : null,
        )}
        <text x={last[0] - 6} y={Math.max(14, last[1] - 10)} fontSize={11} fontWeight={600} fill={ink} textAnchor="end" className="font-mono">
          {formatMoney(history[history.length - 1].net)}
        </text>
      </svg>
    );
  }

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader
        titulo="Evolución del patrimonio"
        sub="Se guarda solo al cierre de cada mes"
        accion={
          history.length > 0 ? (
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={handleCSV} className="saas-btn-icon text-slate-600 dark:text-slate-400" aria-label="Descargar CSV" title="Descargar CSV (Excel)">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </button>
              <button onClick={handlePDF} className="saas-btn-icon text-slate-600 dark:text-slate-400" aria-label="Guardar como PDF" title="Guardar como PDF">
                <Printer className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : undefined
        }
      />
      <div ref={ref}>{contenido}</div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0 w-4 border-t-[3px]" style={{ borderColor: linea }} />Patrimonio neto</span>
        {goal > 0 && <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: tick }} />Meta {formatMoney(goal)}</span>}
      </p>
    </div>
  );
}

/* ─── De qué se compone el patrimonio hoy ─── */
function NetWorthBreakdownCard({ nw }: { nw: NetWorth }) {
  const filas: [string, number, string][] = [
    ['Cuentas y efectivo', nw.liquid, '#1baf7a'],
    ['Otros activos', nw.manual, '#3b82f6'],
    ['Metas de ahorro', nw.goals, '#8b5cf6'],
    ['Deudas registradas', -nw.debts, '#e34948'],
    ['Saldos negativos de cuentas', -nw.accountsDebt, '#f59e0b'],
  ];
  const visibles = filas.filter(([, v]) => Math.abs(v) > 0.005);
  const max = Math.max(...visibles.map(([, v]) => Math.abs(v)), 1);

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader titulo="De qué se compone" sub="Hoy" />
      {visibles.length === 0 ? (
        <EmptyState variant="compact" title="Todavía no hay nada que medir: crea cuentas, activos o deudas." />
      ) : (
        <div className="space-y-2.5">
          {visibles.map(([label, v, color]) => (
            <div key={label}>
              <div className="flex items-center gap-2 text-xs mb-0.5">
                <span aria-hidden className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="flex-1 text-slate-700 dark:text-slate-300">{label}</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(v)}</span>
              </div>
              <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(Math.abs(v) / max) * 100}%`, backgroundColor: color }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {nw.accountsDebt > 0 && nw.debts > 0 && (
        <p className="text-2xs text-slate-600 dark:text-slate-400 mt-3">
          Si una tarjeta está registrada como cuenta con saldo negativo y además como deuda, aparecerá dos veces. Deja una sola de las dos.
        </p>
      )}
    </div>
  );
}
