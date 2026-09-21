// ================================================================
// MovementsPage — Tabla de transacciones SaaS
// ================================================================

import { useState, useMemo, useEffect } from 'react';
import { Layers, ArrowDown, ArrowUp, Store, User as UserIcon, Plus, X, Search, Receipt, ChevronUp, ChevronDown, Trash2 } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, LOCALE, roundMoney, safeParseDate, syncToCloud } from '@/lib/utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/config/categories';
import { MonthNav } from '@/components/layout/MonthNav';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScopeBadge, TransactionAmount } from '@/components/ui/TransactionBits';
import { typeLabel, typePillClasses } from '@/lib/transaction-labels';
import { accountName } from '@/lib/accounts';
import type { FilterType } from '@/types';

const FILTERS: { id: FilterType; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'Todos', icon: Layers },
  { id: 'income', label: 'Ingresos', icon: ArrowDown },
  { id: 'expense', label: 'Gastos', icon: ArrowUp },
  { id: 'business', label: 'Negocio', icon: Store },
  { id: 'personal', label: 'Personal', icon: UserIcon },
];

const FILTER_TYPE_IDS = ['all', 'income', 'expense', 'business', 'personal'] as const;

export function MovementsPage() {
  const expenses = useFinanceStore((s) => s.expenses);
  const getMonthlyData = useFinanceStore((s) => s.getMonthlyData);
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);
  const currentFilter = useFinanceStore((s) => s.currentFilter);
  const setFilter = useFinanceStore((s) => s.setFilter);
  const openModal = useUiStore((s) => s.openModal);
  const pendingFilter = useUiStore((s) => s.pendingFilter);

  const deleteTransactions = useFinanceStore((s) => s.deleteTransactions);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();

  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Selección múltiple ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((t) => t.id))
    );
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    // Guardar copia de las transacciones antes de eliminar (para Undo)
    const deletedItems = expenses.filter((e) => selectedIds.has(e.id));
    const count = selectedIds.size;

    try {
      deleteTransactions([...selectedIds]);
      clearSelection();

      // Sincronizar con Supabase (mismo patrón que el delete individual en TransactionModal)
      syncToCloud(saveData, addToast);

      addToast(
        `${count} transacci\u00f3n${count > 1 ? 'es' : ''} eliminada${count > 1 ? 's' : ''}`,
        'info',
        () => {
          // Undo: restaurar las transacciones eliminadas (conserva ids y timestamps)
          useFinanceStore.getState().restoreTransactions(deletedItems);
        }
      );
    } catch (err) {
      console.error('handleBulkDelete error:', err);
      addToast('Error al eliminar transacciones', 'error');
    }
  };

  // Limpiar selección al cambiar de filtro, mes o búsqueda
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFilter, currentViewDate, searchQuery, categoryFilter, accountFilter]);

  // Aplicar filtro pendiente desde el dashboard (KPIs o categorías)
  useEffect(() => {
    if (!pendingFilter) return;
    if (FILTER_TYPE_IDS.includes(pendingFilter as FilterType)) {
      setFilter(pendingFilter as FilterType);
      setCategoryFilter(null);
    } else {
      // Es un ID de categoría (ej: 'Comida')
      setFilter('all');
      setCategoryFilter(pendingFilter);
    }
  }, [pendingFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const accounts = useFinanceStore((s) => s.accounts);

  // Mapa para resolver etiquetas de categoría (por defecto + personalizadas)
  const categoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...customExpenseCategories, ...customIncomeCategories].forEach((c) => {
      map[c.id] = c.label;
    });
    return map;
  }, [customExpenseCategories, customIncomeCategories]);

  // Deps "innecesarias" a propósito: getMonthlyData lee el store por dentro
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthlyData = useMemo(() => getMonthlyData(), [getMonthlyData, expenses, currentViewDate]);

  // Todas las categorías (default + personalizadas) para el dropdown
  const allCategories = useMemo(
    () => [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...customExpenseCategories, ...customIncomeCategories],
    [customExpenseCategories, customIncomeCategories],
  );

  const filtered = useMemo(() => {
    // ── Filtros normales ──
    let items = monthlyData;
    if (currentFilter === 'income') items = items.filter((i) => i.type === 'income');
    if (currentFilter === 'expense') items = items.filter((i) => i.type === 'expense');
    if (currentFilter === 'business') items = items.filter((i) => i.businessType === 'business');
    if (currentFilter === 'personal') items = items.filter((i) => i.businessType === 'personal');

    if (categoryFilter) items = items.filter((i) => i.category === categoryFilter);
    // Una transferencia queda incluida si la cuenta elegida es el origen o el
    // destino: es la misma cuenta la que "tocó" ese movimiento.
    if (accountFilter) items = items.filter((i) => i.accountId === accountFilter || i.toAccountId === accountFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      // Búsqueda global: concepto, categoría (ID + label), tipo, negocio/personal
      const typeMap: Record<string, string> = { income: 'ingreso', expense: 'gasto' };
      const businessMap: Record<string, string> = { business: 'negocio', personal: 'personal' };
      items = items.filter((i) => {
        const catLabel = categoryLabelMap[i.category]?.toLowerCase() || '';
        const typeWord = typeMap[i.type] || '';
        const businessWord = businessMap[i.businessType] || '';
        return (
          i.concept.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          catLabel.includes(q) ||
          typeWord.includes(q) ||
          i.type.includes(q) ||
          businessWord.includes(q) ||
          i.businessType.includes(q)
        );
      });
    }
    return [...items].sort((a, b) => {
      const val = sortField === 'date'
        ? safeParseDate(a.date).getTime() - safeParseDate(b.date).getTime()
        : a.amount - b.amount;
      return sortDir === 'asc' ? val : -val;
    });
  }, [monthlyData, currentFilter, sortField, sortDir, categoryFilter, accountFilter, searchQuery, categoryLabelMap]);

  const handleSort = (field: 'date' | 'amount') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const totalIncome = roundMoney(filtered.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0));
  const totalExpense = roundMoney(filtered.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0));

  return (
    <div className="space-y-2 sm:space-y-2.5 animate-fade-in">
      {/* Page header: MonthNav + contextual "Nueva" */}
      <div className="flex items-center justify-between gap-2">
        <MonthNav />
        <button
          onClick={() => openModal()}
          className="saas-btn-primary saas-btn-sm flex-shrink-0 hidden sm:inline-flex"
          aria-label="Nueva transacción"
          title="Nueva transacción (Ctrl+N)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline ml-1">Nueva transacción</span>
        </button>
      </div>

      {/* Summary line + active filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length} {filtered.length === 1 ? 'transacción' : 'transacciones'} ·{' '}
          <span className="text-income-600 dark:text-income-400 font-medium">{formatMoney(totalIncome)}</span>
          {' '}ingresos ·{' '}
          <span className="text-expense-600 dark:text-expense-400 font-medium">{formatMoney(totalExpense)}</span>
          {' '}gastos
        </p>
        {/* Chip: filtro de tipo activo (no 'all') */}
        {currentFilter !== 'all' && (() => {
          const f = FILTERS.find((x) => x.id === currentFilter);
          return (
            <button
              onClick={() => setFilter('all')}
              className="saas-chip-filter"
              title="Quitar filtro"
            >
              {(() => { const Icon = f?.icon; return Icon ? <Icon className="text-2xs" /> : null; })()}
              {f?.label || currentFilter}
              <X className="text-3xs ml-0.5" />
            </button>
          );
        })()}
        {/* Chip: filtro de categoría */}
        {categoryFilter && (() => {
          const cat = allCategories.find(c => c.id === categoryFilter);
          return (
            <button
              onClick={() => setCategoryFilter(null)}
              className="saas-chip-filter-category"
              title="Quitar filtro de categoría"
            >
              {cat?.icon || '📌'} {cat?.label || categoryFilter}
              <X className="text-3xs ml-0.5" />
            </button>
          );
        })()}
        {/* Chip: filtro de cuenta */}
        {accountFilter && (() => {
          const acc = accounts.find((a) => a.id === accountFilter);
          return (
            <button
              onClick={() => setAccountFilter(null)}
              className="saas-chip-filter-category"
              title="Quitar filtro de cuenta"
            >
              {acc?.name || accountFilter}
              <X className="text-3xs ml-0.5" />
            </button>
          );
        })()}
        {/* Chip: búsqueda activa */}
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="saas-chip-filter"
            title="Quitar búsqueda"
          >
            <Search className="w-3.5 h-3.5" />
            "{searchQuery}"
            <X className="text-3xs ml-0.5" />
          </button>
        )}
      </div>

      {/* Filters + Search desktop (single row) */}
      <div className="hidden sm:flex gap-1.5 overflow-x-auto scrollbar-hide items-center flex-nowrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`saas-btn-sm whitespace-nowrap flex-shrink-0 ${
              currentFilter === f.id
                ? 'saas-btn-primary'
                : 'saas-btn-ghost'
            }`}
          >
            {(() => { const Icon = f.icon; return <Icon className="w-3.5 h-3.5" />; })()}
            {f.label}
          </button>
        ))}
        {accounts.length > 0 && (
          <select
            value={accountFilter ?? ''}
            onChange={(e) => setAccountFilter(e.target.value || null)}
            aria-label="Filtrar por cuenta"
            className="saas-input-sm text-2xs flex-shrink-0 ml-2"
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <div className="flex items-center w-[260px] ml-auto flex-shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
          <Search className="ml-2.5 w-3.5 h-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar..."
            aria-label="Buscar movimientos por concepto o categoría"
            data-search-input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none px-1.5 py-1.5 text-2xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="mr-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0"
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            // Ctrl+K ya enfoca este campo (useKeyboardShortcuts); sin esto no
            // había ninguna pista en la interfaz de que existiera el atajo.
            <kbd
              aria-hidden="true"
              className="mr-1.5 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-3xs font-mono text-slate-400 dark:text-slate-500 flex-shrink-0"
            >
              Ctrl+K
            </kbd>
          )}
        </div>
      </div>

      {/* Filters mobile (pills only) */}
      <div className="relative sm:hidden">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide items-center flex-nowrap pr-6">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`saas-btn-sm whitespace-nowrap flex-shrink-0 ${
                currentFilter === f.id
                  ? 'saas-btn-primary'
                  : 'saas-btn-ghost'
              }`}
            >
              {(() => { const Icon = f.icon; return <Icon className="w-3.5 h-3.5" />; })()}
              {f.label}
            </button>
          ))}
        </div>
        {/* Pista de que la fila se puede deslizar: sin esto, el último chip
            ("Personal") queda cortado justo en el ícono y parece un botón
            roto en vez de contenido con scroll. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-50 dark:from-slate-950 to-transparent" />
      </div>

      {/* Cuenta mobile (own row, solo si hay cuentas) */}
      {accounts.length > 0 && (
        <select
          value={accountFilter ?? ''}
          onChange={(e) => setAccountFilter(e.target.value || null)}
          aria-label="Filtrar por cuenta"
          className="saas-input sm:hidden text-xs w-full"
        >
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}

      {/* Search mobile (own row, full width) */}
      <div className="flex items-center sm:hidden w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
        <Search className="ml-2.5 w-3.5 h-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Buscar..."
          aria-label="Buscar movimientos por concepto o categoría"
          data-search-input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none px-1.5 py-1.5 text-2xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="mr-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0"
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Table — DESKTOP only (md+) */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Sin movimientos"
          description="Registra tu primer ingreso o gasto para empezar"
          action={{ label: 'Crear transacción', icon: Plus, onClick: () => openModal() }}
        />
      ) : (
        <>
          {/* ── MOBILE: Tarjetas ── */}
          <div className="md:hidden space-y-1.5">
            {filtered.map((tx) => {
              const category = allCategories.find(c => c.id === tx.category);
              const isSelected = selectedIds.has(tx.id);
              return (
                <div
                  key={tx.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openModal(tx.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(tx.id); } }}
                  className={`saas-card p-2.5 cursor-pointer relative touch-manipulation ${isSelected ? 'ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950/30' : 'active:bg-slate-50 dark:active:bg-slate-800/50'}`}
                >
                  {/* Checkbox en esquina superior derecha — mínimo, no roba el tap */}
                  <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(tx.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                      aria-label={`Seleccionar ${tx.concept}`}
                    />
                  </div>
                  {/* Row 1: icon + concept + amount */}
                  <div className="flex items-center justify-between gap-1.5 mb-1 pr-6">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-lg flex-shrink-0 leading-none">{tx.type === 'transfer' ? '🔁' : category?.icon || '📌'}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {tx.concept}
                        </p>
                      </div>
                    </div>
                    <TransactionAmount type={tx.type} amount={tx.amount} className="text-xs font-bold flex-shrink-0" />
                  </div>
                  {/* Row 2: badges + date.
                      Antes eran <span> sin onClick: en escritorio, la misma
                      fila de la tabla filtra al pulsar Ámbito/Categoría/Tipo,
                      así que tocar el badge en la tarjeta móvil no hacía nada
                      — una función que existía solo en una de las dos formas
                      de ver la lista. El badge de Ámbito además llevaba su
                      propio azul a mano en vez de ScopeBadge (que ya es
                      terracota para Negocio); aquí quedaba desincronizado. */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        className={`saas-cell-filter text-2xs font-medium px-1.5 py-0.5 rounded-full ${typePillClasses(tx.type)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tx.type !== 'transfer') setFilter(tx.type);
                        }}
                        title={tx.type === 'transfer' ? 'Transferencia entre cuentas' : `Filtrar solo ${tx.type === 'income' ? 'Ingresos' : 'Gastos'}`}
                      >
                        {typeLabel(tx.type)}
                      </button>
                      {tx.type === 'transfer' ? (
                        <span className="text-2xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
                          {accountName(accounts, tx.accountId)} → {accountName(accounts, tx.toAccountId)}
                        </span>
                      ) : (
                      <button
                        type="button"
                        className="saas-cell-filter text-2xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full"
                        onClick={(e) => { e.stopPropagation(); setCategoryFilter(tx.category); }}
                        title={`Filtrar solo ${category?.label || tx.category}`}
                      >
                        {category?.label || tx.category}
                      </button>
                      )}
                      <button
                        type="button"
                        className="saas-cell-filter"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilter(tx.businessType === 'business' ? 'business' : 'personal');
                        }}
                        aria-label={`Filtrar solo ${tx.businessType === 'business' ? 'Negocio' : 'Personal'}`}
                        title={`Filtrar solo ${tx.businessType === 'business' ? 'Negocio' : 'Personal'}`}
                      >
                        <ScopeBadge businessType={tx.businessType} />
                      </button>
                    </div>
                    <span className="text-2xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                      {safeParseDate(tx.date).toLocaleDateString(LOCALE, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── DESKTOP: Tabla ── */}
          <div className="hidden md:block saas-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="saas-table">
                <thead>
                <tr>
                  <th className="w-8 text-center">
                    <span className="saas-checkbox-target">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                        ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        aria-label="Seleccionar todas"
                        title="Seleccionar todas"
                      />
                    </span>
                  </th>
                  <th className="w-10 text-center" aria-label="Icono"></th>
                  <th>Concepto</th>
                  <th className="whitespace-nowrap">Ámbito</th>
                  <th className="whitespace-nowrap">Categoría</th>
                  <th className="whitespace-nowrap">Tipo</th>
                  <th
                    className="whitespace-nowrap cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none"
                    onClick={() => handleSort('date')}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('date'); } }}
                    role="button"
                    aria-sort={sortField === 'date' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span className="inline-flex items-center gap-1">
                      Fecha
                      {sortField === 'date' && (
                        <>{sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</>
                      )}
                    </span>
                  </th>
                  <th
                    className="whitespace-nowrap !text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none"
                    onClick={() => handleSort('amount')}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('amount'); } }}
                    role="button"
                    aria-sort={sortField === 'amount' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span className="inline-flex items-center gap-1">
                      Monto
                      {sortField === 'amount' && (
                        <>{sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</>
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const category = allCategories.find(c => c.id === tx.category);
                  const isSelected = selectedIds.has(tx.id);
                  return (
                    <tr
                      key={tx.id}
                      className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${isSelected ? 'bg-brand-50 dark:bg-brand-950/30' : ''}`}
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
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <span className="saas-checkbox-target">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(tx.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          aria-label={`Seleccionar ${tx.concept}`}
                        />
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="text-base">{tx.type === 'transfer' ? '🔁' : category?.icon || '📌'}</span>
                      </td>
                      <td>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {tx.concept}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <button
                          className="saas-cell-filter text-xs font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilter(tx.businessType === 'business' ? 'business' : 'personal');
                          }}
                          aria-label={`Filtrar solo ${tx.businessType === 'business' ? 'Negocio' : 'Personal'}`}
                          title={`Filtrar solo ${tx.businessType === 'business' ? 'Negocio' : 'Personal'}`}
                        >
                          <ScopeBadge businessType={tx.businessType} />
                        </button>
                      </td>
                      <td className="whitespace-nowrap">
                        {tx.type === 'transfer' ? (
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            {accountName(accounts, tx.accountId)} <span className="text-slate-400">→</span> {accountName(accounts, tx.toAccountId)}
                          </span>
                        ) : (
                        <button
                          className="saas-cell-filter text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setCategoryFilter(tx.category); }}
                          title={`Filtrar solo ${category?.label || tx.category}`}
                        >
                          {category?.label || tx.category}
                        </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <button
                          className={`saas-cell-filter text-xs font-medium ${typePillClasses(tx.type)} px-2 py-0.5 rounded-full`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tx.type !== 'transfer') setFilter(tx.type);
                          }}
                          title={tx.type === 'transfer' ? 'Transferencia entre cuentas' : `Filtrar solo ${tx.type === 'income' ? 'Ingresos' : 'Gastos'}`}
                        >
                          {typeLabel(tx.type)}
                        </button>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {safeParseDate(tx.date).toLocaleDateString(LOCALE, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
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
        </div>
        </>
      )}

      {/* ── Barra de acciones bulk (flotante) ── */}
      {selectedIds.size > 0 && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-actionbar max-w-[calc(100vw-1rem)]"
          style={{ bottom: 'calc(var(--bottom-clearance) + 1.5rem)' }}
        >
          <div className="flex items-center gap-1 sm:gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-2 sm:px-4 py-1.5 sm:py-2 shadow-2xl animate-slide-up">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {selectedIds.size} selecc.
            </span>
            <button
              onClick={clearSelection}
              className="saas-btn saas-btn-sm border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full"
            >
              Cancelar
            </button>
            <button
              onClick={handleBulkDelete}
              className="saas-btn-danger saas-btn-sm font-semibold rounded-full"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
