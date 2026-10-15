// ================================================================
// ReportModal — Reporte del mes en pantalla (PDF/CSV), en el ámbito activo
// ================================================================

import { useId } from 'react';
import { Calendar, Printer, FileSpreadsheet, Building2, User } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useExpensesDelMesEnAmbito } from '@/hooks/useAmbito';
import { useUiStore } from '@/stores/uiStore';
import { totalesDe } from '@/lib/totales';
import { filtrarPorAmbito } from '@/lib/ambito';
import { formatMoney, MONTH_NAMES, downloadBlob } from '@/lib/utils';
import { movementsToCsv } from '@/lib/movements-csv';
import { imprimirReporte } from '@/lib/print-report';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useScrollLock } from '@/hooks/useScrollLock';

export function ReportModal() {
  const isOpen = useUiStore((s) => s.isReportModalOpen);
  const closeReportModal = useUiStore((s) => s.closeReportModal);
  const addToast = useUiStore((s) => s.addToast);
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const allCustomCats = [...customExpenseCategories, ...customIncomeCategories];

  // Cerrar modal con tecla Escape
  useEscapeKey(closeReportModal, isOpen);

  // Scroll lock para iOS PWA
  useScrollLock(isOpen);

  // ModalSheet aporta el rol de diálogo y la retención de foco.
  const titleId = useId();

  // El mismo universo que la pantalla desde la que se abre el reporte: mes en
  // pantalla y ámbito activo. Leyendo el store crudo, el reporte sumaba también
  // el otro ámbito y contradecía al KPI que tenía justo debajo.
  const monthData = useExpensesDelMesEnAmbito();

  if (!isOpen) return null;

  const viewDate = new Date(currentViewDate);
  const monthLabel = `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  const monthSlug = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

  const { ingresos: totalIncome, gastos: totalExpenses, saldo: balance } = totalesDe(monthData);
  const count = monthData.length;

  // Misma regla de ámbito que el segmentado de la cabecera y Movimientos
  // (ver nota en src/lib/totales.ts sobre movimientos sin etiqueta).
  const businessCount = filtrarPorAmbito(monthData, 'business', (i) => i.businessType).length;
  const personalCount = filtrarPorAmbito(monthData, 'personal', (i) => i.businessType).length;

  async function handleCSV() {
    try {
      // Formato único compartido con StatsPage.
      const blob = movementsToCsv(monthData, allCustomCats);
      const outcome = await downloadBlob(blob, `reporte-${monthSlug}.csv`);
      if (outcome === 'cancelled') return; // el usuario cerró el menú de compartir
      addToast(outcome === 'shared' ? 'CSV listo para compartir ✅' : 'CSV descargado ✅', 'success');
    } catch {
      addToast('Error al generar el CSV', 'error');
    }
  }

  // PDF vía diálogo de impresión del navegador ("Guardar como PDF"). Antes lo
  // generaba jsPDF; el navegador no dice si el usuario guardó o canceló, así
  // que no hay toast de éxito.
  function handleDownload(type: 'business' | 'personal' | 'all') {
    let filtered = monthData;
    let label: string;

    if (type === 'business') {
      filtered = filtrarPorAmbito(monthData, 'business', (i) => i.businessType);
      label = `Negocio - ${monthLabel}`;
    } else if (type === 'personal') {
      filtered = filtrarPorAmbito(monthData, 'personal', (i) => i.businessType);
      label = `Personal - ${monthLabel}`;
    } else {
      label = `Completo - ${monthLabel}`;
    }

    if (filtered.length === 0) {
      addToast('No hay movimientos para este filtro', 'info');
      return;
    }

    try {
      imprimirReporte(filtered, viewDate, label);
    } catch {
      addToast('Este navegador no permite imprimir desde la app', 'error');
    }
  }

  return (
    <ModalSheet id={titleId} titulo="Reporte mensual" onClose={closeReportModal}>
      {/* Contenido con scroll; la cabecera con «Cerrar» la pone ModalSheet fuera
          de esta zona, así que nunca se va con el desplazamiento. */}
      <div
        className="overflow-y-auto ios-scroll flex-1 min-h-0 p-3"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >

        <p className="text-2xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
          <Calendar className="inline w-3.5 h-3.5 mr-1" />
          {monthLabel}
        </p>

        <p className="text-2xs font-medium text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wider">
          {count} mov. · {businessCount} neg, {personalCount} pers
        </p>

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Ingresos
            </p>
            <p className="text-sm font-bold text-income-700 dark:text-income-400 tabular-nums">
              {formatMoney(totalIncome)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Gastos
            </p>
            <p className="text-sm font-bold text-expense-600 dark:text-expense-400 tabular-nums">
              {formatMoney(totalExpenses)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Saldo
            </p>
            <p
              className={`text-sm font-bold tabular-nums ${
                balance >= 0
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-expense-600 dark:text-expense-400'
              }`}
            >
              {formatMoney(balance)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Movimientos
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
              {count}
            </p>
          </div>
        </div>

        {/* Download buttons */}
        <div className="space-y-1.5">
          <button
            onClick={() => handleDownload('all')}
            disabled={count === 0}
            className="saas-btn-primary w-full py-2 text-xs"
            title="Imprimir o guardar como PDF"
          >
            <Printer className="w-3 h-3" />
            PDF completo
          </button>
          <button
            onClick={handleCSV}
            disabled={count === 0}
            className="saas-btn-secondary w-full py-2 text-xs"
          >
            <FileSpreadsheet className="w-3 h-3" />
            CSV (Excel)
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => handleDownload('business')}
              disabled={businessCount === 0}
              className="saas-btn-secondary flex-1 py-1.5 text-2xs"
              title="Imprimir o guardar como PDF"
            >
              <Building2 className="w-3 h-3" />
              Negocio
            </button>
            <button
              onClick={() => handleDownload('personal')}
              disabled={personalCount === 0}
              className="saas-btn-secondary flex-1 py-1.5 text-2xs"
              title="Imprimir o guardar como PDF"
            >
              <User className="w-3 h-3" />
              Personal
            </button>
          </div>
        </div>

        {count === 0 && (
          <p className="text-xs text-slate-600 dark:text-slate-400 text-center mt-2">
            No hay movimientos registrados en este mes.
          </p>
        )}
      </div>
    </ModalSheet>
  );
}
