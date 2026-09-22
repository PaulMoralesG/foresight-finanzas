// ================================================================
// MonthInsights — lo que vivía en Estadísticas, ahora en Resumen
//
// Balance Dual no tiene pestaña de estadísticas: sus gráficos están en
// el Resumen y la matriz anual en Presupuestos. Aquí van el gráfico de
// evolución (seis meses que terminan en el mes visible), el mayor gasto
// y el día de mayor gasto. Todo para el mes visible del dashboard; el
// filtro por rango de fechas de la antigua página se retiró.
// ================================================================

import { TrendingUp } from '@/components/ui/icons.generated';
import { useUiStore } from '@/stores/uiStore';
import { formatMoney, LOCALE, safeParseDate } from '@/lib/utils';
import { getCategoryById } from '@/config/categories';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendChart } from '@/components/features/stats/TrendChart';
import type { PuntoTendencia } from '@/hooks/useStatsPeriod';
import type { Category, Transaction } from '@/types';

interface Props {
  trendData: PuntoTendencia[];
  largestExpense: Transaction | null;
  peakDay: { date: string; amount: number } | null;
  peakDayTransactions: Transaction[];
  allCustomCats: Category[];
}

const fechaLarga = (iso: string) =>
  safeParseDate(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

const metodo = (m: Transaction['method']) =>
  m === 'cash' ? '💵 Efectivo' : m === 'card' ? '💳 Tarjeta' : '🏦 Transferencia';

export function TrendCard({ trendData }: { trendData: PuntoTendencia[] }) {
  const isDark = useUiStore((s) => s.isDark);
  // Colores resueltos aquí porque los atributos fill/stroke del SVG no
  // entienden clases (ver TrendChart). Mismos valores que tenía Estadísticas.
  const chart = {
    tick: isDark ? '#a3a099' : '#5f5e58',
    grid: isDark ? '#4a4944' : '#e6e4dd',
    tipBg: isDark ? '#232320' : '#ffffff',
    tipFg: isDark ? '#f3f2ee' : '#1a1a19',
    tipLabel: isDark ? '#cfccc2' : '#4a4944',
    income: '#1baf7a',
    expense: '#e34948',
    balance: isDark ? '#cfccc2' : '#4a4944',
  };

  return (
    <div className="saas-card p-4 animate-slide-up">
      <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-0.5">Evolución</h2>
      <p className="text-2xs text-slate-500 dark:text-slate-400 mb-2">Ingresos, gastos y balance de los últimos seis meses</p>
      {trendData.every((d) => d.Ingresos === 0 && d.Gastos === 0) ? (
        <EmptyState variant="compact" icon={TrendingUp} title="Sin datos para mostrar tendencia" />
      ) : (
        <TrendChart data={trendData} colors={chart} />
      )}
    </div>
  );
}

export function HighlightsCard({ largestExpense, peakDay, peakDayTransactions, allCustomCats }: Omit<Props, 'trendData'>) {
  return (
    <div className="saas-card p-4 animate-slide-up space-y-4">
      <section>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Mayor gasto</h2>
        {largestExpense ? (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">{getCategoryById(largestExpense.category, allCustomCats)?.icon || '💸'}</span>
              <div>
                <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400">
                  {getCategoryById(largestExpense.category, allCustomCats)?.label || largestExpense.category}
                </p>
                <p className="text-base font-bold text-expense-600 dark:text-expense-400 tabular-nums">
                  {formatMoney(largestExpense.amount)}
                </p>
              </div>
            </div>
            <div className="pl-9 space-y-0.5">
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{largestExpense.concept || 'Sin concepto'}</p>
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                {fechaLarga(largestExpense.date)} · {metodo(largestExpense.method)}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState variant="compact" title="Sin gastos este mes" />
        )}
      </section>

      {/* Si el día pico es un único movimiento, es el mismo "mayor gasto" de
          arriba: repetir la cifra no aporta nada. Solo se muestra cuando el
          día suma varios movimientos. */}
      {peakDay && !(peakDayTransactions.length === 1 && largestExpense && peakDayTransactions[0].id === largestExpense.id) && (
      <section className="pt-3 border-t border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Día de mayor gasto</h2>
        {peakDay ? (
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{fechaLarga(peakDay.date)}</p>
            <p className="text-base font-bold text-expense-600 dark:text-expense-400 tabular-nums mt-0.5">
              {formatMoney(peakDay.amount)}
            </p>
            {peakDayTransactions.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {peakDayTransactions.length} mov.
                </p>
                {peakDayTransactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex-shrink-0">{getCategoryById(t.category, allCustomCats)?.icon || '💸'}</span>
                      <span className="text-slate-700 dark:text-slate-300 truncate">{t.concept || 'Sin concepto'}</span>
                    </div>
                    <span className="text-expense-600 dark:text-expense-400 font-semibold tabular-nums ml-2 flex-shrink-0">
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState variant="compact" title="Sin gastos este mes" />
        )}
      </section>
      )}
    </div>
  );
}
