// ================================================================
// HomePage — Resumen
// Como el dashboard de Balance Dual: KPIs del mes, últimos movimientos,
// evolución de seis meses, categorías, presupuesto, ahorro y destacados.
// (Lo que era la pestaña Estadísticas vive aquí desde la fase 3.)
// ================================================================

import { useMemo } from 'react';
import { ChartNoAxesColumn, Plus, Receipt, ArrowDown, ArrowUp, Store, PiggyBank, Wallet, Target, CreditCard } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useMonthlyData } from '@/hooks/useFinance';
import { mesDeLaVista, monthKeyLabel } from '@/lib/month-keys';
import { proximaFecha } from '@/lib/recurrence';
import { filtrarPorAmbito } from '@/lib/ambito';
import { useAmbito, useBudgetLinesEnAmbito, useDebtsEnAmbito, useExpensesEnAmbito, useGoalsEnAmbito } from '@/hooks/useAmbito';
import { useStatsPeriod, pctChange } from '@/hooks/useStatsPeriod';
import { formatMoney, LOCALE, safeParseDate, getTodayISO, roundMoney } from '@/lib/utils';
import { goalMath, goalTotals } from '@/lib/goals';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryById } from '@/config/categories';
import { MonthNav } from '@/components/layout/MonthNav';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { CardHeader } from '@/components/ui/CardHeader';
import { TrendCard, HighlightsCard } from '@/components/features/home/MonthInsights';
import { totalBalance } from '@/lib/accounts';
import { planFor, actualFor, budgetStatus } from '@/lib/budget-lines';
import { projectDebts, totalDebt, payoffDate } from '@/lib/debts';
import { netWorthNow } from '@/lib/networth';
import { ScopeBadge, TransactionAmount, TypePill } from '@/components/ui/TransactionBits';
import type { Transaction, TabId, Debt } from '@/types';

