// ================================================================
// MonthNav — Navegación de mes reutilizable para páginas
//   Tocar el nombre del mes (cuando no es el actual) vuelve al mes actual.
// ================================================================

import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { MONTH_NAMES } from '@/lib/utils';

interface MonthNavProps {
  /** Si es true, muestra también el botón de reporte PDF */
  showReport?: boolean;
}

export function MonthNav({ showReport = false }: MonthNavProps) {
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const setViewDate = useFinanceStore((s) => s.setViewDate);
  const openReportModal = useUiStore((s) => s.openReportModal);

  const d = new Date(currentViewDate);
  const monthLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

  const now = new Date();
  const isCurrentMonth =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();

  // Volver al mes actual: diferencia en meses entre la vista y hoy
  const goToCurrentMonth = () => {
    if (isCurrentMonth) return;
    const diff =
      (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    setViewDate(diff);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setViewDate(-1)}
        className="saas-btn-icon"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={goToCurrentMonth}
        disabled={isCurrentMonth}
        className={`relative text-sm font-semibold min-w-[110px] text-center select-none rounded-md px-2 py-1 transition-colors ${
          isCurrentMonth
            ? 'text-slate-700 dark:text-slate-300 cursor-default'
            : 'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950 cursor-pointer'
        }`}
        aria-label={isCurrentMonth ? monthLabel : `Volver al mes actual (${monthLabel})`}
        title={isCurrentMonth ? monthLabel : 'Volver al mes actual'}
      >
        {monthLabel}
        {/* Dot indicador: hay meses de distancia con la vista actual */}
        {!isCurrentMonth && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-brand-400" />
        )}
      </button>
      <button
        onClick={() => setViewDate(1)}
        className="saas-btn-icon"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      {showReport && (
        <button
          onClick={openReportModal}
          className="saas-btn-secondary ml-1"
          aria-label="Generar reporte PDF"
          title="Reporte PDF mensual"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="inline ml-1.5 text-xs">Reporte</span>
        </button>
      )}
    </div>
  );
}
