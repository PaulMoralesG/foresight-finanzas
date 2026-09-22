// ================================================================
// IMPRIMIR VISTA — window.print() genérico, sin jsPDF ni html2canvas
//
// Extraído de print-report.tsx cuando el mismo mecanismo empezó a hacerle
// falta a Presupuestos, Deudas y Patrimonio: montar cualquier vista fuera de
// #root, ponerle el nombre de archivo como document.title y abrir el diálogo
// de impresión del navegador ("Guardar como PDF"). Los detalles de qué se
// imprime (tabla de presupuesto, de deudas, de patrimonio...) viven en cada
// lib/print-*.tsx; este archivo solo sabe montar, imprimir y limpiar.
// ================================================================

import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

export const CLASE_HOST = 'print-report-host';

/** Respaldo si `afterprint` no llega: tiempo de sobra para un diálogo de
 *  impresión abierto, y lo bastante corto para no dejar basura en el DOM. */
const LIMPIEZA_RESPALDO_MS = 5 * 60 * 1000;

/**
 * Abre el diálogo de impresión con `vista` montada fuera de #root. Devuelve
 * cuando el diálogo se ha lanzado, no cuando el usuario termina: el navegador
 * no cuenta si guardó, imprimió o canceló.
 */
export function imprimirVista(vista: ReactNode, nombreArchivo: string): void {
  const host = document.createElement('div');
  host.className = CLASE_HOST;
  document.body.appendChild(host);

  const root = createRoot(host);
  // Síncrono a propósito: window.print() captura la página tal como está en
  // este instante, y con un render diferido saldría el host vacío.
  flushSync(() => {
    root.render(vista);
  });

  const tituloOriginal = document.title;
  document.title = nombreArchivo;

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
