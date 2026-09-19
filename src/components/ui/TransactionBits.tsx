// ================================================================
// Piezas compartidas de una transacción
//
// La fila entera NO se comparte a propósito: la de Movimientos lleva casilla
// de selección múltiple y celdas que filtran al pulsarlas, y la del dashboard
// es solo lectura. Un componente con cuatro comportamientos opcionales sería
// una abstracción más fina que la duplicación que quita.
//
// Lo que sí tiene que coincidir sí o sí son estos tres átomos: el signo y el
// color del importe, el ámbito y el tipo. Están repetidos entre las cuatro
// vistas —tabla y tarjeta, en dos páginas— y son justo donde una divergencia
// se ve: un gasto en verde, o un «-» donde antes había un «−».
// ================================================================

import { formatMoney } from '@/lib/utils';
import type { BusinessType, TransactionType } from '@/types';

/** Importe con signo y color según sea ingreso o gasto. */
export function TransactionAmount({
  type,
  amount,
  className = '',
}: {
  type: TransactionType;
  amount: number;
  className?: string;
}) {
  const esIngreso = type === 'income';
  return (
    <span
      className={`tabular-nums ${
        esIngreso
          ? 'text-income-600 dark:text-income-400'
          : 'text-expense-600 dark:text-expense-400'
      } ${className}`}
    >
      {/* Signo menos real (U+2212), no un guion: se alinea con los dígitos
          tabulares y tiene el mismo ancho que el «+». */}
      {esIngreso ? '+' : '−'}
      {formatMoney(amount)}
    </span>
  );
}

/**
 * Negocio / Personal. Un ámbito ausente cuenta como Negocio, igual que en el CSV.
 *
 * "Negocio" va en terracota (paleta `business` de tailwind.config.js), no en
 * el verde de acción primaria: antes compartía color con cualquier botón de
 * "acción", así que un badge de dato y un control interactivo se confundían
 * a primera vista. Los chips de filtro (Todos/Ingresos/Gastos/Negocio/
 * Personal) siguen en verde a propósito — ahí el verde significa "activo", no
 * "es de negocio", y es un sistema distinto.
 */
export function ScopeBadge({ businessType }: { businessType: BusinessType }) {
  return businessType === 'personal' ? (
    <span className="saas-badge-slate text-2xs">Personal</span>
  ) : (
    <span className="saas-badge-business text-2xs">Negocio</span>
  );
}

/**
 * Ingreso / Gasto. El color y la etiqueta salen de aquí; la geometría la pone
 * quien llama, porque en la tabla es una píldora y en la tarjeta un chip más
 * pequeño.
 *
 * En Movimientos NO se usa: allí la píldora *es* el botón que filtra por tipo,
 * y meterle un span dentro duplicaría los rellenos. Dos de cuatro sitios es
 * lo que este componente puede unificar sin retorcerse.
 */
export function TypePill({
  type,
  className = 'text-xs px-2 py-0.5 rounded-full',
}: {
  type: TransactionType;
  className?: string;
}) {
  return (
    <span
      className={`font-medium ${
        type === 'income'
          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
          : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
      } ${className}`}
    >
      {type === 'income' ? 'Ingreso' : 'Gasto'}
    </span>
  );
}