/* ─── Category Bar (simple, no recharts dependency for now) ─── */
function CategoryBreakdown({ porCategoria }: { porCategoria: [string, number][] }) {
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const navigateTo = useUiStore((s) => s.navigateTo);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const allExpenseCats = useMemo(
    () => [...EXPENSE_CATEGORIES, ...customExpenseCategories],
    [customExpenseCategories],
  );
  const categoryTotals = useMemo(() => porCategoria.slice(0, 10), [porCategoria]);

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
      <CardHeader
        titulo="Categorías principales"
        accion={
          <button
            onClick={() => { navigateTo('movements' as TabId, 'expense'); }}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0"
            title="Ver todos los gastos del mes"
            aria-label="Ver todos los gastos"
          >
            Ver gastos →
          </button>
        }
      />
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
                <span className="text-slate-600 dark:text-slate-400 tabular-nums">
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
      <CardHeader
        className="p-3 border-b border-slate-100 dark:border-slate-800"
        titulo="Últimos movimientos"
        accion={
          <button
            onClick={() => { setActiveTab('movements' as TabId); }}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline active:scale-95 transition-transform flex-shrink-0"
            title="Ver todos los movimientos"
            aria-label="Ver todos los movimientos"
          >
            Ver todos →
          </button>
        }
      />

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
                    <span className="text-xs text-slate-600 dark:text-slate-400">
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
                <span className="text-2xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {cat?.label || tx.category}
                </span>
                <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${tx.businessType === 'business' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                  {tx.businessType === 'business' ? 'Negocio' : 'Personal'}
                </span>
                <span className="text-2xs text-slate-600 dark:text-slate-400 ml-auto">
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
/* ─── Presupuestos a vigilar: las categorías más cerca de su límite ───
   Sustituye a la barra única que promediaba todas las categorías: desde la
   3.4 el presupuesto es por categoría, y lo que importa aquí no es el total
   sino cuál se está a punto de pasar (budgetPreviewCard de la referencia). */
function BudgetWatchlist() {
  const navigateTo = useUiStore((s) => s.navigateTo);
  const budgetLines = useBudgetLinesEnAmbito();
  const expenses = useExpensesEnAmbito();
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const customExpenseCats = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCats = useFinanceStore((s) => s.customIncomeCategories);
  const customCats = useMemo(
    () => [...customExpenseCats, ...customIncomeCats],
    [customExpenseCats, customIncomeCats],
  );

  const monthKey = useMemo(() => mesDeLaVista(currentViewDate), [currentViewDate]);

  const top = useMemo(() => {
    return budgetLines
      .filter((l) => l.kind === 'expense')
      .map((line) => {
        const limit = planFor(line, monthKey);
        const spent = actualFor(expenses, line, monthKey);
        return { line, limit, spent, ...budgetStatus(spent, limit) };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
  }, [budgetLines, expenses, monthKey]);

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader
        titulo="Presupuestos a vigilar"
        sub={`Los más cerca del límite · ${monthKeyLabel(monthKey)}`}
        accion={
          <button
            onClick={() => navigateTo('budgets' as TabId)}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0"
          >
            Ver todo
          </button>
        }
      />

      {top.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={Target}
          title="Aún no defines presupuestos"
          description="Ve a la pestaña Presupuestos"
        />
      ) : (
        <div className="space-y-3">
          {top.map(({ line, limit, spent, pct, status, label }) => {
            const cat = getCategoryById(line.categoryId, customCats);
            const barColor = status === 'good' ? 'bg-income-500' : status === 'warn' ? 'bg-amber-500' : 'bg-expense-500';
            const pillColor =
              status === 'good'
                ? 'bg-income-100 dark:bg-income-950 text-income-700 dark:text-income-400'
                : status === 'warn'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                  : 'bg-expense-100 dark:bg-expense-950 text-expense-700 dark:text-expense-400';
            return (
              <div key={line.id}>
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white truncate min-w-0">
                    <span className="flex-shrink-0">{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </span>
                  <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${pillColor}`}>{label}</span>
                </div>
                <ProgressBar pct={pct} color={barColor} label={`${cat.label}: ${pct.toFixed(0)}% del presupuesto`} />
                <p className="text-2xs text-slate-600 dark:text-slate-400 tabular-nums mt-1">
                  {formatMoney(spent)} de {formatMoney(limit)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Rumbo a cero deudas: mini-resumen con CTA a Deudas (debtMiniCard) ───
   Sin deudas registradas no se muestra: no hay nada que resumir. */
function DebtMiniCard() {
  const navigateTo = useUiStore((s) => s.navigateTo);
  const debts = useDebtsEnAmbito();
  const settings = useFinanceStore((s) => s.settings);

  const plan = useMemo(
    () => projectDebts(debts, settings.extraPayment, settings.debtMethod),
    [debts, settings.extraPayment, settings.debtMethod],
  );
  const siguiente = useMemo(
    () => plan.order.map((id) => debts.find((d) => d.id === id)).find((d): d is Debt => !!d),
    [plan.order, debts],
  );

  if (debts.length === 0) return null;

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader
        icono={CreditCard}
        titulo="Rumbo a cero deudas"
        sub={settings.debtMethod === 'avalanche' ? 'Método avalancha' : 'Método bola de nieve'}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Deuda total</p>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(totalDebt(debts))}</p>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Libre de deudas</p>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{plan.ok ? payoffDate(plan.months) : '—'}</p>
        </div>
      </div>
      {siguiente && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
          Siguiente en la fila: <strong className="text-slate-900 dark:text-white">{siguiente.name}</strong> — {formatMoney(siguiente.balance)}
          {plan.payoff[siguiente.id] ? `, liquidada en ${payoffDate(plan.payoff[siguiente.id])}` : ''}.
        </p>
      )}
      <button
        onClick={() => navigateTo('debts' as TabId)}
        className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline mt-3 inline-block"
      >
        Ver el plan completo →
      </button>
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
  const ambito = useAmbito();
  // "Resultado del negocio" no dice nada mirando solo lo personal.
  const conNegocio = ambito !== 'personal';
  const kpis = (accounts.length > 0 ? 1 : 0) + 3 + (conNegocio ? 1 : 0);

  // Tendencia, comparación con el mes anterior y destacados, para el mes
  // visible. Es el mismo hook que alimentaba Estadísticas, en modo mes.
  const vista = new Date(currentViewDate);
  const { trendData, prevTotals, expensesByCategory, largestExpense, peakDay, peakDayTransactions } = useStatsPeriod({
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
      <div className={`grid grid-cols-2 gap-3 animate-slide-up ${kpis === 5 ? 'md:grid-cols-3 lg:grid-cols-5' : kpis === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {accounts.length > 0 && (
          <button
            onClick={() => { navigateTo('accounts' as TabId); }}
            className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
            title="Ver cuentas"
          >
            <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <Wallet className="w-3 h-3" /> Saldo total
            </span>
            <span className={`block text-[clamp(1.05rem,5vw,1.5rem)] lg:text-2xl font-bold tabular-nums mt-1 whitespace-nowrap ${saldoCuentas >= 0 ? 'text-slate-900 dark:text-white' : 'text-expense-600 dark:text-expense-400'}`}>
              {formatMoney(saldoCuentas)}
            </span>
            <span className="block text-2xs text-slate-600 dark:text-slate-400 mt-0.5">
              {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}
            </span>
          </button>
        )}
        <div className="saas-card p-4">
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Saldo de {(() => { const d = new Date(currentViewDate); return `${d.toLocaleDateString(LOCALE, { month: 'long' })}`; })()}
          </p>
          <p className={`text-[clamp(1.05rem,5vw,1.5rem)] lg:text-2xl font-bold tabular-nums mt-1 whitespace-nowrap ${summary.available >= 0 ? 'text-slate-900 dark:text-white' : 'text-expense-600 dark:text-expense-400'}`}>
            {formatMoney(summary.available)}
          </p>
          <p className="text-2xs text-slate-600 dark:text-slate-400 mt-0.5">
            Ingresos − gastos del mes
          </p>
        </div>

        <button
          onClick={() => { navigateTo('movements' as TabId, 'income'); }}
          className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
          title="Ver ingresos"
        >
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <ArrowDown className="w-3 h-3" /> Ingresos
          </span>
          <span className="block text-[clamp(1.05rem,5vw,1.5rem)] lg:text-2xl font-bold tabular-nums mt-1 whitespace-nowrap text-income-600 dark:text-income-400">
            {formatMoney(summary.totalIncome)}
          </span>
          {prevTotals.income > 0 ? (
            <span className={`block text-2xs mt-0.5 tabular-nums ${summary.totalIncome >= prevTotals.income ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
              {pctChange(summary.totalIncome, prevTotals.income)} vs mes anterior
            </span>
          ) : (
            <span className="block text-2xs text-slate-600 dark:text-slate-400 mt-0.5">del mes en curso</span>
          )}
        </button>

        <button
          onClick={() => { navigateTo('movements' as TabId, 'expense'); }}
          className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
          title="Ver gastos"
        >
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <ArrowUp className="w-3 h-3" /> Gastos
          </span>
          <span className="block text-[clamp(1.05rem,5vw,1.5rem)] lg:text-2xl font-bold tabular-nums mt-1 whitespace-nowrap text-expense-600 dark:text-expense-400">
            {formatMoney(summary.totalSpent)}
          </span>
          {prevTotals.spent > 0 ? (
            <span className={`block text-2xs mt-0.5 tabular-nums ${summary.totalSpent <= prevTotals.spent ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
              {pctChange(summary.totalSpent, prevTotals.spent)} vs mes anterior
            </span>
          ) : (
            <span className="block text-2xs text-slate-600 dark:text-slate-400 mt-0.5">del mes en curso</span>
          )}
        </button>

        {conNegocio && (
        <button
          onClick={() => { navigateTo('movements' as TabId, 'business'); }}
          className="saas-card p-4 text-left hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
          title="Ver movimientos de negocio"
        >
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <Store className="w-3 h-3" /> Resultado del negocio
          </span>
          <span className={`block text-[clamp(1.05rem,5vw,1.5rem)] lg:text-2xl font-bold tabular-nums mt-1 whitespace-nowrap ${summary.businessProfit >= 0 ? 'text-business-600 dark:text-business-400' : 'text-expense-600 dark:text-expense-400'}`}>
            {formatMoney(summary.businessProfit)}
          </span>
          <span className="block text-2xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
            margen {summary.profitMargin.toFixed(1)}%
          </span>
        </button>
        )}
      </div>

      {/* Últimos movimientos: antes iba después de las tarjetas de categorías
          y presupuesto, obligando a pasar por dos bloques de solo lectura
          para llegar a la actividad reciente — que es lo que se revisa a
          diario, justo después del saldo. */}
      <RecentTransactions allData={monthlyData} />

      <TrendCard trendData={trendData} />

      {/* Gasto del mes + patrimonio | planes (presupuesto + metas) */}
      {/* Dos columnas desde tablet. Deudas y Patrimonio no se pintan sin
          datos, así que van con las tarjetas de gasto (que siempre existen)
          y la columna de planes queda Presupuestos + Metas: así ninguna
          columna termina medio vacía tenga o no deudas el usuario. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:items-start">
        <div className="space-y-4">
          <CategoryBreakdown porCategoria={expensesByCategory} />
          <HighlightsCard
            largestExpense={largestExpense}
            peakDay={peakDay}
            peakDayTransactions={peakDayTransactions}
            allCustomCats={allCustomCats}
          />
          <DebtMiniCard />
          <NetWorthWidget />
        </div>
        <div className="space-y-4">
          <BudgetWatchlist />
          <ProximosCargos />
          <SavingsGoalWidget />
        </div>
      </div>
    </div>
  );
}

/* ─── Ahorro del Mes Widget (solo lectura + CTA a Planes) ─── */
/* ─── Metas de ahorro: mini-resumen con CTA a Metas (goalsMiniCard) ───
   Antes agrupaba gastos de categoría "ahorro" por texto de concepto; desde
   la 3.8 cada meta lleva su propio `saved`, así que esto lee directo de
   savingsGoals en vez de escanear movimientos. */
function SavingsGoalWidget() {
  const savingsGoals = useGoalsEnAmbito();
  const navigateTo = useUiStore((s) => s.navigateTo);

  const totals = useMemo(() => goalTotals(savingsGoals), [savingsGoals]);
  const top = useMemo(
    () => savingsGoals.slice(0, 3).map((g) => ({ goal: g, m: goalMath(g) })),
    [savingsGoals],
  );

  if (savingsGoals.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Sin metas activas"
        description="Define un fondo de emergencia o un objetivo y la app calcula el aporte mensual"
        action={{ label: 'Crear meta', icon: Plus, onClick: () => navigateTo('goals' as TabId) }}
      />
    );
  }

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader
        icono={PiggyBank}
        titulo="Metas de ahorro"
        accion={
          <span className="text-xs text-slate-600 dark:text-slate-400 flex-shrink-0">
            {savingsGoals.length} {savingsGoals.length === 1 ? 'meta activa' : 'metas activas'}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Ahorrado</p>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(totals.saved)}</p>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">A guardar por mes</p>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(totals.monthly)}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {top.map(({ goal, m }) => (
          <div key={goal.id}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="truncate text-slate-700 dark:text-slate-300">{goal.concept}</span>
              <span className="text-slate-600 dark:text-slate-400 tabular-nums flex-shrink-0">{m.pct.toFixed(0)}%</span>
            </div>
            <ProgressBar pct={m.pct} label={`${goal.concept}: ${m.pct.toFixed(0)}% ahorrado`} />
          </div>
        ))}
      </div>

      <button
        onClick={() => navigateTo('goals' as TabId)}
        className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline mt-3 inline-block"
      >
        Ver metas →
      </button>
    </div>
  );
}

/* ─── Próximos cargos: lo que las recurrencias registrarán solas ─── */
function ProximosCargos() {
  const recurrences = useFinanceStore((s) => s.recurrences);
  const ambito = useAmbito();
  const navigateTo = useUiStore((s) => s.navigateTo);

  const proximos = useMemo(() => {
    const hoy = getTodayISO();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    const hasta = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
    return filtrarPorAmbito(recurrences, ambito, (r) => r.businessType)
      .map((r) => ({ r, fecha: proximaFecha(r, hoy) }))
      .filter((x): x is { r: typeof recurrences[number]; fecha: string } => !!x.fecha && x.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [recurrences, ambito]);

  if (proximos.length === 0) return null;

  const salidas = roundMoney(
    proximos.filter((x) => x.r.type === 'expense').reduce((acc, x) => acc + x.r.amount, 0),
  );

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader
        titulo="Próximos cargos"
        sub="Lo que se registrará solo en los próximos 30 días"
        accion={
          <button
            onClick={() => navigateTo('movements' as TabId)}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0"
          >
            Ver todo
          </button>
        }
      />
      <ul className="space-y-1.5">
        {proximos.slice(0, 4).map(({ r, fecha }) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-slate-700 dark:text-slate-300">
              {r.concept || r.category}{' '}
              <span className="text-slate-600 dark:text-slate-400">
                · {safeParseDate(fecha).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
              </span>
            </span>
            <span className={`tabular-nums flex-shrink-0 font-semibold ${r.type === 'income' ? 'text-income-600 dark:text-income-400' : 'text-slate-900 dark:text-white'}`}>
              {r.type === 'income' ? '+' : '−'}{formatMoney(r.amount)}
            </span>
          </li>
        ))}
      </ul>
      {salidas > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 tabular-nums">
          Salidas previstas: {formatMoney(salidas)}
        </p>
      )}
    </div>
  );
}

/* ─── Patrimonio neto (solo lectura + CTA a Patrimonio), como en la referencia ─── */
function NetWorthWidget() {
  const ambito = useAmbito();
  const accounts = useFinanceStore((s) => s.accounts);
  const expenses = useFinanceStore((s) => s.expenses);
  const assets = useFinanceStore((s) => s.assets);
  const debts = useFinanceStore((s) => s.debts);
  const savingsGoals = useFinanceStore((s) => s.savingsGoals);
  const goal = useFinanceStore((s) => s.settings.netWorthGoal);
  const navigateTo = useUiStore((s) => s.navigateTo);
  const nw = useMemo(() => netWorthNow({ accounts, expenses, assets, debts, savingsGoals }), [accounts, expenses, assets, debts, savingsGoals]);

  // Sin cuentas, activos ni deudas no hay patrimonio que mostrar.
  if (accounts.length === 0 && assets.length === 0 && debts.length === 0) return null;
  const pct = goal > 0 ? Math.max(0, Math.min(100, (nw.net / goal) * 100)) : 0;

  return (
    <div className="saas-card p-4 animate-slide-up">
      <CardHeader
        titulo="Patrimonio neto"
        sub={ambito === 'all'
          ? 'Lo que tienes menos lo que debes'
          : 'Lo que tienes menos lo que debes · incluye ambos ámbitos'}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Hoy</p>
          <p className={`text-xl font-bold tabular-nums ${nw.net >= 0 ? 'text-slate-900 dark:text-white' : 'text-expense-600 dark:text-expense-400'}`}>{formatMoney(nw.net)}</p>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Activos / pasivos</p>
          <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(nw.assets)} / {formatMoney(nw.liabilities)}</p>
        </div>
      </div>
      {goal > 0 ? (
        <div className="mt-3">
          <ProgressBar pct={pct} label={`Patrimonio: ${pct.toFixed(0)}% de la meta`} />
          <p className="text-2xs text-slate-600 dark:text-slate-400 mt-1">{pct.toFixed(0)}% de tu meta de {formatMoney(goal)}</p>
        </div>
      ) : (
        <p className="text-2xs text-slate-600 dark:text-slate-400 mt-3">Define una meta en la sección Patrimonio para ver el avance.</p>
      )}
      <button onClick={() => navigateTo('networth' as TabId)} className="saas-btn saas-btn-secondary saas-btn-sm mt-3">
        Ver patrimonio
      </button>
    </div>
  );
}
