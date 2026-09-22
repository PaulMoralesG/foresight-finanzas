// ================================================================
// IMPRIMIR REPORTE — window.print() en lugar de jsPDF + html2canvas
//
// Los tres paquetes que generaban el PDF pesaban 183 KB gzip diferidos.
// El navegador ya sabe hacer "Guardar como PDF" desde el diálogo de
// impresión, y en móvil ese diálogo ofrece también compartir el archivo.
//
// El mecanismo de montar-fuera-de-#root-e-imprimir vive en lib/print.tsx
// (lo empezaron a necesitar también Presupuestos, Deudas y Patrimonio); este
// archivo solo arma la vista concreta del reporte de movimientos.
// ================================================================

import { construirReporte } from '@/lib/report-model';
import { ReportPrintView } from '@/components/features/report/ReportPrintView';
import { imprimirVista } from '@/lib/print';
import type { Transaction } from '@/types';

/**
 * Abre el diálogo de impresión con el reporte del periodo. Devuelve cuando
 * el diálogo se ha lanzado, no cuando el usuario termina: el navegador no
 * cuenta si guardó, imprimió o canceló.
 */
export function imprimirReporte(movimientos: Transaction[], viewDate: Date, label = ''): void {
  const reporte = construirReporte(movimientos, viewDate, label);
  imprimirVista(<ReportPrintView reporte={reporte} />, reporte.archivo);
}
