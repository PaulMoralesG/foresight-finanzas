// ================================================================
// ReportPrintView — el reporte en HTML, pensado para @media print
//
// Se monta fuera de #root (ver lib/print-report) y solo se ve al imprimir;
// index.css oculta la app mientras este host exista. Por eso no lleva
// variantes dark:: el papel es blanco aunque la app esté en oscuro.
// ================================================================

import { formatMoney } from '@/lib/utils';
import type { Reporte } from '@/lib/report-model';

interface Props {
  reporte: Reporte;
}

export function ReportPrintView({ reporte }: Props) {
  const { titulo, totales, filas, generado } = reporte;

  return (
    <article className="print-report font-sans text-slate-900">
      <header className="mb-4 border-b border-slate-300 pb-2">
        <h1 className="font-display text-xl font-semibold">{titulo}</h1>
      </header>

      <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div>
          <dt className="inline text-slate-500">Saldo final: </dt>
          <dd className="inline font-mono font-semibold tabular-nums">{formatMoney(totales.saldo)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Ingresos: </dt>
          <dd className="inline font-mono tabular-nums">{formatMoney(totales.ingresos)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Gastos: </dt>
          <dd className="inline font-mono tabular-nums">{formatMoney(totales.gastos)}</dd>
        </div>
      </dl>

      {filas.length === 0 ? (
        <p className="text-sm text-slate-500">No hay movimientos registrados en este período.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-400 text-left">
              <th className="py-1 pr-2 font-semibold">Fecha</th>
              <th className="py-1 pr-2 font-semibold">Tipo</th>
              <th className="py-1 pr-2 font-semibold">Ámbito</th>
              <th className="py-1 pr-2 text-right font-semibold">Monto</th>
              <th className="py-1 font-semibold">Concepto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-b border-slate-200 align-top">
                <td className="whitespace-nowrap py-1 pr-2 font-mono tabular-nums">{f.fecha}</td>
                <td className="py-1 pr-2">{f.tipo}</td>
                <td className="py-1 pr-2">{f.ambito}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right font-mono tabular-nums">{f.monto}</td>
                <td className="py-1">{f.concepto}</td>
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
