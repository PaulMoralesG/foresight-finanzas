// ================================================================
// IMPRIMIR PATRIMONIO — evolución mensual a PDF vía window.print()
// ================================================================

import { NetWorthPrintView } from '@/components/features/report/NetWorthPrintView';
import { imprimirVista } from '@/lib/print';
import { generadoAhora } from '@/lib/utils';
import type { NetWorthSnapshot } from '@/types';

export function imprimirPatrimonio(history: NetWorthSnapshot[]): void {
  imprimirVista(<NetWorthPrintView history={history} generado={generadoAhora()} />, 'foresight-patrimonio');
}
