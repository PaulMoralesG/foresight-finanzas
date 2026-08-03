// ================================================================
// ReportModal — Reporte rápido del mes actual (PDF/CSV)
// Para reportes por rango de fechas, usar la pestaña Estadísticas
// ================================================================

import { useState, useMemo } from 'react';
import { X, Calendar, Loader2, Download, FileSpreadsheet, Building2, User } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { formatMoney, MONTH_NAMES, downloadBlob } from '@/lib/utils';
import { getCategoryById } from '@/config/categories';
import { generatePDFReport } from '@/lib/pdf-generator';
import { useEscapeKey } from '@/hooks/useEscapeKey';
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

  const [downloading, setDownloading] = useState<string | null>(null);

  // Cerrar modal con tecla Escape
  useEscapeKey(closeReportModal, isOpen);

  // Scroll lock para iOS PWA
  useScrollLock(isOpen);

  if (!isOpen) return null;

  // ── Usar getMonthlyData() que ya hace dedup de templates recurrentes ──
  const monthData = useMemo(() => getMonthlyData(), [getMonthlyData, expenses, currentViewDate]);

  const viewDate = new Date(currentViewDate);
  const monthLabel = `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  const monthSlug = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

  const totalIncome = monthData
    .filter((i) => i.type === 'income')
    .reduce((s, i) => s + i.amount, 0);
  const totalExpenses = monthData
    .filter((i) => i.type === 'expense')
    .reduce((s, i) => s + i.amount, 0);
  const balance = totalIncome - totalExpenses;
  const count = monthData.length;

  const businessCount = monthData.filter(
    (i) => i.businessType === 'business' || !i.businessType
  ).length;
  const personalCount = monthData.filter(
    (i) => i.businessType === 'personal'
  ).length;

  async function handleCSV() {
    try {
      const BOM = String.fromCharCode(0xFEFF);
      const headers = ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto', 'Ámbito', 'Método'];
      const rows = monthData.map((tx) => [
        tx.date,
        tx.type === 'income' ? 'Ingreso' : 'Gasto',
        (getCategoryById(tx.category, allCustomCats)?.label || tx.category),
        tx.concept,
        tx.amount.toString(),
        tx.businessType === 'business' || !tx.businessType ? 'Negocio' : 'Personal',
        tx.method === 'cash' ? 'Efectivo' : tx.method === 'card' ? 'Tarjeta' : 'Transferencia',
      ]);
      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      await downloadBlob(blob, `reporte-${monthSlug}.csv`);
      addToast('CSV descargado ✅', 'success');
    } catch {
      addToast('Error al generar el CSV', 'error');
    }
  }

  async function handleDownload(type: 'business' | 'personal' | 'all') {
    setDownloading(type);
    try {
      let filtered = monthData;
      let label = '';

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
        setDownloading(null);
        return;
      }

      const { doc } = await generatePDFReport(filtered, viewDate, label);
      const monthStr = viewDate.toISOString().slice(0, 7);
      const filename = `foresight-reporte-${monthStr}-${label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.pdf`;

      const blob = doc.output('blob') as unknown as Blob;
      await downloadBlob(blob, filename);

      addToast('Reporte PDF descargado ✅', 'success');
    } catch {
      addToast('Error al generar el PDF', 'error');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[200] animate-fade-in"
        onClick={closeReportModal}
      />

      {/* Modal — anchored top, scrollable with safe-area */}
      <div
        className="fixed inset-x-0 top-0 z-[201] saas-card max-w-sm mx-auto p-3 animate-scale-in rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
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
          <h2 className="font-bold text-sm text-slate-900 dark:text-white">
            Reporte Mensual
          </h2>
          <button onClick={closeReportModal} aria-label="Cerrar" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="text-xs" />
          </button>
        </div>

        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          <Calendar className="inline w-3.5 h-3.5 mr-1" />
          {monthLabel}
        </p>

        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-wider">
          {count} mov. · {businessCount} neg, {personalCount} pers
        </p>

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ingresos
            </p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatMoney(totalIncome)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Gastos
            </p>
            <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
              {formatMoney(totalExpenses)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
            disabled={downloading !== null}
            className="saas-btn-primary w-full py-2 text-xs"
          >
            {downloading === 'all' ? (
              <Loader2 className="animate-spin w-3 h-3" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            PDF Completo
          </button>
          <button
            onClick={handleCSV}
            disabled={downloading !== null || count === 0}
            className="saas-btn-secondary w-full py-2 text-xs"
          >
            <FileSpreadsheet className="w-3 h-3" />
            CSV (Excel)
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => handleDownload('business')}
              disabled={downloading !== null}
              className="saas-btn-secondary flex-1 py-1.5 text-[11px]"
            >
              {downloading === 'business' ? (
                <Loader2 className="animate-spin w-3 h-3" />
              ) : (
                <Building2 className="w-3 h-3" />
              )}
              Negocio
            </button>
            <button
              onClick={() => handleDownload('personal')}
              disabled={downloading !== null}
              className="saas-btn-secondary flex-1 py-1.5 text-[11px]"
            >
              {downloading === 'personal' ? (
                <Loader2 className="animate-spin w-3 h-3" />
              ) : (
                <User className="w-3 h-3" />
              )}
              Personal
            </button>
          </div>
        </div>

        {count === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2">
            No hay movimientos registrados en este mes.
          </p>
        )}
        </div>{/* end scrollable */}
      </div>
    </>
  );
}
