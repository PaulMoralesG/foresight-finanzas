// ================================================================
// RecurrencesPanel — las reglas de movimientos que se repiten
//
// Vive como sub-pestaña de Movimientos y no como una novena vista: el
// catálogo de ocho (src/config/views.ts) se queda como está.
//
// Lo que se puede hacer aquí es pausar, reanudar y eliminar. Editar el
// importe o el concepto de una regla se hace borrándola y creando otra: una
// regla es una plantilla, no un movimiento, y cambiarla a mitad de camino
// dejaría el historial ya generado sin explicación.
// ================================================================

import { useMemo, useState } from 'react';
import { Trash2, RefreshCw } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ScopeBadge } from '@/components/ui/TransactionBits';
import { CardHeader } from '@/components/ui/CardHeader';
import { describirRegla, proximaFecha } from '@/lib/recurrence';
import { filtrarPorAmbito } from '@/lib/ambito';
import { useAmbito } from '@/hooks/useAmbito';
import { formatMoney, getTodayISO, safeParseDate, syncToCloud, LOCALE } from '@/lib/utils';
import { getCategoryById } from '@/config/categories';
import type { Recurrence } from '@/types';

/** '2026-10-03' → '3 oct 2026'; en la lista, la ISO no se lee de un vistazo. */
function fechaCorta(iso: string): string {
  return safeParseDate(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function RecurrencesPanel() {
  const recurrences = useFinanceStore((s) => s.recurrences);
  const updateRecurrence = useFinanceStore((s) => s.updateRecurrence);
  const deleteRecurrence = useFinanceStore((s) => s.deleteRecurrence);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();
  const ambito = useAmbito();
  const [confirmDelete, setConfirmDelete] = useState<Recurrence | null>(null);
  // Solo guarda una entrada mientras el campo "Día del mes" de esa fila está
  // en edición; el resto de las filas leen el valor directo de `r.diaMes`.
  const [diaInputs, setDiaInputs] = useState<Record<string, string>>({});

  function diaValue(r: Recurrence): string {
    return diaInputs[r.id] ?? String(r.diaMes ?? '');
  }

  function commitDia(r: Recurrence) {
    if (!(r.id in diaInputs)) return;
    const n = Math.round(Number(diaInputs[r.id]));
    if (Number.isFinite(n) && n >= 1 && n <= 31 && n !== r.diaMes) {
      updateRecurrence(r.id, { diaMes: n });
      addToast('Día actualizado ✅', 'success');
      syncToCloud(saveData, addToast);
    } else if (!Number.isFinite(n) || n < 1 || n > 31) {
      addToast('El día debe estar entre 1 y 31', 'error');
    }
    setDiaInputs((prev) => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
  }

  const customCats = useMemo(
    () => [...customExpenseCategories, ...customIncomeCategories],
    [customExpenseCategories, customIncomeCategories],
  );
  const lista = useMemo(
    () => filtrarPorAmbito(recurrences, ambito, (r) => r.businessType),
    [recurrences, ambito],
  );
  const hoy = getTodayISO();

  const alternar = (r: Recurrence) => {
    updateRecurrence(r.id, { activa: !r.activa });
    addToast(r.activa ? 'Repetición pausada' : 'Repetición reanudada', 'info');
    syncToCloud(saveData, addToast);
  };

  const eliminar = () => {
    if (!confirmDelete) return;
    deleteRecurrence(confirmDelete.id);
    setConfirmDelete(null);
    addToast('Repetición eliminada. Los movimientos ya registrados se quedan.', 'info');
    syncToCloud(saveData, addToast);
  };

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader
        titulo="Movimientos recurrentes"
        sub="Se registran solos cuando llega su fecha. Al abrir la app se ponen al día."
      />

      {lista.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={RefreshCw}
          title="No hay reglas en este ámbito"
          description="Elige «Todo» arriba para ver las de Personal y Negocio juntas."
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {lista.map((r) => {
            const cat = getCategoryById(r.category, customCats);
            const proxima = proximaFecha(r, hoy);
            return (
              <li key={r.id} className="py-2.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                    <span aria-hidden>{cat.icon}</span>
                    {r.concept || cat.label}
                    <ScopeBadge businessType={r.businessType} />
                    {!r.activa && (
                      <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        En pausa
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {describirRegla(r)}
                    {r.activa && proxima ? ` · próxima el ${fechaCorta(proxima)}` : ''}
                    {r.hasta ? ` · hasta ${fechaCorta(r.hasta)}` : ''}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {r.frecuencia === 'monthly' && (
                      <div className="flex items-center gap-1.5">
                        <label htmlFor={`dia-${r.id}`} className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Día del mes
                        </label>
                        <input
                          id={`dia-${r.id}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={31}
                          value={diaValue(r)}
                          onChange={(e) => setDiaInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          onBlur={() => commitDia(r)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="saas-input-sm text-xs tabular-nums !w-14"
                        />
                      </div>
                    )}
                    <button onClick={() => alternar(r)} className="saas-btn saas-btn-secondary saas-btn-sm text-xs">
                      {r.activa ? 'Pausar' : 'Reanudar'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(r)}
                      className="saas-btn saas-btn-ghost saas-btn-sm text-xs flex items-center gap-1 text-expense-600 dark:text-expense-400"
                      aria-label={`Eliminar la repetición de ${r.concept || cat.label}`}
                    >
                      <Trash2 className="w-3 h-3" /> Eliminar
                    </button>
                  </div>
                </div>
                <p className={`text-sm font-bold tabular-nums w-full sm:w-auto ${r.type === 'income' ? 'text-income-600 dark:text-income-400' : 'text-slate-900 dark:text-white'}`}>
                  {r.type === 'income' ? '+' : r.type === 'expense' ? '−' : ''}{formatMoney(r.amount)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="¿Dejar de repetir este movimiento?"
        message={confirmDelete ? `No se volverá a registrar "${confirmDelete.concept}". Los movimientos que ya creó se quedan como están.` : ''}
        confirmLabel="Dejar de repetir"
        variant="danger"
        onConfirm={eliminar}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
