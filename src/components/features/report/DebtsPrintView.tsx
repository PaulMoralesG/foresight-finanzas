// ================================================================
// DebtsPrintView — Lista de deudas en HTML, para @media print
// ================================================================

import { formatMoney } from '@/lib/utils';
import type { Debt } from '@/types';

interface Props {
  debts: Debt[];
  totalBalance: number;
  generado: string;
}

export function DebtsPrintView({ debts, totalBalance, generado }: Props) {
  return (
    <article className="print-report font-sans text-slate-900">
      <header className="mb-4 border-b border-slate-300 pb-2">
        <h1 className="font-display text-xl font-semibold">Deudas</h1>
      </header>

      <dl className="mb-4 text-sm">
        <div>
          <dt className="inline text-slate-500">Saldo total: </dt>
          <dd className="inline font-mono font-semibold tabular-nums">{formatMoney(totalBalance)}</dd>
        </div>
      </dl>

      {debts.length === 0 ? (
        <p className="text-sm text-slate-500">No hay deudas registradas.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-400 text-left">
              <th className="py-1 pr-2 font-semibold">Nombre</th>
              <th className="py-1 pr-2 font-semibold">Ámbito</th>
              <th className="py-1 pr-2 font-semibold">Tipo</th>
              <th className="py-1 pr-2 text-right font-semibold">Saldo</th>
              <th className="py-1 pr-2 text-right font-semibold">Interés</th>
              <th className="py-1 text-right font-semibold">Pago mínimo</th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.id} className="border-b border-slate-200 align-top">
                <td className="py-1 pr-2">{d.name}</td>
                <td className="py-1 pr-2">{d.tag === 'personal' ? 'Personal' : 'Negocio'}</td>
                <td className="py-1 pr-2">{d.kind}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right font-mono tabular-nums">{formatMoney(d.balance)}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right font-mono tabular-nums">{d.annualRate}%</td>
                <td className="whitespace-nowrap py-1 text-right font-mono tabular-nums">{formatMoney(d.minPayment)}</td>
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
