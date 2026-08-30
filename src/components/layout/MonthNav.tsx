// ================================================================
// MonthNav — Navegación de mes ligada al mes visto en el store
//   Tocar el nombre del mes (cuando no es el actual) vuelve al mes actual.
//   La presentación vive en MonthStepper, compartida con el editor de
//   presupuesto de Planes, que navega por su propio monthKey.
// ================================================================

import { FileText } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { MONTH_NAMES } from '@/lib/utils';
import { MonthStepper } from '@/components/ui/MonthStepper';

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
    <MonthStepper
      label={monthLabel}
      isCurrent={isCurrentMonth}
      onPrev={() => setViewDate(-1)}
      onNext={() => setViewDate(1)}
      onCurrent={goToCurrentMonth}
    >
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
    </MonthStepper>
  );
}
