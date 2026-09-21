// ================================================================
// HomePage — Resumen
// Como el dashboard de Balance Dual: KPIs del mes, últimos movimientos,
// evolución de seis meses, categorías, presupuesto, ahorro y destacados.
// (Lo que era la pestaña Estadísticas vive aquí desde la fase 3.)
// ================================================================

import { useMemo, useEffect, useRef } from 'react';
import { ChartNoAxesColumn, Plus, Receipt, ArrowDown, ArrowUp, Store, PiggyBank, Wallet } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useMonthlyData } from '@/hooks/useFinance';
import { useStatsPeriod, pctChange } from '@/hooks/useStatsPeriod';
import { useBudget } from '@/hooks/useBudget';
import { formatMoney, LOCALE, roundMoney, safeParseDate } from '@/lib/utils';
import { computeSavingsByConcept } from '@/lib/savings';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/config/categories';
import { MonthNav } from '@/components/layout/MonthNav';
import { BudgetProgress } from '@/components/ui/BudgetProgress';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendCard, HighlightsCard } from '@/components/features/home/MonthInsights';
import { totalBalance } from '@/lib/accounts';
import { ScopeBadge, TransactionAmount, TypePill } from '@/components/ui/TransactionBits';
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
      <EmptyState
        icon={ChartNoAxesColumn}
        title="Sin datos de gastos este mes"
        action={{
          label: 'Añadir transacción',
          icon: Plus,
          onClick: () => setActiveTab('movements' as TabId),
        }}
      />
    );
  }

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Categorías principales</h2>
        <button
          onClick={() => { navigateTo('movements' as TabId, 'expense'); }}
          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
          title="Ver todos los gastos del mes"
          aria-label="Ver todos los gastos"
        >
          Ver gastos →
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigateTo('movements' as TabId, catId);
                }
              }}
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
      <EmptyState
        icon={Receipt}
        title="No hay movimientos este mes"
        action={{ label: 'Crear primer movimiento', icon: Plus, onClick: () => openModal() }}
      />
    );
  }

  return (
    <div className="saas-card animate-slide-up overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Últimos movimientos</h2>
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
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  onClick={() => openModal(tx.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Editar ${tx.concept}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openModal(tx.id);
                    }
                  }}
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
                    <ScopeBadge businessType={tx.businessType} />
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {cat?.label || tx.category}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <TypePill type={tx.type} />
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {safeParseDate(tx.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <TransactionAmount type={tx.type} amount={tx.amount} className="text-sm font-semibold" />
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
              className="p-3 active:scale-[0.98] transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              onClick={() => openModal(tx.id)}
              role="button"
              tabIndex={0}
              aria-label={`Editar ${tx.concept}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openModal(tx.id);
                }
              }}
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
                  <TransactionAmount type={tx.type} amount={tx.amount} className="block text-sm font-bold" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <TypePill type={tx.type} className="text-2xs px-1.5 py-0.5 rounded" />
                <span className="text-2xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {cat?.label || tx.category}
                </span>
                <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${tx.businessType === 'business' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                  {tx.businessType === 'business' ? 'Negocio' : 'Personal'}
                </span>
                <span className="text-2xs text-slate-500 dark:text-slate-400 ml-auto">
                  {safeParseDate(tx.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
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
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Presupuesto mensual</h2>
        <div className="flex items-center gap-1.5">
          {budget > 0 && (
            <button
              onClick={() => navigateTo('goals' as TabId)}
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
            onClick={() => navigateTo('goals' as TabId)}
            className="saas-btn-primary saas-btn-sm"
          >
            Definir presupuesto →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {isCarriedOver && (
            <p className="text-2xs text-slate-500 dark:text-slate-400 italic">
              Presupuesto heredado del mes anterior
            </p>
          )}
          <BudgetProgress
            monthSpent={monthSpent}
            budget={budget}
            pct={pct}
            colorBar={colorBar}
            message={message}
            destacarExcedido
          />
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
  const customExpenseCats = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCats = useFinanceStore((s) => s.customIncomeCategories);
  const allCustomCats = useMemo(() => [...customExpenseCats, ...customIncomeCats], [customExpenseCats, customIncomeCats]);
  const accounts = useFinanceStore((s) => s.accounts);
  const expenses = useFinanceStore((s) => s.expenses);
  // "Saldo total" en cuentas, como el primer KPI del dashboard de Balance Dual.
  // Solo cuando hay cuentas: sin ellas no hay nada que sumar.
  const saldoCuentas = useMemo(() => totalBalance(accounts, expenses), [accounts, expenses]);

  // Tendencia, comparación con el mes anterior y destacados, para el mes
  // visible. Es el mismo hook que alimentaba Estadísticas, en modo mes.
  const vista = new Date(currentViewDate);
  const { trendData, totals, prevTotals, largestExpense, peakDay, peakDayTransactions } = useStatsPeriod({
    mode: 'month',
    month: vista.getMonth(),
    year: vista.getFullYear(),
    fromDate: null,
    toDate: null,
  });

  // For now, we always show data since Zustand starts with defaults
  return (
    <div className="space-y-4 animate-fade-in pb-14 md:pb-0">
      {/* Month navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <MonthNav showReport />
      </div>
      {/* ── Fila de KPIs ──
          Antes esto era un héroe con degradado de marca y las tres cifras
          dentro, en blanco sobre azul. Se cambió por cuatro fichas del mismo
          material que el resto del tablero: un panel de estado se lee mejor
          cuando todas las cifras tienen el mismo peso visual y se comparan
          entre sí, y el degradado obligaba a un juego de colores propio
          (texto blanco, brand-200) que no existía en ninguna otra pantalla. */}
      <div className={`grid grid-cols-2 gap-3 animate-slide-up ${accounts.length > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {accounts.length > 0 && (
          <button
            onClick={() => { navigateTo('accounts' as TabId); }}
            className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
            title="Ver cuentas"
          >
            <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Wallet className="w-3 h-3" /> Saldo total
            </span>
            <span className={`block text-2xl font-bold tabular-nums mt-1 truncate ${saldoCuentas >= 0 ? 'text-slate-900 dark:text-white' : 'text-expense-600 dark:text-expense-400'}`}>
              {formatMoney(saldoCuentas)}
            </span>
            <span className="block text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
              {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}
            </span>
          </button>
        )}
        <div className="saas-card p-4">
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Saldo de {(() => { const d = new Date(currentViewDate); return `${d.toLocaleDateString(LOCALE, { month: 'long' })}`; })()}
          </p>
          <p className={`text-2xl font-bold tabular-nums mt-1 truncate ${summary.available >= 0 ? 'text-slate-900 dark:text-white' : 'text-expense-600 dark:text-expense-400'}`}>
            {formatMoney(summary.available)}
          </p>
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ingresos − gastos del mes
          </p>
        </div>

        <button
          onClick={() => { navigateTo('movements' as TabId, 'income'); }}
          className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
          title="Ver ingresos"
        >
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <ArrowDown className="w-3 h-3" /> Ingresos
          </span>
          <span className="block text-2xl font-bold tabular-nums mt-1 truncate text-income-600 dark:text-income-400">
            {formatMoney(summary.totalIncome)}
          </span>
          {prevTotals.income > 0 ? (
            <span className={`block text-2xs mt-0.5 tabular-nums ${totals.income >= prevTotals.income ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
              {pctChange(totals.income, prevTotals.income)} vs mes anterior
            </span>
          ) : (
            <span className="block text-2xs text-slate-500 dark:text-slate-400 mt-0.5">del mes en curso</span>
          )}
        </button>

        <button
          onClick={() => { navigateTo('movements' as TabId, 'expense'); }}
          className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
          title="Ver gastos"
        >
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <ArrowUp className="w-3 h-3" /> Gastos
          </span>
          <span className="block text-2xl font-bold tabular-nums mt-1 truncate text-expense-600 dark:text-expense-400">
            {formatMoney(summary.totalSpent)}
          </span>
          {prevTotals.spent > 0 ? (
            <span className={`block text-2xs mt-0.5 tabular-nums ${totals.spent <= prevTotals.spent ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
              {pctChange(totals.spent, prevTotals.spent)} vs mes anterior
            </span>
          ) : (
            <span className="block text-2xs text-slate-500 dark:text-slate-400 mt-0.5">del mes en curso</span>
          )}
        </button>

        <button
          onClick={() => { navigateTo('movements' as TabId, 'business'); }}
          className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
          title="Ver movimientos de negocio"
        >
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Store className="w-3 h-3" /> Resultado del negocio
          </span>
          <span className={`block text-2xl font-bold tabular-nums mt-1 truncate ${summary.businessProfit >= 0 ? 'text-business-600 dark:text-business-400' : 'text-expense-600 dark:text-expense-400'}`}>
            {formatMoney(summary.businessProfit)}
          </span>
          <span className="block text-2xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            margen {summary.profitMargin.toFixed(1)}%
          </span>
        </button>
      </div>

      {/* Últimos movimientos: antes iba después de las tarjetas de categorías
          y presupuesto, obligando a pasar por dos bloques de solo lectura
          para llegar a la actividad reciente — que es lo que se revisa a
          diario, justo después del saldo. */}
      <RecentTransactions allData={monthlyData} />

      <TrendCard trendData={trendData} />

      {/* Categorías + destacados | presupuesto + ahorro */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        <div className="space-y-4">
          <CategoryBreakdown expenses={monthlyData} />
          <HighlightsCard
            largestExpense={largestExpense}
            peakDay={peakDay}
            peakDayTransactions={peakDayTransactions}
            allCustomCats={allCustomCats}
          />
        </div>
        <div className="space-y-4">
          <BudgetWidget />
          <SavingsGoalWidget totalIncome={summary.totalIncome} />
        </div>
      </div>
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

  const totalSaved = roundMoney(savingsByConcept.reduce((s, g) => s + g.saved, 0));
  const savingsPct = totalIncome > 0 ? Math.round((totalSaved / totalIncome) * 100) : 0;

  const emoji = totalSaved > 10000 ? '💰' : totalSaved > 5000 ? '🐷' : totalSaved > 1000 ? '🪙' : totalSaved > 0 ? '🌱' : '💤';

  if (savingsByConcept.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Sin movimientos de ahorro este mes"
        description="Crea una meta en Planes y aporta con el botón Aportar"
        action={{ label: 'Crear meta', icon: Plus, onClick: () => navigateTo('goals' as TabId) }}
      />
    );
  }

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          <PiggyBank className="text-brand-500 mr-2" />
          Ahorro del mes
        </h2>
        <div className="flex items-center gap-2">
          {savingsPct > 0 && (
            <span className="saas-badge-green text-2xs font-semibold px-1.5 py-0.5">
              {savingsPct}% del ingreso
            </span>
          )}
          <button
            onClick={() => navigateTo('goals' as TabId)}
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
