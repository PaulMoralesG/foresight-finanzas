// ================================================================
// IMPRIMIR REPORTE — window.print() en lugar de jsPDF + html2canvas
//
// Los tres paquetes que generaban el PDF pesaban 183 KB gzip diferidos.
// El navegador ya sabe hacer "Guardar como PDF" desde el diálogo de
// impresión, y en móvil ese diálogo ofrece también compartir el archivo.
//
// Cómo funciona:
//   1. Se monta ReportPrintView en un host propio, fuera de #root.
//   2. index.css, bajo @media print, oculta #root mientras exista ese host
//      y deja visible solo el reporte.
//   3. document.title pasa a ser el nombre de archivo: es de donde Chrome,
//      Safari y Firefox toman el nombre que proponen al guardar el PDF.
//   4. Al cerrar el diálogo (`afterprint`) se desmonta todo y se restaura
//      el título. Hay un respaldo por tiempo para los navegadores que no
//      disparan `afterprint` (iOS lo hace, pero no siempre al instante).
// ================================================================

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { construirReporte } from '@/lib/report-model';
import { ReportPrintView } from '@/components/features/report/ReportPrintView';
import type { Transaction } from '@/types';

export const CLASE_HOST = 'print-report-host';

/** Respaldo si `afterprint` no llega: tiempo de sobra para un diálogo de
 *  impresión abierto, y lo bastante corto para no dejar basura en el DOM. */
const LIMPIEZA_RESPALDO_MS = 5 * 60 * 1000;

/**
 * Abre el diálogo de impresión con el reporte del periodo. Devuelve cuando
 * el diálogo se ha lanzado, no cuando el usuario termina: el navegador no
 * cuenta si guardó, imprimió o canceló.
 */
export function imprimirReporte(movimientos: Transaction[], viewDate: Date, label = ''): void {
  const reporte = construirReporte(movimientos, viewDate, label);

  const host = document.createElement('div');
  host.className = CLASE_HOST;
  document.body.appendChild(host);

  const root = createRoot(host);
  // Síncrono a propósito: window.print() captura la página tal como está
  // en este instante, y con un render diferido saldría el host vacío.
  flushSync(() => {
    root.render(<ReportPrintView reporte={reporte} />);
  });

  const tituloOriginal = document.title;
  document.title = reporte.archivo;

  let limpiado = false;
  const limpiar = () => {
    if (limpiado) return;
    limpiado = true;
    clearTimeout(respaldo);
    window.removeEventListener('afterprint', limpiar);
    document.title = tituloOriginal;
    root.unmount();
    host.remove();
  };
  window.addEventListener('afterprint', limpiar);
  const respaldo = setTimeout(limpiar, LIMPIEZA_RESPALDO_MS);

  try {
    window.print();
  } catch (err: unknown) {
    // Algún WebView sin soporte de impresión: no dejar la app tapada.
    limpiar();
    throw err instanceof Error ? err : new Error(String(err));
  }
}
