// ================================================================
// BudgetProgress — Estado del presupuesto del mes
//
// El mismo bloque estaba escrito dos veces, carácter por carácter, en el
// widget del dashboard (HomePage) y en el editor de Planes (SavingsPage):
// el mismo ternario triple para el color del porcentaje, la misma pista con
// su anillo rojo al pasarse y el mismo aviso de excedido. Dos copias de una
// regla de negocio visual —a partir de qué % se avisa y con qué color— es
// justo el sitio donde acaban divergiendo.
// ================================================================

import { AlertCircle } from 'lucide-react';
import { formatMoney } from '@/lib/utils';

interface BudgetProgressProps {
  /** Gasto acumulado del mes. */
  monthSpent: number;
  /** Presupuesto vigente (propio o heredado). */
  budget: number;
  /** Porcentaje gastado (puede pasar de 100). */
  pct: number;
  /** Clase de color de la barra, de useBudget. */
  colorBar: string;
  /** Mensaje de estado legible, de useBudget. */
  message?: string;
  /** Muestra el aviso de excedido con icono además del texto. */
  destacarExcedido?: boolean;
}

/** Sobre 100% el bloque entero pasa a rojo: es la única señal que hay que ver. */
function tonoPorcentaje(pct: number): string {
  if (pct > 100) return 'text-red-600 dark:text-red-400';
  if (pct > 90) return 'text-orange-600 dark:text-orange-400';
  return 'text-slate-600 dark:text-slate-400';
}

export function BudgetProgress({
  monthSpent,
  budget,
  pct,
  colorBar,
  message,
  destacarExcedido = false,
}: BudgetProgressProps) {
  const excedido = pct > 100;

  return (
    <div className="space-y-2.5">
      {excedido && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800">
          {destacarExcedido && <AlertCircle className="text-red-600 dark:text-red-400 w-4 h-4 flex-shrink-0" />}
          <span className="text-xs font-bold text-red-700 dark:text-red-400">
            {destacarExcedido ? '¡Presupuesto excedido' : '¡Excedido'} por {formatMoney(monthSpent - budget)}!
          </span>
        </div>
      )}

      <div className="flex justify-between text-xs">
        <span className={`font-semibold ${excedido ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
          {formatMoney(monthSpent)} de {formatMoney(budget)}
        </span>
        <span className={`font-bold text-sm ${tonoPorcentaje(pct)}`}>{pct}%</span>
      </div>

      <div
        className={`h-2.5 rounded-full overflow-hidden ${
          excedido
            ? 'bg-red-100 dark:bg-red-950/80 ring-1 ring-red-300 dark:ring-red-800'
            : 'bg-slate-100 dark:bg-slate-800'
        }`}
      >
        <div
          className={`h-full ${colorBar} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {message && <p className={`text-xs font-medium ${tonoPorcentaje(pct)}`}>{message}</p>}
    </div>
  );
}
