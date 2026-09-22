// ================================================================
// NetWorthPrintView — Evolución del patrimonio en HTML, para @media print
// ================================================================

import { formatMoney } from '@/lib/utils';
import { monthKeyLabel } from '@/lib/month-keys';
import type { NetWorthSnapshot } from '@/types';

interface Props {
  history: NetWorthSnapshot[];
  generado: string;
}

export function NetWorthPrintView({ history, generado }: Props) {
  const ultimo = history[history.length - 1];

  return (
    <article className="print-report font-sans text-slate-900">
      <header className="mb-4 border-b border-slate-300 pb-2">
        <h1 className="font-display text-xl font-semibold">Patrimonio</h1>
      </header>

      {ultimo && (
        <dl className="mb-4 text-sm">
          <div>
            <dt className="inline text-slate-500">Patrimonio neto actual ({monthKeyLabel(ultimo.month)}): </dt>
            <dd className="inline font-mono font-semibold tabular-nums">{formatMoney(ultimo.net)}</dd>
          </div>
        </dl>
      )}

      {history.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay cierres mensuales de patrimonio.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-400 text-left">
              <th className="py-1 pr-2 font-semibold">Mes</th>
              <th className="py-1 pr-2 text-right font-semibold">Activos</th>
              <th className="py-1 pr-2 text-right font-semibold">Pasivos</th>
              <th className="py-1 text-right font-semibold">Neto</th>
            </tr>
          </thead>
          <tbody>
            {history.map((s) => (
              <tr key={s.month} className="border-b border-slate-200 align-top">
                <td className="whitespace-nowrap py-1 pr-2">{monthKeyLabel(s.month)}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right font-mono tabular-nums">{formatMoney(s.assets)}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right font-mono tabular-nums">{formatMoney(s.liabilities)}</td>
                <td className="whitespace-nowrap py-1 text-right font-mono tabular-nums">{formatMoney(s.net)}</td>
              </tr>
            ))}
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
