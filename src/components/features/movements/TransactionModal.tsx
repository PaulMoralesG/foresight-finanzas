// ================================================================
// TransactionModal - Modal para crear/editar transacciones
// ================================================================

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { X, Plus, Trash2, ArrowDown, ArrowUp, Building2, User, Banknote, CreditCard, Landmark } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, CATEGORY_COLORS } from '@/config/categories';
import { getTodayISO, parseMoneyInput, roundMoney, syncToCloud } from '@/lib/utils';
import { makeCategoryId } from '@/lib/category-id';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { TransactionType, BusinessType, PaymentMethod, Category } from '@/types';

export function TransactionModal({
  onSave,
}: {
  onSave: () => Promise<boolean>;
}) {
  const isOpen = useUiStore((s) => s.isModalOpen);
  const editingId = useUiStore((s) => s.editingId);
  const modalPrefill = useUiStore((s) => s.modalPrefill);
  const closeModal = useUiStore((s) => s.closeModal);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const isDeleteModalOpen = useUiStore((s) => s.isDeleteModalOpen);
  const deletingId = useUiStore((s) => s.deletingId);
  const openDeleteModal = useUiStore((s) => s.openDeleteModal);
  const closeDeleteModal = useUiStore((s) => s.closeDeleteModal);
  const addToast = useUiStore((s) => s.addToast);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const addCustomCategory = useFinanceStore((s) => s.addCustomCategory);
  const currentViewDate = useFinanceStore((s) => s.currentViewDate);

  // Fecha por defecto para nuevos movimientos: hoy si el mes visto es el actual,
  // o el mismo día del mes visto (clamped) si se está viendo otro mes
  const defaultDate = useMemo(() => {
    const viewDate = new Date(currentViewDate);
    const today = new Date();
    const viewMonth = viewDate.getMonth();
    const viewYear = viewDate.getFullYear();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    if (viewMonth === todayMonth && viewYear === todayYear) {
      return getTodayISO();
    }
    // Día de hoy clamped al último día del mes visto
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const day = Math.min(today.getDate(), lastDay);
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }, [currentViewDate]);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [businessType, setBusinessType] = useState<BusinessType>('business');

  // ── Nueva categoría ──
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📌');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);

  const categories = [
    ...(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
    ...(type === 'income' ? customIncomeCategories : customExpenseCategories),
  ];

  function handleAddCustomCategory() {
    const label = newCatLabel.trim();
    if (!label) {
      addToast('Ingresa un nombre para la categoría', 'error');
      return;
    }
    // Verificar que no exista ya
    if (categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      addToast('Ya existe una categoría con ese nombre', 'error');
      return;
    }
    const id = makeCategoryId(label);
    const newCategory: Category = { id, label, icon: newCatIcon, color: newCatColor };
    addCustomCategory(type, newCategory);
    setCategory(id);
    setNewCatLabel('');
    setShowNewCat(false);
    addToast('Categoría creada ✅', 'success');
    // Sincronizar con Supabase para que la categoría persista al recargar
    syncToCloud(onSave, addToast);
  }

  // Cargar datos si estamos editando.
  // ⚠️ NO depende de `expenses` ni `defaultDate` — si lo hiciera, cualquier cambio
  // en el store (incluso por persistencia de Zustand) re-ejecutaría este efecto y
  // sobrescribiría los campos que el usuario está editando, haciendo el formulario
  // "no interactivo".
  useEffect(() => {
    if (editingId !== null && isOpen) {
      try {
        const item = useFinanceStore.getState().expenses.find((e) => e.id === editingId);
        if (item) {
          setType(item.type);
          setAmount(String(item.amount ?? ''));
          setConcept(item.concept ?? '');
          // date puede venir como ISO completo o YYYY-MM-DD; slice seguro
          setDate(typeof item.date === 'string' ? item.date.slice(0, 10) : defaultDate);
          setCategory(item.category ?? '');
          setMethod(item.method ?? 'cash');
          setBusinessType(item.businessType ?? 'personal');
        } else {
          console.error('[TransactionModal] No se encontró transacción con id:', editingId);
        }
      } catch (err) {
        console.error('[TransactionModal] Error al cargar datos:', err);
        addToast('Error al cargar la transacción. Verifica los datos.', 'error');
      }
    } else if (isOpen && modalPrefill) {
      // Nuevo movimiento con prefill (ej. "Aportar" desde una meta de ahorro)
      setType(modalPrefill.type ?? 'expense');
      setAmount('');
      setConcept(modalPrefill.concept ?? '');
      setDate(defaultDate);
      setCategory(modalPrefill.category ?? '');
      setMethod('cash');
      setBusinessType(modalPrefill.businessType ?? 'personal');
    } else if (!isOpen) {
      // Reset al cerrar
      setType('expense');
      setAmount('');
      setConcept('');
      setDate(defaultDate);
      setCategory('');
      setMethod('cash');
      setBusinessType('business');
    }
    // Solo montar al abrir/cerrar o cambiar item
  }, [editingId, isOpen, modalPrefill, defaultDate, addToast]);

  // Scroll lock para iOS PWA
  useScrollLock(isOpen);

  // Cerrar modal con tecla Escape
  useEscapeKey(closeModal, isOpen && !isDeleteModalOpen);

  // Retener el foco dentro del diálogo (cumple la promesa de aria-modal) y
  // enfocar el monto al abrir, que es el primer dato que se escribe.
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen && !isDeleteModalOpen, '#tx-amount');

  if (!isOpen) return null;

  const isEditing = editingId !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Redondear al guardar, no solo al mostrar: la columna es numeric(14,2),
    // así que un monto con más decimales divergiría entre local y servidor
    // en el primer round-trip de sync.
    const numAmount = roundMoney(parseMoneyInput(amount));
    if (numAmount <= 0) {
      addToast('Ingresa un monto mayor a 0', 'error');
      return;
    }
    if (!category) {
      addToast('Selecciona una categoría', 'error');
      return;
    }

    const data = {
      type,
      amount: numAmount,
      concept,
      date,
      category,
      method,
      businessType,
    };

    if (isEditing) {
      updateTransaction(editingId, data);
    } else {
      addTransaction(data);
    }

    // Cerrar modal inmediatamente — el store ya está actualizado
    closeModal();
    addToast(isEditing ? 'Movimiento actualizado ✅' : 'Movimiento registrado ✅', 'success');
    // Sync a Supabase en background (no bloquea la UI)
    syncToCloud(onSave, addToast);
  }

  async function handleDelete() {
    if (deletingId === null) return;
    deleteTransaction(deletingId);
    // Cerrar modales inmediatamente
    closeDeleteModal();
    closeModal();
    addToast('Movimiento eliminado 🗑️', 'success');
    // Sync a Supabase en background
    syncToCloud(onSave, addToast);
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-[200] animate-fade-in" onClick={closeModal} />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
        className="fixed inset-0 z-[201] bg-white dark:bg-slate-950 md:rounded-2xl shadow-2xl flex flex-col w-full max-w-full md:max-w-md mx-auto overflow-hidden animate-scale-in md:inset-y-6 md:mx-auto pt-safe"
        style={{ overscrollBehaviorX: 'none' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
          <h2 id="transaction-modal-title" className="font-bold text-sm text-slate-900 dark:text-white">
            {isEditing ? 'Editar Movimiento' : 'Nuevo Movimiento'}
          </h2>
          <button onClick={closeModal} aria-label="Cerrar" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body — scrollable with iOS momentum */}
        {/* id + `form=` en el botón del pie: el pie es hermano del formulario,
            no hijo, así que sin esta asociación el `required` del monto nunca
            disparaba la validación nativa y el botón no quedaba vinculado al
            formulario para tecnologías de asistencia. */}
        <form id="transaction-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto overflow-x-hidden ios-scroll p-3 space-y-1.5" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Row 1: Tipo + Monto */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              {/* span y no label: estos grupos son botones, no un control de
                  formulario, así que un <label> sin `for` no nombra nada. El
                  nombre accesible lo pone el role="group" del contenedor. */}
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Tipo</span>
              <div className="flex gap-1" role="group" aria-label="Tipo de movimiento">
                {(['expense', 'income'] as TransactionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setType(t); setCategory(''); }}
                    className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                      type === t
                        ? t === 'expense'
                          ? 'bg-red-600 text-white'
                          : 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t === 'income' ? (
                      <><ArrowDown className="w-3 h-3" /> Ingreso</>
                    ) : (
                      <><ArrowUp className="w-3 h-3" /> Gasto</>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="tx-amount" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">
                Monto
              </label>
              <input
                id="tx-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  // Permitir solo dígitos, coma o punto decimal (sin signo negativo)
                  const raw = e.target.value;
                  if (/^\d*[.,]?\d*$/.test(raw)) {
                    setAmount(raw);
                  }
                }}
                className="saas-input py-1 text-sm font-bold"
                required
                autoComplete="off"
              />
            </div>
          </div>

          {/* Row 2: Concepto + Fecha */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="tx-concept" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Concepto</label>
              <input
                id="tx-concept"
                type="text"
                placeholder="Ej. Venta, Pago renta..."
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="saas-input py-1 text-sm"
              />
            </div>
            <div>
              <label htmlFor="tx-date" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Fecha</label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="saas-input py-1 text-sm"
              />
            </div>
          </div>

          {/* Row 3: Ámbito + Método.
              Apilado en pantallas estrechas: Método tiene TRES opciones y en
              media columna de un teléfono de 390px la última ("Transf.") se
              cortaba contra el borde. A partir de sm vuelven a ir en paralelo. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Ámbito</span>
              <div className="flex gap-1" role="group" aria-label="Ámbito del movimiento">
                {(['business', 'personal'] as BusinessType[]).map((bt) => (
                  <button
                    key={bt}
                    type="button"
                    onClick={() => setBusinessType(bt)}
                    className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                      businessType === bt
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {bt === 'business' ? (
                      <><Building2 className="w-3 h-3" /> Negocio</>
                    ) : (
                      <><User className="w-3 h-3" /> Personal</>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Método</span>
              <div className="flex gap-1" role="group" aria-label="Método de pago">
                {([
                  { id: 'cash', label: 'Efectivo', icon: Banknote },
                  { id: 'card', label: 'Tarjeta', icon: CreditCard },
                  { id: 'transfer', label: 'Transf.', icon: Landmark },
                ] as { id: PaymentMethod; label: string; icon: React.ElementType }[]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                      method === m.id
                        ? 'bg-slate-900 dark:bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <m.icon className="w-3 h-3" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Categorías */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">
              Categoría
              {categories.length > 0 && (
                <span className="ml-1 font-normal normal-case text-slate-500 dark:text-slate-400">
                  ({categories.length})
                </span>
              )}
            </span>
            {/* 3 columnas en pantallas estrechas: con 4 fijas, un iPhone SE
                (320px) dejaba ~68px por celda y truncaba «Entretenimiento» o
                «Transporte» a la primera palabra. */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5" role="group" aria-label="Categoría del movimiento">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all ${
                    category === cat.id
                      ? 'ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950'
                      : 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xl leading-none">{cat.icon || '📌'}</span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-tight text-center line-clamp-2">
                    {cat.label}
                  </span>
                </button>
              ))}
              {/* Botón Añadir */}
              <button
                type="button"
                onClick={() => setShowNewCat(!showNewCat)}
                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all border-2 border-dashed ${
                  showNewCat
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-transparent'
                }`}
              >
                <span className="text-xl leading-none flex items-center justify-center h-6">
                  {showNewCat ? <X className="w-4 h-4 text-brand-600 dark:text-brand-400" /> : <Plus className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight text-center">
                  {showNewCat ? 'Cancelar' : 'Nueva'}
                </span>
              </button>
            </div>

            {/* Form para crear categoría */}
            {showNewCat && (
              <div className="mt-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5 animate-fade-in">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newCatLabel}
                    onChange={(e) => setNewCatLabel(e.target.value)}
                    aria-label="Nombre de la nueva categoría"
                    className="saas-input-sm flex-1 text-xs"
                    placeholder="Nombre categoría"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomCategory(); }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCategory}
                    aria-label="Crear categoría"
                    title="Crear categoría"
                    className="saas-btn-primary saas-btn-sm flex-shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">Ícono:</span>
                  <div className="flex gap-1 flex-wrap">
                    {['📌', '🛒', '🍴', '💊', '📚', '🎉', '💼', '🏠', '🚗', '💻', '💰', '🎁', '🔧', '🐾', '✈️', '📱', '⛪'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewCatIcon(emoji)}
                        aria-label={`Usar el ícono ${emoji}`}
                        aria-pressed={newCatIcon === emoji}
                        className={`w-7 h-7 flex items-center justify-center rounded text-base leading-none transition-all ${
                          newCatIcon === emoji
                            ? 'ring-2 ring-brand-500 bg-white dark:bg-slate-700'
                            : 'hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5 items-center flex-wrap">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Color:</span>
                  {CATEGORY_COLORS.slice(0, 8).map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatColor(c)}
                      aria-label={`Usar el color ${i + 1} de ${CATEGORY_COLORS.slice(0, 8).length}`}
                      aria-pressed={newCatColor === c}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${c.split(' ')[0]} ${
                        newCatColor === c ? 'ring-2 ring-brand-500 scale-110 border-white dark:border-slate-900' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          {isEditing && (
            <button
              type="button"
              onClick={() => openDeleteModal(editingId!)}
              className="saas-btn-danger py-1.5 text-xs"
              aria-label="Eliminar movimiento"
              title="Eliminar"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {isEditing && (
            <button
              type="button"
              onClick={closeModal}
              className="saas-btn-secondary py-1.5 text-xs"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            form="transaction-form"
            className="saas-btn-primary flex-1 py-1.5 text-xs"
          >
            {isEditing ? 'Guardar Cambios' : 'Registrar Movimiento'}
          </button>
        </div>

      {/* Modal de confirmación de borrado — dentro del contenedor principal para visibilidad en móvil */}
      {isDeleteModalOpen && (
        <>
          <div className="absolute inset-0 bg-black/60 z-[210] animate-fade-in" onClick={closeDeleteModal} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[211] w-[calc(100%-2rem)] max-w-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-4 text-center animate-scale-in">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">¿Eliminar movimiento?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Esta acción no se puede deshacer.</p>
              <div className="flex gap-2">
                <button onClick={closeDeleteModal} className="saas-btn-secondary flex-1 py-1.5 text-xs">Cancelar</button>
                <button onClick={handleDelete} className="saas-btn-danger flex-1 py-1.5 text-xs">Eliminar</button>
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </>
  );
}
