// ================================================================
// IMPRIMIR PRESUPUESTO — "Presupuestado vs. real" a PDF vía window.print()
// ================================================================

import { BudgetsPrintView } from '@/components/features/report/BudgetsPrintView';
import { imprimirVista } from '@/lib/print';
import { generadoAhora } from '@/lib/utils';
import type { GroupSummary } from '@/lib/budget-lines';

export function imprimirPresupuesto(resumen: GroupSummary, monthLabel: string, monthKey: string): void {
  imprimirVista(
    <BudgetsPrintView resumen={resumen} monthLabel={monthLabel} generado={generadoAhora()} />,
    `foresight-presupuesto-${monthKey}`,
  );
}
