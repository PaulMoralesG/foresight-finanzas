// ================================================================
// BudgetsPrintView — "Presupuestado vs. real" en HTML, para @media print
//
// Mismo mecanismo que ReportPrintView: se monta fuera de #root (ver
// lib/print-budgets) y solo se ve al imprimir.
// ================================================================

import { formatMoney } from '@/lib/utils';
import type { GroupSummary } from '@/lib/budget-lines';

interface Props {
  resumen: GroupSummary;
  monthLabel: string;
  generado: string;
}

export function BudgetsPrintView({ resumen, monthLabel, generado }: Props) {
  const ingresos = resumen.rows.filter((r) => r.kind === 'income');
  const gastos = resumen.rows.filter((r) => r.kind === 'expense');

  const seccion = (titulo: string, filas: GroupSummary['rows']) =>
    filas.length === 0 ? null : (
      <>
        <tr>
          <td colSpan={4} className="pt-3 pb-1 font-semibold uppercase tracking-wider text-2xs text-slate-500">
            {titulo}
          </td>
        </tr>
        {filas.map((r) => (
          <tr key={r.kind + r.group} className="border-b border-slate-200 align-top">
            <td className="py-1 pr-2">{r.group}</td>
            <td className="whitespace-nowrap py-1 pr-2 text-right font-mono tabular-nums">
              {r.planned ? formatMoney(r.planned) : '—'}
            </td>
            <td className="whitespace-nowrap py-1 pr-2 text-right font-mono tabular-nums">{formatMoney(r.actual)}</td>
            <td className="whitespace-nowrap py-1 text-right font-mono tabular-nums">{formatMoney(r.diff)}</td>
          </tr>
        ))}
      </>
    );

  return (
    <article className="print-report font-sans text-slate-900">
      <header className="mb-4 border-b border-slate-300 pb-2">
        <h1 className="font-display text-xl font-semibold">Presupuestado vs. real</h1>
        <p className="text-sm text-slate-600">{monthLabel}</p>
      </header>

      <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div>
          <dt className="inline text-slate-500">Resultado presupuestado: </dt>
          <dd className="inline font-mono font-semibold tabular-nums">{formatMoney(resumen.planResult)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Resultado real: </dt>
          <dd className="inline font-mono font-semibold tabular-nums">{formatMoney(resumen.realResult)}</dd>
        </div>
      </dl>

      {resumen.rows.length === 0 ? (
        <p className="text-sm text-slate-500">Sin presupuestos ni movimientos en este mes.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-400 text-left">
              <th className="py-1 pr-2 font-semibold">Grupo</th>
              <th className="py-1 pr-2 text-right font-semibold">Presupuestado</th>
              <th className="py-1 pr-2 text-right font-semibold">Real</th>
              <th className="py-1 text-right font-semibold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {seccion('Ingresos', ingresos)}
            {seccion('Gastos', gastos)}
          </tbody>
        </table>
      )}

      <footer className="mt-6 flex justify-between border-t border-slate-200 pt-2 text-2xs text-slate-500">
        <span>{generado}</span>
        <span>Foresight</span>
      </footer>
    </article>
  );
}
