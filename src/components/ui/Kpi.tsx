export type KpiTone = 'good' | 'crit';

const COLOR_POR_TONO: Record<KpiTone, string> = {
  good: 'text-income-600 dark:text-income-400',
  crit: 'text-expense-600 dark:text-expense-400',
};

/**
 * Tarjeta de indicador (etiqueta, valor y nota). El valor nunca se trunca:
 * tamaño fluido y `whitespace-nowrap`.
 */
export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: KpiTone }) {
  const color = tone ? COLOR_POR_TONO[tone] : 'text-slate-900 dark:text-white';
  return (
    <div className="saas-card p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</p>
      <p className={`text-[clamp(1rem,4.6vw,1.25rem)] md:text-xl font-bold tabular-nums mt-1 whitespace-nowrap ${color}`}>{value}</p>
      <p className="text-2xs text-slate-600 dark:text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}
