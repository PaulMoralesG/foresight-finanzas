// ================================================================
// MODELO DEL REPORTE — la parte pura de lo que antes armaba jsPDF
//
// Convierte los movimientos de un periodo en lo que el reporte muestra:
// título, totales, filas ya formateadas y el nombre de archivo que el
// navegador propone al "Guardar como PDF". Sin DOM: lo dibuja
// ReportPrintView y lo imprime lib/print-report.
// ================================================================

import { formatMoney, LOCALE, roundMoney, safeParseDate, sortByDateAsc } from './utils';
import type { Transaction } from '@/types';

export interface FilaReporte {
  fecha: string;
  tipo: 'Ingreso' | 'Gasto' | 'Transferencia';
  ambito: 'Personal' | 'Negocio';
  monto: string;
  concepto: string;
}

export interface Reporte {
  titulo: string;
  /** Nombre base del archivo, sin extensión: va a `document.title` mientras
   *  se imprime, que es de donde el navegador saca el nombre del PDF. */
  archivo: string;
  totales: { ingresos: number; gastos: number; saldo: number };
  filas: FilaReporte[];
  /** "Generado el 21/9/2026 a las 11:58" */
  generado: string;
}

export function construirReporte(movimientos: Transaction[], viewDate: Date, label = ''): Reporte {
  // Ordenar aquí dentro y no solo en quien llama: así CUALQUIER reporte sale
  // cronológico. El orden del store es de última edición, no de fecha.
  const ordenados = sortByDateAsc(movimientos);

  const ingresos = roundMoney(ordenados.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0));
  const gastos = roundMoney(ordenados.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0));
  const saldo = roundMoney(ingresos - gastos);

  const anio = viewDate.getFullYear();
  const mes = String(viewDate.getMonth() + 1).padStart(2, '0');
  const etiqueta = label.trim();

  const slug = etiqueta.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const archivo = slug ? `foresight-reporte-${anio}-${mes}-${slug}` : `foresight-reporte-${anio}-${mes}`;

  const ahora = new Date();
  const hh = String(ahora.getHours()).padStart(2, '0');
  const mm = String(ahora.getMinutes()).padStart(2, '0');

  return {
    titulo: etiqueta ? `Reporte ${etiqueta}` : `Reporte Financiero - ${mes}/${anio}`,
    archivo,
    totales: { ingresos, gastos, saldo },
    filas: ordenados.map((item) => ({
      fecha: safeParseDate(item.date).toLocaleDateString(LOCALE),
      tipo: item.type === 'income' ? 'Ingreso' : item.type === 'transfer' ? 'Transferencia' : 'Gasto',
      ambito: item.businessType === 'personal' ? 'Personal' : 'Negocio',
      monto: formatMoney(item.amount),
      concepto: item.concept || '',
    })),
    generado: `Generado el ${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()} a las ${hh}:${mm}`,
  };
}
