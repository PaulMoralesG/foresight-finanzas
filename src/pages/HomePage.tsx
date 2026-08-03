// ================================================================
// HomePage — Dashboard SaaS unificado
// ================================================================

import { useMemo, useState, useEffect, useRef } from 'react';
import { ChartNoAxesColumn, Plus, Receipt, Pencil, Check, X, AlertCircle, Scale, ArrowDown, ArrowUp, Store, PiggyBank } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { useMonthlyData } from '@/hooks/useFinance';
import { formatMoney, safeParseDate, syncToCloud, parseMoneyInput } from '@/lib/utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/config/categories';
import { MonthNav } from '@/components/layout/MonthNav';
import type { Transaction, TabId } from '@/types';

/* ─── KPI Card ─── */
function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  colorClass,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: string;
  colorClass: string;
  onClick?: () => void;
}) {
  return (
    <div className="animate-slide-up">
    <div
      className={`saas-card p-4 transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : 'cursor-default'}`}
      onClick={onClick}
      title={onClick ? `Ver ${label.toLowerCase()}` : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${colorClass}`}>
          <Icon />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 dark:text-white mb-0.5">{value}</p>
      {trend && (
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{trend}</span>
      )}
    </div>
    </div>
  );
}

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
          <ChartNoAxesColumn className="text-slate-400 text-lg" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Sin datos de gastos este mes</p>
        <button
          onClick={() => { setActiveTab('movements' as TabId); }}
          className="saas-btn-primary saas-btn-sm mt-3"
        >
          <Plus className="text-xs" />
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
          <Receipt className="text-slate-400 text-lg" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No hay movimientos este mes</p>
        <button
          onClick={() => openModal()}
          className="saas-btn-primary saas-btn-sm mt-3"
        >
          <Plus className="text-xs" />
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
                      <span className="saas-badge-blue text-[10px]">Negocio</span>
                    ) : (
                      <span className="saas-badge-slate text-[10px]">Personal</span>
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
                  <p className={`text-sm font-bold tabular-nums ${tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tx.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'}`}>
                  {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {cat?.label || tx.category}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tx.businessType === 'business' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                  {tx.businessType === 'business' ? 'Negocio' : 'Personal'}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
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

/* ─── Budget Alert ─── */
function BudgetWidget() {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const budgets = useFinanceStore((s) => s.budgets);
  const expenses = useFinanceStore((s) => s.expenses);
  const getMonthlyData = useFinanceStore((s) => s.getMonthlyData);
  const setBudget = useFinanceStore((s) => s.setBudget);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();

  const monthKey = (() => {
    const d = new Date(currentViewDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // Carry-forward: si no hay presupuesto para el mes actual, usar el más reciente del pasado
  const budget = (() => {
    if (budgets[monthKey]) return budgets[monthKey];
    // Buscar el presupuesto más reciente de meses pasados
    const keys = Object.keys(budgets).sort().reverse();
    for (const k of keys) {
      if (k < monthKey && budgets[k] > 0) return budgets[k];
    }
    return 0;
  })();

  // ¿Es un presupuesto heredado de un mes anterior?
  const isCarriedOver = budget > 0 && !budgets[monthKey];

  const monthlyData = useMemo(() => getMonthlyData(), [getMonthlyData, expenses, currentViewDate]);

  const monthSpent = useMemo(
    () => monthlyData.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0),
    [monthlyData]
  );
  const pct = budget > 0 ? Math.round((monthSpent / budget) * 100) : 0;

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

  const colorBar =
    pct > 100 ? 'bg-red-500' :
    pct === 100 ? 'bg-orange-600' :
    pct > 90 ? 'bg-orange-500' :
    pct > 75 ? 'bg-yellow-500' :
    pct > 50 ? 'bg-brand-500' :
    'bg-emerald-500';

  const emoji =
    pct > 100 ? '🔥' :
    pct === 100 ? '🎯' :
    pct > 90 ? '⚠️' :
    pct > 75 ? '👀' :
    pct > 50 ? '👍' :
    '🎉';

  const message =
    pct > 100 ? 'Te pasaste del presupuesto' :
    pct === 100 ? '¡Alcanzaste el límite!' :
    pct > 90 ? 'Casi llegas al límite' :
    pct > 75 ? 'Vas a buen ritmo' :
    pct > 50 ? 'Todo bajo control' :
    budget > 0 ? 'Excelente control' :
    'Define tu presupuesto';

  const handleSaveEdit = () => {
    const v = parseMoneyInput(editValue);
    if (!isNaN(v) && v >= 0) {
      setBudget(monthKey, v);
      setIsEditing(false);
      setEditValue('');
      syncToCloud(saveData, addToast);
    }
  };

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Presupuesto mensual</h3>
        <div className="flex items-center gap-1.5">
          {budget > 0 && !isEditing && (
            <button
              onClick={() => { setIsEditing(true); setEditValue(String(budget)); }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950 transition-all"
              title="Editar presupuesto"
            >
              <Pencil className="inline w-3 h-3" />
            </button>
          )}
          <span className="text-lg">{emoji}</span>
        </div>
      </div>

      {/* ── Modo edición ── */}
      {isEditing && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Ajusta el límite mensual</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="saas-input flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') { setIsEditing(false); setEditValue(''); }
              }}
            />
            <button onClick={handleSaveEdit} className="saas-btn-primary" aria-label="Guardar presupuesto">
              <Check className="text-xs" />
            </button>
            <button
              onClick={() => { setIsEditing(false); setEditValue(''); }}
              className="saas-btn-secondary"
              aria-label="Cancelar edición"
            >
              <X className="text-xs" />
            </button>
          </div>
        </div>
      )}

      {/* ── Sin presupuesto ── */}
      {!isEditing && budget === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Define cuánto quieres gastar este mes</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 15000"
              className="saas-input flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = parseMoneyInput((e.target as HTMLInputElement).value);
                  if (!isNaN(v) && v >= 0) {
                    setBudget(monthKey, v);
                    syncToCloud(saveData, addToast);
                  }
                }
              }}
            />
            <button
              className="saas-btn-primary"
              onClick={(e) => {
                const input = (e.currentTarget as HTMLButtonElement).previousElementSibling as HTMLInputElement;
                const v = parseMoneyInput(input.value);
                if (!isNaN(v) && v >= 0) {
                  setBudget(monthKey, v);
                  syncToCloud(saveData, addToast);
                }
              }}
              aria-label="Guardar presupuesto"
            >
              <Check className="text-xs mr-1" />
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* ── Presupuesto activo ── */}
      {!isEditing && budget > 0 && (
        <div className="space-y-3">
          {isCarriedOver && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
              Presupuesto heredado del mes anterior
            </p>
          )}
          {/* Alerta de excedido — banner notorio */}
          {pct > 100 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 animate-pulse">
              <AlertCircle className="text-red-600 dark:text-red-400 text-sm" />
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
  const getUpcomingReminders = useFinanceStore((s) => s.getUpcomingReminders);
  const reminders = useFinanceStore((s) => s.reminders);
  const addToast = useUiStore((s) => s.addToast);
  const hasShownReminderToast = useRef(false);

  // Toast automático al cargar: alerta de recordatorios vencidos o para hoy
  useEffect(() => {
    if (hasShownReminderToast.current) return;
    if (reminders.length === 0) return; // esperar a que carguen datos
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const upcoming = getUpcomingReminders();
    const overdue: string[] = [];
    const today: string[] = [];
    upcoming.forEach((r) => {
      const due = new Date(r.dueDate); due.setHours(0, 0, 0, 0);
      const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0) overdue.push(r.concept);
      else if (diff === 0) today.push(r.concept);
    });
    if (overdue.length > 0) {
      addToast(`⚠️ ${overdue.length} recordatorio${overdue.length > 1 ? 's' : ''} vencido${overdue.length > 1 ? 's' : ''}: ${overdue.slice(0, 2).join(', ')}${overdue.length > 2 ? '...' : ''}`, 'error');
      hasShownReminderToast.current = true;
    } else if (today.length > 0) {
      addToast(`📅 Hoy vence: ${today.slice(0, 2).join(', ')}${today.length > 2 ? '...' : ''}`, 'info');
      hasShownReminderToast.current = true;
    }
  }, [reminders, getUpcomingReminders, addToast]);

  // For now, we always show data since Zustand starts with defaults
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Month navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <MonthNav showReport />
      </div>
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Balance"
          value={formatMoney(summary.available)}
          icon={Scale}
          colorClass="bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400"
          trend={`${summary.available >= 0 ? '+' : ''}${summary.totalIncome > 0 ? Math.round((summary.available / summary.totalIncome) * 100) : 0}% del ingreso`}
          onClick={() => { navigateTo('stats' as TabId); }}
        />
        <KpiCard
          label="Ingresos"
          value={formatMoney(summary.totalIncome)}
          icon={ArrowDown}
          colorClass="bg-income-50 dark:bg-income-950 text-income-600 dark:text-income-400"
          trend={`${monthlyData.filter((i) => i.type === 'income').length} ${monthlyData.filter((i) => i.type === 'income').length === 1 ? 'transacción' : 'transacciones'}`}
          onClick={() => { navigateTo('movements' as TabId, 'income'); }}
        />
        <KpiCard
          label="Gastos"
          value={formatMoney(summary.totalSpent)}
          icon={ArrowUp}
          colorClass="bg-expense-50 dark:bg-expense-950 text-expense-600 dark:text-expense-400"
          trend={`${monthlyData.filter((i) => i.type === 'expense').length} ${monthlyData.filter((i) => i.type === 'expense').length === 1 ? 'transacción' : 'transacciones'}`}
          onClick={() => { navigateTo('movements' as TabId, 'expense'); }}
        />
        <KpiCard
          label="Beneficio negocio"
          value={formatMoney(summary.businessProfit)}
          icon={Store}
          colorClass="bg-business-50 dark:bg-business-950 text-business-600 dark:text-business-400"
          trend={`Margen: ${summary.profitMargin.toFixed(1)}%`}
          onClick={() => { navigateTo('movements' as TabId, 'business'); }}
        />
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

/* ─── Ahorro del Mes Widget ─── */
function SavingsGoalWidget({ totalIncome }: { totalIncome: number }) {
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const expenses = useFinanceStore((s) => s.expenses);

  // Agrupar ahorros del mes por concepto
  const savingsByConcept = useMemo(() => {
    const d = new Date(currentViewDate);
    const month = d.getMonth();
    const year = d.getFullYear();
    const map = new Map<string, number>();
    expenses
      .filter((e) => {
        if (e.type !== 'expense' || e.category !== 'ahorro') return false;
        const ed = safeParseDate(e.date);
        return ed.getMonth() === month && ed.getFullYear() === year;
      })
      .forEach((e) => {
        const concept = e.concept.trim() || 'Sin concepto';
        map.set(concept, (map.get(concept) || 0) + e.amount);
      });
    return Array.from(map.entries())
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
          <span className="text-lg">💤</span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sin movimientos de ahorro este mes
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Agrega un gasto con categoría <strong>"Ahorro"</strong> y un concepto como <strong>"Casa"</strong> o <strong>"Vacaciones"</strong>
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
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded-full">
              {savingsPct}% del ingreso
            </span>
          )}
          <span className="text-lg">{emoji}</span>
        </div>
      </div>

      {/* Total */}
      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mb-3">
        {formatMoney(totalSaved)}
      </p>

      {/* Conceptos individuales */}
      <div className="space-y-2.5">
        {savingsByConcept.map((g) => (
          <div key={g.concept} className="flex items-center justify-between gap-2 py-1 px-1.5 -mx-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <PiggyBank className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
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
