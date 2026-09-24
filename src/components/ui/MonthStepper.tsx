// ================================================================
// MonthStepper — Control «‹ Mes Año ›» con vuelta al mes actual
//
// Estaba escrito dos veces con el mismo marcado carácter por carácter: en
// MonthNav, atado a `currentViewDate` del store, y en el editor de presupuesto
// de Planes, atado a un `monthKey` local. Al no poder compartir el estado, se
// duplicó la presentación —incluido el punto azul de «no estás en el mes
// actual», que es una señal que conviene que signifique lo mismo en todas las
// pantallas—.
//
// Aquí vive solo la presentación; cada pantalla le pasa su propio origen.
// ================================================================

import { ChevronLeft, ChevronRight } from '@/components/ui/icons.generated';
import type { ReactNode } from 'react';

interface MonthStepperProps {
  /** Texto del mes ya formateado ('Agosto 2026', 'Ago 2026'…). */
  label: string;
  /** El mes mostrado es el mes en curso: se desactiva la vuelta atrás. */
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Volver al mes actual. Solo se invoca cuando `isCurrent` es false. */
  onCurrent: () => void;
  /** Contenido extra a la derecha (botón de reporte, emoji de estado…). */
  children?: ReactNode;
}

export function MonthStepper({
  label,
  isCurrent,
  onPrev,
  onNext,
  onCurrent,
  children,
}: MonthStepperProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onPrev} className="saas-btn-icon" aria-label="Mes anterior">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onCurrent}
        disabled={isCurrent}
        className={`saas-hit relative text-sm font-semibold min-w-[110px] text-center select-none rounded-md px-2 py-1 transition-colors ${
          isCurrent
            ? 'text-slate-700 dark:text-slate-300 cursor-default'
            : 'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950 cursor-pointer'
        }`}
        aria-label={isCurrent ? label : `Volver al mes actual (${label})`}
        title={isCurrent ? label : 'Volver al mes actual'}
      >
        {label}
        {/* Punto indicador: la vista está a meses de distancia del mes en curso */}
        {!isCurrent && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-brand-400" />
        )}
      </button>

      <button onClick={onNext} className="saas-btn-icon" aria-label="Mes siguiente">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {children}
    </div>
  );
}
