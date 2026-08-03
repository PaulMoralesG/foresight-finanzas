// ================================================================
// GENERADOR DE PDF (jsPDF vía npm — sin dependencia de CDN)
// ================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney, MONTH_NAMES, safeParseDate } from './utils';
import type { Transaction } from '@/types';

export async function generatePDFReport(
  monthly: Transaction[],
  viewDate: Date,
  label = ''
): Promise<{ doc: jsPDF; monthName: string; year: number }> {
  const monthName = MONTH_NAMES[viewDate.getMonth()];
  const year = viewDate.getFullYear();

  const totalIncome = monthly.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0);
  const totalExpenses = monthly.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
  const balance = totalIncome - totalExpenses;

  const monthNum = String(viewDate.getMonth() + 1).padStart(2, '0');
  const doc = new jsPDF();

  // ── Sanitizar label: reemplazar caracteres no-latinos y símbolos no soportados por helvetica ──
  const safeLabel = label
    .replace(/[^\x00-\x7F\u00C0-\u00FF\u0100-\u017F\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g, '')
    .replace(/[→←↑↓↔⇒⇐⇑⇓⟹⟸]/g, '-')
    .replace(/[🎉✅🔥⚠️👀👍🎯🏆💪🌱🚨⏰📅]/g, '')
    .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ\-.,;:()\[\]{}¿?¡!@#$%&/=+ –—]/g, '')
    .trim();

  // ── Configurar fuente explícita (evita espaciado de caracteres) ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(33, 37, 41);

  const title = safeLabel
    ? `Reporte ${safeLabel}`
    : `Reporte Financiero - ${monthNum}/${year}`;
  doc.text(title, 15, 20, { maxWidth: 180, align: 'left' });

  // ── Línea separadora (debajo del título, con altura dinámica) ──
  const titleLines = doc.getTextWidth(title) > 180 ? 2 : 1;
  const sepY = titleLines === 1 ? 24 : 30;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(15, sepY, 195, sepY);

  const summaryY = sepY + 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(`Saldo Final: ${formatMoney(balance)}`, 15, summaryY, { maxWidth: 60, align: 'left' });
  doc.text(`Ingresos: ${formatMoney(totalIncome)}`, 80, summaryY, { maxWidth: 55, align: 'left' });
  doc.text(`Gastos: ${formatMoney(totalExpenses)}`, 145, summaryY, { maxWidth: 55, align: 'left' });

  if (monthly.length > 0) {
    const tableData = monthly.map((item) => [
      safeParseDate(item.date).toLocaleDateString('es-ES'),
      item.type === 'income' ? 'Ingreso' : 'Gasto',
      item.businessType === 'personal' ? 'Personal' : 'Negocio',
      formatMoney(item.amount),
      item.concept || '',
    ]);
    autoTable(doc, {
      startY: summaryY + 9,
      head: [['Fecha', 'Tipo', 'Categoría', 'Monto', 'Concepto']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 15, right: 15 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 'auto' },
      },
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text('No hay movimientos registrados en este período.', 15, summaryY + 9, { maxWidth: 180, align: 'left' });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    const nowFooter = new Date();
    const footerText = `Generado el ${nowFooter.getDate()}/${nowFooter.getMonth() + 1}/${nowFooter.getFullYear()} a las ${String(nowFooter.getHours()).padStart(2, '0')}:${String(nowFooter.getMinutes()).padStart(2, '0')}`;
    doc.text(footerText, 15, 285, { maxWidth: 140, align: 'left' });
    const pageText = `Pagina ${i} de ${pageCount}`;
    const pageTextWidth = doc.getTextWidth(pageText);
    doc.text(pageText, 195 - pageTextWidth, 285, { maxWidth: 40, align: 'left' });
  }

  return { doc, monthName, year };
}
