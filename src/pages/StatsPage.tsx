// ================================================================
// StatsPage — Estadísticas SaaS con filtros de período
// ================================================================

import { useMemo, useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, FileText, FileSpreadsheet, Loader2, TrendingUp, ArrowUp, ArrowDown, PieChart, User, Building2, ClipboardList, CalendarClock } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { formatMoney, MONTH_NAMES, formatDateLong, LOCALE, safeParseDate, downloadBlob } from '@/lib/utils';
import { movementsToCsv } from '@/lib/movements-csv';
import { useStatsPeriod, pctChange } from '@/hooks/useStatsPeriod';
import { getCategoryById } from '@/config/categories';
import { generatePDFReport } from '@/lib/pdf-generator';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

export function StatsPage() {
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const addToast = useUiStore((s) => s.addToast);
  const isDark = useUiStore((s) => s.isDark);

  // Stats filter state
  const statsMode = useUiStore((s) => s.statsMode);
  const statsMonth = useUiStore((s) => s.statsMonth);
  const statsYear = useUiStore((s) => s.statsYear);
  const statsFromDate = useUiStore((s) => s.statsFromDate);
  const statsToDate = useUiStore((s) => s.statsToDate);
  const setStatsMode = useUiStore((s) => s.setStatsMode);
  const setStatsMonth = useUiStore((s) => s.setStatsMonth);
  const setStatsYear = useUiStore((s) => s.setStatsYear);
  const setStatsRange = useUiStore((s) => s.setStatsRange);

  // Sincronizar mes/año de stats con el mes visto en el dashboard al montar
  useEffect(() => {
    const d = new Date(currentViewDate);
    setStatsMonth(d.getMonth());
    setStatsYear(d.getFullYear());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [exportFilter, setExportFilter] = useState<'all' | 'personal' | 'business'>('all');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Todas las derivaciones del periodo viven en el hook: son aritmética
  // sobre transacciones y se prueban sin montar la página.
  const {
    trendData,
    filteredData,
    totals,
    prevTotals,
    expensesByCategory,
    maxAmount,
    largestExpense,
    peakDay,
    peakDayTransactions,
    avgDaily,
  } = useStatsPeriod({
    mode: statsMode,
    month: statsMonth,
    year: statsYear,
    fromDate: statsFromDate,
    toDate: statsToDate,
  });

  // Populate year options: 3 years back to 1 forward
  const currentYear = new Date().getFullYear();
  const currentYearMonth = new Date().getMonth();
  const currentYearYear = currentYear;
  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - 3 + i),
    [currentYear]
  );

  // ── Helpers: filtrar datos para export ──
  const getExportData = useCallback(() => {
    return exportFilter === 'all'
      ? filteredData
      : filteredData.filter((i) => {
          if (exportFilter === 'personal') return i.businessType === 'personal';
          return i.businessType === 'business';
        });
  }, [filteredData, exportFilter]);

  const getFilterLabel = useCallback(() => {
    return exportFilter === 'personal' ? 'Personal' : exportFilter === 'business' ? 'Negocio' : 'Completo';
  }, [exportFilter]);

  const getViewDate = useCallback(() => {
    return statsMode === 'month'
      ? new Date(statsYear, statsMonth, 1)
      : safeParseDate(statsFromDate!);
  }, [statsMode, statsYear, statsMonth, statsFromDate]);

  // ── Label con rango de fechas para el reporte ──
  const getReportLabel = useCallback(() => {
    const filterLabel = getFilterLabel();
    if (statsMode === 'month') {
      return `${filterLabel} - ${MONTH_NAMES[statsMonth]} ${statsYear}`;
    }
    // range mode
    const fmt = (d: string) => {
      const p = safeParseDate(d);
      return `${p.getDate()} ${MONTH_NAMES[p.getMonth()].slice(0, 3)} ${p.getFullYear()}`;
    };
    return `${filterLabel} - ${fmt(statsFromDate!)} - ${fmt(statsToDate!)}`;
  }, [statsMode, statsMonth, statsYear, statsFromDate, statsToDate, getFilterLabel]);

  // ── PDF: download ──
  const handleDownloadPDF = async () => {
    const exportData = getExportData();
    if (exportData.length === 0) return;
    setIsExporting(true);
    try {
      const reportLabel = getReportLabel();
      const viewDate = getViewDate();
      const { doc } = await generatePDFReport(exportData, viewDate, reportLabel);
      const monthStr = viewDate.toISOString().slice(0, 7);
      const filename = `foresight-reporte-${monthStr}-${reportLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.pdf`;
      const blob = doc.output('blob') as unknown as Blob;
      const outcome = await downloadBlob(blob, filename);
      if (outcome === 'cancelled') return; // el usuario cerró el menú de compartir
      addToast(outcome === 'shared' ? 'PDF listo para compartir ✅' : 'PDF descargado ✅', 'success');
    } catch {
      addToast('Error al descargar el PDF', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Obtener categorías personalizadas ──
  const customExpenseCats = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCats = useFinanceStore((s) => s.customIncomeCategories);
  const allCustomCats = useMemo(() => [...customExpenseCats, ...customIncomeCats], [customExpenseCats, customIncomeCats]);

  const generateCSV = useCallback((): { blob: Blob } | null => {
    const exportData = getExportData();
    if (exportData.length === 0) return null;

    // Formato único compartido con ReportModal: antes cada pantalla emitía sus
    // propias columnas, en otro orden y con otro convenio de signo.
    return { blob: movementsToCsv(exportData, allCustomCats) };
  }, [getExportData, allCustomCats]);

  // ── Excel: download ──
  const handleDownloadCSV = async () => {
    const exportData = getExportData();
    if (exportData.length === 0) return;
    setIsExportingCSV(true);
    try {
      const result = generateCSV();
      if (!result) return;
      const reportLabel = getReportLabel();
      const viewDate = getViewDate();
      const monthStr = viewDate.toISOString().slice(0, 7);
      const filename = `foresight-datos-${monthStr}-${reportLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.csv`;
      const outcome = await downloadBlob(result.blob, filename);
      if (outcome === 'cancelled') return; // el usuario cerró el menú de compartir
      addToast(outcome === 'shared' ? 'Excel listo para compartir ✅' : 'Excel descargado ✅', 'success');
    } catch {
      addToast('Error al descargar el Excel', 'error');
    } finally {
      setIsExportingCSV(false);
    }
  };

  // Period label
  const periodLabel =
    statsMode === 'month'
      ? `${MONTH_NAMES[statsMonth]} ${statsYear}`
      : statsFromDate && statsToDate
        ? `${formatDateLong(statsFromDate)} → ${formatDateLong(statsToDate)}`
        : 'Selecciona un rango';

  // Recharts recibe colores como props, no como clases, así que el tema hay
  // que resolverlo aquí. Estaba fijo en slate-400, que sobre el fondo claro
  // del gráfico da ~2,6:1 — por debajo del mínimo de WCAG para texto.
  const axisTickColor = isDark ? '#94a3b8' : '#475569';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ─── Filter Bar ─── */}
      <div className="saas-card p-2.5 md:p-3">
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1 flex-shrink-0">
            <button
              onClick={() => setStatsMode('month')}
              className={`px-2.5 md:px-3 py-1.5 rounded-md text-2xs md:text-xs font-semibold transition-all whitespace-nowrap ${
                statsMode === 'month'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Por Mes
            </button>
            <button
              onClick={() => setStatsMode('range')}
              className={`px-2.5 md:px-3 py-1.5 rounded-md text-2xs md:text-xs font-semibold transition-all whitespace-nowrap ${
                statsMode === 'range'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Month mode controls */}
          {statsMode === 'month' && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => {
                  if (statsMonth === 0) {
                    setStatsMonth(11);
                    setStatsYear(statsYear - 1);
                  } else {
                    setStatsMonth(statsMonth - 1);
                  }
                }}
                className="saas-btn-icon"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <select
                value={statsMonth}
                onChange={(e) => setStatsMonth(Number(e.target.value))}
                aria-label="Mes a analizar"
                className="saas-input-sm text-2xs w-[100px]"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
              <select
                value={statsYear}
                onChange={(e) => setStatsYear(Number(e.target.value))}
                aria-label="Año a analizar"
                className="saas-input-sm text-2xs w-[75px]"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (statsMonth === 11) {
                    setStatsMonth(0);
                    setStatsYear(statsYear + 1);
                  } else {
                    setStatsMonth(statsMonth + 1);
                  }
                }}
                className="saas-btn-icon"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              {/* Volver al mes actual */}
              {(statsMonth !== currentYearMonth || statsYear !== currentYearYear) && (
                <button
                  onClick={() => { setStatsMonth(currentYearMonth); setStatsYear(currentYearYear); }}
                  className="saas-btn-secondary saas-btn-sm flex items-center gap-1 text-2xs"
                  title="Volver al mes actual"
                >
                  <CalendarClock className="w-3 h-3" />
                  Hoy
                </button>
              )}
            </div>
          )}

          {/* Range mode controls */}
          {statsMode === 'range' && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input
                type="date"
                value={statsFromDate || ''}
                onChange={(e) => setStatsRange(e.target.value || null, statsToDate)}
                aria-label="Fecha de inicio del rango"
                className="saas-input-sm text-2xs w-[120px]"
              />
              <span className="text-slate-500 dark:text-slate-400 text-2xs">→</span>
              <input
                type="date"
                value={statsToDate || ''}
                onChange={(e) => setStatsRange(statsFromDate, e.target.value || null)}
                aria-label="Fecha de fin del rango"
                className="saas-input-sm text-2xs w-[120px]"
              />
            </div>
          )}

          {/* Period label */}
          <span className="text-2xs md:text-xs font-medium text-slate-500 dark:text-slate-400 md:flex-1">
            {periodLabel}
          </span>

          {/* Mobile: export buttons inline (descarga directa vía Web Share API) */}
          <div className="flex items-center gap-1 md:hidden flex-shrink-0">
            <button
              onClick={handleDownloadPDF}
              disabled={isExporting || filteredData.length === 0}
              className="saas-btn-primary saas-btn-sm flex items-center gap-1 text-2xs"
              title="Descargar PDF"
              aria-label="Descargar PDF"
            >
              {isExporting ? (
                <Loader2 className="animate-spin w-3 h-3" />
              ) : (
                <FileText className="w-3 h-3" />
              )}
              <span>PDF</span>
            </button>
            <button
              onClick={handleDownloadCSV}
              disabled={isExportingCSV || filteredData.length === 0}
              className="saas-btn-sm flex items-center gap-1 text-2xs rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 focus:ring-emerald-500 shadow-sm shadow-emerald-500/20"
              title="Descargar Excel"
              aria-label="Descargar Excel"
            >
              {isExportingCSV ? (
                <Loader2 className="animate-spin w-3 h-3" />
              ) : (
                <FileSpreadsheet className="w-3 h-3" />
              )}
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* ─── Export Row: filtro de tipo + botones (desktop) ─── */}
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Tipo: Personal / Negocio / Todo */}
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
            {([
              { key: 'personal', Icon: User, label: 'Personal' },
              { key: 'business', Icon: Building2, label: 'Negocio' },
              { key: 'all', Icon: ClipboardList, label: 'Todo' },
            ] as const).map(({ key, Icon, label }) => (
              <button
                key={key}
                onClick={() => setExportFilter(key)}
                title={label}
                className={`px-1.5 md:px-2.5 py-1 rounded-md text-2xs md:text-2xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
                  exportFilter === key
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* PDF download button (desktop) */}
          <button
            onClick={handleDownloadPDF}
            disabled={isExporting || filteredData.length === 0}
            className="saas-btn-primary saas-btn-sm hidden md:inline-flex items-center gap-1 text-2xs md:text-2xs"
            title="Descargar PDF"
            aria-label="Descargar PDF"
          >
            {isExporting ? (
              <Loader2 className="animate-spin w-3 h-3" />
            ) : (
              <FileText className="w-3 h-3" />
            )}
            <span>Descargar PDF</span>
          </button>

          {/* Excel download button (desktop) */}
          <button
            onClick={handleDownloadCSV}
            disabled={isExportingCSV || filteredData.length === 0}
            className="saas-btn-sm hidden md:inline-flex items-center gap-1 text-2xs md:text-2xs rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 focus:ring-emerald-500 shadow-sm shadow-emerald-500/20"
            title="Descargar Excel"
            aria-label="Descargar Excel"
          >
            {isExportingCSV ? (
              <Loader2 className="animate-spin w-3 h-3" />
            ) : (
              <FileSpreadsheet className="w-3 h-3" />
            )}
            <span>Descargar Excel</span>
          </button>
        </div>
      </div>

      {/* ─── Trend Chart ─── */}
      <div className="saas-card p-3">
        <h2 className="text-xs font-bold text-slate-900 dark:text-white mb-2">Evolución</h2>
        {trendData.every((d) => d.Ingresos === 0 && d.Gastos === 0) ? (
          <div className="text-center py-8">
            <TrendingUp className="w-6 h-6 text-slate-200 dark:text-slate-700 mb-1.5 block" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Sin datos para mostrar tendencia</p>
          </div>
        ) : (
          <div className="h-[240px] sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 20, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: axisTickColor }}
                  axisLine={{ stroke: isDark ? '#334155' : '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: axisTickColor }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                  tickFormatter={(v) => {
                    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                    if (v >= 1000) return `$${Math.round(v / 1000)}k`;
                    return `$${v}`;
                  }}
                />
                <Tooltip
                  formatter={(value: number) => [formatMoney(value), '']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    color: isDark ? '#f1f5f9' : '#1e293b',
                  }}
                  labelStyle={{ fontWeight: 600, marginBottom: '4px', color: isDark ? '#cbd5e1' : '#334155' }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                />
                <Line
                  type="monotone"
                  dataKey="Ingresos"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="Gastos"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="Balance"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="saas-card p-2.5">
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
            Ingresos
          </p>
          <p className="text-base font-bold text-income-600 dark:text-income-400 tabular-nums">
            {formatMoney(totals.income)}
          </p>
          {prevTotals.income > 0 && (
            <p className={`text-2xs mt-0.5 ${totals.income >= prevTotals.income ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
              {totals.income >= prevTotals.income ? <ArrowUp className="inline w-2 h-2 mr-0.5" /> : <ArrowDown className="inline w-2 h-2 mr-0.5" />}
              {pctChange(totals.income, prevTotals.income)} vs período anterior
            </p>
          )}
        </div>
        <div className="saas-card p-2.5">
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
            Gastos
          </p>
          <p className="text-base font-bold text-expense-600 dark:text-expense-400 tabular-nums">
            {formatMoney(totals.spent)}
          </p>
          {prevTotals.spent > 0 && (
            <p className={`text-2xs mt-0.5 ${totals.spent <= prevTotals.spent ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
              {totals.spent <= prevTotals.spent ? <ArrowDown className="inline w-2 h-2 mr-0.5" /> : <ArrowUp className="inline w-2 h-2 mr-0.5" />}
              {pctChange(totals.spent, prevTotals.spent)} vs período anterior
            </p>
          )}
        </div>
        <div className="saas-card p-2.5">
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
            Saldo
          </p>
          <p className={`text-base font-bold tabular-nums ${totals.balance >= 0 ? 'text-brand-600 dark:text-brand-400' : 'text-expense-600 dark:text-expense-400'}`}>
            {formatMoney(totals.balance)}
          </p>
          <p className="text-2xs mt-0.5 text-slate-500 dark:text-slate-400">
            Promedio diario {formatMoney(avgDaily)}
          </p>
        </div>
        <div className="saas-card p-2.5">
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
            Resultado negocio
          </p>
          <p className={`text-base font-bold tabular-nums ${totals.businessProfit >= 0 ? 'text-business-600 dark:text-business-400' : 'text-expense-600 dark:text-expense-400'}`}>
            {formatMoney(totals.businessProfit)}
          </p>
          <p className="text-2xs mt-0.5 text-slate-500 dark:text-slate-400">
            {totals.count} movimientos
          </p>
        </div>
      </div>

      {/* ─── Category Breakdown ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="saas-card p-3">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white mb-2">Gastos por categoría</h2>
          {expensesByCategory.length === 0 ? (
            <div className="text-center py-6">
              <PieChart className="w-6 h-6 text-slate-200 dark:text-slate-700 mb-1.5 block" />
              <p className="text-xs text-slate-500 dark:text-slate-400">Sin gastos en este período</p>
            </div>
          ) : (
            <div className="space-y-1">
              {expensesByCategory.slice(0, 8).map(([catId, amount]) => {
                const cat = getCategoryById(catId, allCustomCats);
                const width = Math.max((amount / maxAmount) * 100, 6);
                const isExpanded = expandedCategory === catId;
                const categoryTransactions = filteredData
                  .filter((i) => i.type === 'expense' && i.category === catId)
                  .sort((a, b) => b.amount - a.amount);

                return (
                  <div key={catId}>
                    <button
                      type="button"
                      onClick={() => setExpandedCategory(isExpanded ? null : catId)}
                      className="w-full flex items-center gap-3 group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg p-1.5 -mx-1.5 transition-colors"
                    >
                      <span className="text-base w-7 text-center flex-shrink-0">{cat?.icon || '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                            {cat?.label || catId}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums ml-2 flex-shrink-0 flex items-center gap-1">
                            {formatMoney(amount)}
                            {isExpanded ? <ChevronUp className="inline w-2.5 h-2.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400" /> : <ChevronDown className="inline w-2.5 h-2.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400" />}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 dark:bg-brand-400 rounded-full transition-all duration-700 group-hover:bg-brand-600"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Expanded: individual transactions */}
                    {isExpanded && (
                      <div className="mt-2 mb-1 pl-10 space-y-1.5 animate-fade-in">
                        <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {categoryTransactions.length} movimiento{categoryTransactions.length !== 1 ? 's' : ''}
                        </p>
                        {categoryTransactions.map((t) => (
                          <div key={t.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-50 dark:bg-slate-800/30">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-700 dark:text-slate-300 truncate">
                                {t.concept || 'Sin concepto'}
                              </p>
                              <p className="text-2xs text-slate-500 dark:text-slate-400">
                                {safeParseDate(t.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
                              </p>
                            </div>
                            <span className="text-expense-600 dark:text-expense-400 font-semibold tabular-nums ml-2 flex-shrink-0">
                              {formatMoney(t.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Destacados ─── */}
        <div className="space-y-3">
          {/* Mayor gasto — transacción individual */}
          <div className="saas-card p-3">
            <h2 className="text-xs font-bold text-slate-900 dark:text-white mb-2">Mayor gasto</h2>
            {largestExpense ? (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xl">
                    {(() => {
                      const cat = getCategoryById(largestExpense.category, allCustomCats);
                      return cat?.icon || '💸';
                    })()}
                  </span>
                  <div>
                    <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400">
                      {(() => {
                        const cat = getCategoryById(largestExpense.category, allCustomCats);
                        return cat?.label || largestExpense.category;
                      })()}
                    </p>
                    <p className="text-base font-bold text-expense-600 dark:text-expense-400 tabular-nums">
                      {formatMoney(largestExpense.amount)}
                    </p>
                  </div>
                </div>
                <div className="pl-9 space-y-0.5">
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {largestExpense.concept || 'Sin concepto'}
                  </p>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {safeParseDate(largestExpense.date).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}
                    {' · '}
                    {largestExpense.method === 'cash' ? '💵 Efectivo' : largestExpense.method === 'card' ? '💳 Tarjeta' : '🏦 Transferencia'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-3">Sin gastos en este período</p>
            )}
          </div>

          {/* Día pico */}
          <div className="saas-card p-3">
            <h2 className="text-xs font-bold text-slate-900 dark:text-white mb-2">📅 Día de mayor gasto</h2>
            {peakDay ? (
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {safeParseDate(peakDay.date).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <p className="text-base font-bold text-expense-600 dark:text-expense-400 tabular-nums mt-0.5">
                  {formatMoney(peakDay.amount)}
                </p>
                {peakDayTransactions.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {peakDayTransactions.length} mov.
                    </p>
                    {peakDayTransactions.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="flex-shrink-0">
                            {(() => {
                              const cat = getCategoryById(t.category, allCustomCats);
                              return cat?.icon || '💸';
                            })()}
                          </span>
                          <span className="text-slate-700 dark:text-slate-300 truncate">
                            {t.concept || 'Sin concepto'}
                          </span>
                        </div>
                        <span className="text-expense-600 dark:text-expense-400 font-semibold tabular-nums ml-2 flex-shrink-0">
                          {formatMoney(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">Sin gastos en este período</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
