// ================================================================
// HomePage — Dashboard SaaS unificado
// ================================================================

import { useMemo, useEffect, useRef } from 'react';
import { ChartNoAxesColumn, Plus, Receipt, AlertCircle, ArrowDown, ArrowUp, Store, PiggyBank } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useMonthlyData } from '@/hooks/useFinance';
import { useBudget } from '@/hooks/useBudget';
import { formatMoney, safeParseDate } from '@/lib/utils';
import { computeSavingsByConcept } from '@/lib/savings';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/config/categories';
import { MonthNav } from '@/components/layout/MonthNav';
import type { Transaction, TabId } from '@/types';

/* ─── Category Bar (simple, no recharts dependency for now) ─── */
function CategoryBreakdown({ expenses }: { expenses: Transaction[] }) {
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const navigateTo = useUiStore((s) => s.navigateTo);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const allExpenseCats = useMemo(
    () => [...EXPENSE_CATEGORIES, ...customExpenseCategories],
    [customExpenseCategories],
  );
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses
      .filter((e) => e.type === 'expense')
      .forEach((e) => {
        map[e.category] = (map[e.category] || 0) + e.amount;
      });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [expenses]);

  const max = categoryTotals[0]?.[1] || 1;

  if (categoryTotals.length === 0) {
    return (
      <div className="saas-card p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <ChartNoAxesColumn className="text-slate-500 dark:text-slate-400 w-5 h-5" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Sin datos de gastos este mes</p>
        <button
          onClick={() => { setActiveTab('movements' as TabId); }}
          className="saas-btn-primary saas-btn-sm mt-3"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir transacción
        </button>
      </div>
    );
  }

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Categorías principales</h3>
        <button
          onClick={() => { setActiveTab('stats' as TabId); }}
          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
          title="Ver estadísticas detalladas"
          aria-label="Ver todas las categorías"
        >
          Ver todas →
        </button>
      </div>
      <div className="space-y-2.5">
        {categoryTotals.map(([catId, total]) => {
          const cat = allExpenseCats.find((c) => c.id === catId);
          const pct = Math.round((total / max) * 100);
          return (
            <div
              key={catId}
              className="group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-0.5 rounded-lg transition-colors"
              onClick={() => { navigateTo('movements' as TabId, catId); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigateTo('movements' as TabId, catId); }}
              title={`Filtrar por ${cat?.label || catId}`}
            >
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>{cat?.icon || '📌'}</span>
                  {cat?.label || catId}
                </span>
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatMoney(total)}
                </span>
              </div>
              <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 dark:bg-brand-400 rounded-full transition-all duration-500 group-hover:bg-brand-600"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Recent Transactions ─── */
function RecentTransactions({ allData }: { allData: Transaction[] }) {
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const openModal = useUiStore((s) => s.openModal);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const allCats = useMemo(
    () => [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...customExpenseCategories, ...customIncomeCategories],
    [customExpenseCategories, customIncomeCategories],
  );

  const recent = useMemo(
    () => [...allData].sort((a, b) => safeParseDate(b.date).getTime() - safeParseDate(a.date).getTime()).slice(0, 5),
    [allData],
  );

  if (allData.length === 0) {
    return (
      <div className="saas-card p-6 text-center animate-slide-up">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Receipt className="text-slate-500 dark:text-slate-400 w-5 h-5" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No hay movimientos este mes</p>
        <button
          onClick={() => openModal()}
          className="saas-btn-primary saas-btn-sm mt-3"
        >
          <Plus className="w-3.5 h-3.5" />
          Crear primer movimiento
        </button>
      </div>
    );
  }

  return (
    <div className="saas-card animate-slide-up overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Últimos movimientos</h3>
        <button
          onClick={() => { setActiveTab('movements' as TabId); }}
          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline active:scale-95 transition-transform"
          title="Ver todos los movimientos"
          aria-label="Ver todos los movimientos"
        >
          Ver todos →
        </button>
      </div>

      {/* Desktop: table — same columns as MovementsPage */}
      <div className="hidden md:block overflow-x-auto ios-scroll">
        <table className="saas-table w-full">
          <thead>
            <tr>
              <th className="w-10 text-center"></th>
              <th>Concepto</th>
              <th className="whitespace-nowrap">Ámbito</th>
              <th className="whitespace-nowrap">Categoría</th>
              <th className="whitespace-nowrap">Tipo</th>
              <th className="whitespace-nowrap">Fecha</th>
              <th className="whitespace-nowrap !text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((tx) => {
              const cat = allCats.find((c) => c.id === tx.category);
              return (
                <tr
                  key={tx.id}
                  className="cursor-pointer"
                  onClick={() => openModal(tx.id)}
                >
                  <td className="text-center">
                    <span className="text-base">{cat?.icon || '📌'}</span>
                  </td>
                  <td>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {tx.concept}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {tx.businessType === 'business' ? (
                      <span className="saas-badge-blue text-[11px]">Negocio</span>
                    ) : (
                      <span className="saas-badge-slate text-[11px]">Personal</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {cat?.label || tx.category}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tx.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'}`}>
                      {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {safeParseDate(tx.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className={`whitespace-nowrap text-right text-sm font-semibold tabular-nums ${tx.type === 'income' ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: card view */}
      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
        {recent.map((tx) => {
          const cat = allCats.find((c) => c.id === tx.category);
          return (
            <div
              key={tx.id}
              className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => openModal(tx.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-base flex-shrink-0">{cat?.icon || '📌'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {tx.concept}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${tx.type === 'income' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${tx.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'}`}>
                  {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {cat?.label || tx.category}
                </span>
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${tx.businessType === 'business' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                  {tx.businessType === 'business' ? 'Negocio' : 'Personal'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-auto">
                  {safeParseDate(tx.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Budget Card (solo lectura) ───
   El dashboard es un status board: muestra el estado y navega a la sección
   Planes para editar. Nada de inputs inline (principio monitor ≠ editor). */
function BudgetWidget() {
  const navigateTo = useUiStore((s) => s.navigateTo);
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const addToast = useUiStore((s) => s.addToast);

  const monthKey = (() => {
    const d = new Date(currentViewDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const { budget, monthSpent, pct, isCarriedOver, colorBar, emoji, message } = useBudget(monthKey);

  // Toast cuando se excede el presupuesto (solo una vez por mes)
  const exceededNotifiedRef = useRef(false);
  useEffect(() => {
    if (pct > 100 && !exceededNotifiedRef.current && budget > 0) {
      addToast(`⚠️ Presupuesto excedido en ${formatMoney(monthSpent - budget)}`, 'error');
      exceededNotifiedRef.current = true;
    }
    // Resetear al cambiar de mes
    if (pct <= 100) exceededNotifiedRef.current = false;
  }, [pct, budget, monthSpent, addToast]);

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Presupuesto mensual</h3>
        <div className="flex items-center gap-1.5">
          {budget > 0 && (
            <button
              onClick={() => navigateTo('savings' as TabId)}
              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
              title="Ajustar presupuesto en Planes"
            >
              Ajustar
            </button>
          )}
          <span className="text-lg">{emoji}</span>
        </div>
      </div>

      {/* ── Sin presupuesto ── */}
      {budget === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Define cuánto quieres gastar este mes</p>
          <button
            onClick={() => navigateTo('savings' as TabId)}
            className="saas-btn-primary saas-btn-sm"
          >
            Definir presupuesto →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {isCarriedOver && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
              Presupuesto heredado del mes anterior
            </p>
          )}
          {/* Alerta de excedido — banner notorio */}
          {pct > 100 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 animate-pulse">
              <AlertCircle className="text-red-600 dark:text-red-400 w-4 h-4" />
              <span className="text-xs font-bold text-red-700 dark:text-red-400">
                ¡Presupuesto excedido por {formatMoney(monthSpent - budget)}!
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className={`font-semibold ${pct > 100 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {formatMoney(monthSpent)} de {formatMoney(budget)}
            </span>
            <span className={`font-bold text-sm ${pct > 100 ? 'text-red-600 dark:text-red-400' : pct > 90 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {pct}%
            </span>
          </div>
          <div className={`h-2.5 rounded-full overflow-hidden ${pct > 100 ? 'bg-red-100 dark:bg-red-950/80 ring-1 ring-red-300 dark:ring-red-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
            <div
              className={`h-full ${colorBar} rounded-full transition-all duration-500 ${pct > 100 ? 'animate-pulse' : ''}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className={`text-xs font-medium ${pct > 100 ? 'text-red-600 dark:text-red-400' : pct > 90 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {message}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Main Dashboard ─── */
export function HomePage() {
  const { summary, monthlyData } = useMonthlyData();
  const navigateTo = useUiStore((s) => s.navigateTo);
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);

  // For now, we always show data since Zustand starts with defaults
  return (
    <div className="space-y-4 animate-fade-in pb-14 md:pb-0">
      {/* Month navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <MonthNav showReport />
      </div>
      {/* KPI Row → Hero de saldo con gradiente (fintech) + sub-KPIs clicables */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white p-4 sm:p-5 shadow-lg shadow-brand-600/25 animate-slide-up">
        {/* Decoración de fondo */}
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-brand-400/20 blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-200">
                Saldo de {(() => { const d = new Date(currentViewDate); return `${d.toLocaleDateString('es-EC', { month: 'long' })} ${d.getFullYear()}`; })()}
              </p>
              <p className="text-3xl sm:text-4xl font-extrabold tabular-nums mt-1 truncate">
                {formatMoney(summary.available)}
              </p>
              <p className="text-xs text-brand-200 mt-0.5">
                Ingresos − gastos del mes
              </p>
            </div>
          </div>

          {/* Columnas de detalle — clicables para filtrar */}
          <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-3 gap-2">
            <button
              onClick={() => { navigateTo('movements' as TabId, 'income'); }}
              className="text-left rounded-xl p-2 -m-1 hover:bg-white/10 active:bg-white/15 transition-colors group"
              title="Ver ingresos"
            >
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand-200">
                <ArrowDown className="w-3 h-3" /> Ingresos
              </span>
              <span className="block text-sm sm:text-base font-bold tabular-nums mt-0.5 truncate">
                +{formatMoney(summary.totalIncome)}
              </span>
            </button>
            <button
              onClick={() => { navigateTo('movements' as TabId, 'expense'); }}
              className="text-left rounded-xl p-2 -m-1 hover:bg-white/10 active:bg-white/15 transition-colors"
              title="Ver gastos"
            >
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand-200">
                <ArrowUp className="w-3 h-3" /> Gastos
              </span>
              <span className="block text-sm sm:text-base font-bold tabular-nums mt-0.5 truncate">
                −{formatMoney(summary.totalSpent)}
              </span>
            </button>
            <button
              onClick={() => { navigateTo('movements' as TabId, 'business'); }}
              className="text-left rounded-xl p-2 -m-1 hover:bg-white/10 active:bg-white/15 transition-colors"
              title="Ver movimientos de negocio"
            >
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand-200">
                <Store className="w-3 h-3" /> Negocio
              </span>
              <span className="block text-sm sm:text-base font-bold tabular-nums mt-0.5 truncate">
                {formatMoney(summary.businessProfit)}
              </span>
              <span className="block text-[11px] text-brand-200/90 tabular-nums">
                margen {summary.profitMargin.toFixed(1)}%
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Chart + Budget row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        <div className="space-y-4">
          <CategoryBreakdown expenses={monthlyData} />
        </div>
        <div className="space-y-4">
          <BudgetWidget />
          <SavingsGoalWidget totalIncome={summary.totalIncome} />
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactions allData={monthlyData} />
    </div>
  );
}

/* ─── Ahorro del Mes Widget (solo lectura + CTA a Planes) ─── */
function SavingsGoalWidget({ totalIncome }: { totalIncome: number }) {
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const expenses = useFinanceStore((s) => s.expenses);
  const navigateTo = useUiStore((s) => s.navigateTo);

  // Agrupar ahorros del mes por concepto
  const savingsByConcept = useMemo(() => {
    const d = new Date(currentViewDate);
    const byConcept = computeSavingsByConcept(expenses, {
      year: d.getFullYear(),
      month: d.getMonth(),
    });
    return Array.from(byConcept.entries())
      .map(([concept, saved]) => ({ concept, saved }))
      .sort((a, b) => b.saved - a.saved);
  }, [expenses, currentViewDate]);

  const totalSaved = savingsByConcept.reduce((s, g) => s + g.saved, 0);
  const savingsPct = totalIncome > 0 ? Math.round((totalSaved / totalIncome) * 100) : 0;

  const emoji = totalSaved > 10000 ? '💰' : totalSaved > 5000 ? '🐷' : totalSaved > 1000 ? '🪙' : totalSaved > 0 ? '🌱' : '💤';

  if (savingsByConcept.length === 0) {
    return (
      <div className="saas-card p-4 animate-slide-up">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            <PiggyBank className="text-brand-500 mr-2" />
            Ahorro del mes
          </h3>
          <button
            onClick={() => navigateTo('savings' as TabId)}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
            title="Ver metas en Planes"
          >
            Ver metas →
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sin movimientos de ahorro este mes
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Crea una meta en Planes y aporta con el botón <strong>Aportar</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          <PiggyBank className="text-brand-500 mr-2" />
          Ahorro del mes
        </h3>
        <div className="flex items-center gap-2">
          {savingsPct > 0 && (
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded-full">
              {savingsPct}% del ingreso
            </span>
          )}
          <button
            onClick={() => navigateTo('savings' as TabId)}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
            title="Ver metas en Planes"
          >
            Ver metas →
          </button>
          <span className="text-lg">{emoji}</span>
        </div>
      </div>

      {/* Total */}
      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mb-3">
        {formatMoney(totalSaved)}
      </p>

      {/* Conceptos individuales */}
      <div className="space-y-2.5">
        {savingsByConcept.map((g) => (
          <div key={g.concept} className="flex items-center justify-between gap-2 py-1 px-1.5 -mx-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <PiggyBank className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                {g.concept}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 tabular-nums flex-shrink-0">
              {formatMoney(g.saved)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
