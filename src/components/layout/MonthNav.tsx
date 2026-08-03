// ================================================================
// MonthNav — Navegación de mes reutilizable para páginas
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

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setViewDate(-1)}
        className="saas-btn-icon"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="text-xs" />
      </button>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[110px] text-center select-none">
        {monthLabel}
      </span>
      <button
        onClick={() => setViewDate(1)}
        className="saas-btn-icon"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="text-xs" />
      </button>
      {showReport && (
        <button
          onClick={openReportModal}
          className="saas-btn-secondary ml-1"
          aria-label="Generar reporte PDF"
          title="Reporte PDF mensual"
        >
          <FileText className="text-xs" />
          <span className="inline ml-1.5 text-xs">Reporte</span>
        </button>
      )}
    </div>
  );
}
