// ================================================================
// ReportModal — Reporte rápido del mes actual (PDF/CSV)
// Para reportes por rango de fechas, usar la pestaña Estadísticas
// ================================================================

import { useMemo, useId } from 'react';
import { X, Calendar, Printer, FileSpreadsheet, Building2, User } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { formatMoney, MONTH_NAMES, downloadBlob, roundMoney } from '@/lib/utils';
import { movementsToCsv } from '@/lib/movements-csv';
import { imprimirReporte } from '@/lib/print-report';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useScrollLock } from '@/hooks/useScrollLock';

export function ReportModal() {
  const isOpen = useUiStore((s) => s.isReportModalOpen);
  const closeReportModal = useUiStore((s) => s.closeReportModal);
  const addToast = useUiStore((s) => s.addToast);
  const expenses = useFinanceStore((s) => s.expenses);
  const getMonthlyData = useFinanceStore((s) => s.getMonthlyData);
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const allCustomCats = [...customExpenseCategories, ...customIncomeCategories];

  // Cerrar modal con tecla Escape
  useEscapeKey(closeReportModal, isOpen);

  // Scroll lock para iOS PWA
  useScrollLock(isOpen);

  // Este modal no declaraba ser un diálogo: era un div suelto, sin rol ni
  // retención de foco, así que con teclado se salía al fondo sin cerrarlo.
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen);
  const titleId = useId();

  // ── Usar getMonthlyData() que ya hace dedup de templates recurrentes ──
  // (hook incondicional: no puede ir después del early return).
  // Deps "innecesarias" a propósito: getMonthlyData lee el store por dentro,
  // sin ellas el memo quedaría stale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthData = useMemo(() => getMonthlyData(), [getMonthlyData, expenses, currentViewDate]);

  if (!isOpen) return null;

  const viewDate = new Date(currentViewDate);
  const monthLabel = `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  const monthSlug = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

  const totalIncome = roundMoney(monthData
    .filter((i) => i.type === 'income')
    .reduce((s, i) => s + i.amount, 0));
  const totalExpenses = roundMoney(monthData
    .filter((i) => i.type === 'expense')
    .reduce((s, i) => s + i.amount, 0));
  const balance = roundMoney(totalIncome - totalExpenses);
  const count = monthData.length;

  const businessCount = monthData.filter(
    (i) => i.businessType === 'business' || !i.businessType
  ).length;
  const personalCount = monthData.filter(
    (i) => i.businessType === 'personal'
  ).length;

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
      filtered = monthData.filter(
        (i) => i.businessType === 'business' || !i.businessType
      );
      label = `Negocio - ${monthLabel}`;
    } else if (type === 'personal') {
      filtered = monthData.filter((i) => i.businessType === 'personal');
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
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-overlay animate-fade-in"
        onClick={closeReportModal}
      />

      {/* Modal — anchored top, scrollable with safe-area */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 top-0 z-modal saas-card max-w-sm mx-auto p-3 animate-scale-in rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
        style={{
          top: 'env(safe-area-inset-top, 0px)',
          maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          touchAction: 'pan-y',
        }}
      >
        {/* Scrollable content */}
        <div className="overflow-y-auto ios-scroll -mx-3 -mt-3 px-3 pt-3 flex-1" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h2 id={titleId} className="font-bold text-sm text-slate-900 dark:text-white">
            Reporte Mensual
          </h2>
          <button onClick={closeReportModal} aria-label="Cerrar" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          <Calendar className="inline w-3.5 h-3.5 mr-1" />
          {monthLabel}
        </p>

        <p className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">
          {count} mov. · {businessCount} neg, {personalCount} pers
        </p>

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ingresos
            </p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatMoney(totalIncome)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Gastos
            </p>
            <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
              {formatMoney(totalExpenses)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Saldo
            </p>
            <p
              className={`text-sm font-bold tabular-nums ${
                balance >= 0
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatMoney(balance)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
            PDF Completo
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
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
            No hay movimientos registrados en este mes.
          </p>
        )}
        </div>{/* end scrollable */}
      </div>
    </>
  );
}
