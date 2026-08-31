// ================================================================
// TransactionModal - Modal para crear/editar transacciones
// ================================================================

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { X, Plus, Trash2, ArrowDown, ArrowUp, Building2, User, Banknote, CreditCard, Landmark } from 'lucide-react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, CATEGORY_COLORS } from '@/config/categories';
import { ColorPicker, IconPicker } from '@/components/ui/CategoryStylePicker';
import { getTodayISO, parseMoneyInput, roundMoney, syncToCloud } from '@/lib/utils';
import { makeCategoryId } from '@/lib/category-id';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
    // Copia antes de borrar: es lo que permite el "Deshacer" del toast,
    // mismo patrón que el borrado múltiple de MovementsPage.
    const deleted = useFinanceStore.getState().expenses.find((e) => e.id === deletingId);
    deleteTransaction(deletingId);
    // Cerrar modales inmediatamente
    closeDeleteModal();
    closeModal();
    addToast(
      'Movimiento eliminado',
      'info',
      deleted ? () => useFinanceStore.getState().restoreTransactions([deleted]) : undefined,
    );
    // Sync a Supabase en background
    syncToCloud(onSave, addToast);
  }

  return (
    <>
    <ModalSheet
      id="transaction-modal-title"
      titulo={isEditing ? 'Editar Movimiento' : 'Nuevo Movimiento'}
      onClose={closeModal}
      // Con el diálogo de borrado abierto, el foco lo retiene ese, no este
      trapActivo={isOpen && !isDeleteModalOpen}
      focoInicial="#tx-amount"
      style={{ overscrollBehaviorX: 'none' }}
    >

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
              <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Tipo</span>
              <div className="flex gap-1" role="group" aria-label="Tipo de movimiento">
                {(['expense', 'income'] as TransactionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setType(t); setCategory(''); }}
                    className={`flex-1 py-1 rounded-md text-2xs font-semibold transition-all flex items-center justify-center gap-1 ${
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
              <label htmlFor="tx-amount" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">
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
              <label htmlFor="tx-concept" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Concepto</label>
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
              <label htmlFor="tx-date" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Fecha</label>
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
              <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Ámbito</span>
              <div className="flex gap-1" role="group" aria-label="Ámbito del movimiento">
                {(['business', 'personal'] as BusinessType[]).map((bt) => (
                  <button
                    key={bt}
                    type="button"
                    onClick={() => setBusinessType(bt)}
                    className={`flex-1 py-1 rounded-md text-2xs font-semibold transition-all flex items-center justify-center gap-1 ${
                      businessType === bt
                        // Negocio seleccionado va en violeta, como su badge en
                        // el resto de la app (ver ScopeBadge); Personal no
                        // tiene color semántico propio, así que conserva el
                        // azul genérico de "opción activa".
                        ? bt === 'business'
                          ? 'bg-business-600 text-white'
                          : 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {bt === 'business' ? (
                      <><Building2 className="w-3.5 h-3.5" /> Negocio</>
                    ) : (
                      <><User className="w-3.5 h-3.5" /> Personal</>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Método</span>
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
                    className={`flex-1 py-1 rounded-md text-2xs font-semibold transition-all flex items-center justify-center gap-1 ${
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
            <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">
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
                  <span className="text-2xs font-medium text-slate-600 dark:text-slate-400 leading-tight text-center line-clamp-2">
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
                  {showNewCat ? <X className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" /> : <Plus className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />}
                </span>
                <span className="text-2xs font-medium text-slate-500 dark:text-slate-400 leading-tight text-center">
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
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="text-2xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">Ícono:</span>
                  <IconPicker value={newCatIcon} onChange={setNewCatIcon} />
                </div>
                <div className="flex gap-1.5 items-center flex-wrap">
                  <span className="text-2xs font-medium text-slate-500 dark:text-slate-400">Color:</span>
                  <ColorPicker value={newCatColor} onChange={setNewCatColor} />
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
              <Trash2 className="w-3.5 h-3.5" />
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

    </ModalSheet>

    {/*
      Antes era un diálogo hecho a mano, anidado DENTRO del panel de este
      modal, con z-10/z-20 propios y en rojo suave (saas-btn-danger). Era la
      acción de borrado más frecuente de la app y la única con menos
      contraste de "esto es irreversible" que el resto (cerrar sesión, borrar
      categoría, borrar meta ya usan este mismo ConfirmDialog, en rojo sólido).

      Va como HERMANO de ModalSheet, no como hijo suyo: el panel de ModalSheet
      anima con `animate-scale-in` (`transform: scale(1) forwards`), y un
      transform en un ancestro — aunque sea scale(1) — crea un containing
      block para `position: fixed`. Si ConfirmDialog quedara anidado ahí
      dentro, su `fixed inset-0` se mediría contra el panel (que además tiene
      `overflow-hidden`), no contra el viewport. Como hermano, y con
      `z-dialog` ya pensado para ir sobre cualquier `z-modal`, aparece
      correctamente centrado en toda la pantalla.

      El propio ModalSheet calcula `trapActivo={isOpen && !isDeleteModalOpen}`
      esperando justo esto: que otro diálogo se quede con el foco mientras
      isDeleteModalOpen es true.
    */}
    <ConfirmDialog
      open={isDeleteModalOpen}
      title="¿Eliminar movimiento?"
      message="Esta acción no se puede deshacer."
      confirmLabel="Eliminar"
      onConfirm={handleDelete}
      onCancel={closeDeleteModal}
    />
    </>
  );
}
