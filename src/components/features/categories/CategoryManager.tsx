// ================================================================
// CategoryManager — Alta, edición y borrado de categorías personalizadas
//
// Ocupaba 197 líneas dentro de ProfilePage, que además llevaba veinte
// useState para cuatro acordeones independientes. Esta sección tiene estado
// propio —el formulario de alta, la edición en línea, la confirmación de
// borrado— y ninguna otra sección lo mira: vive mejor aquí, donde se puede
// leer entera de una sentada.
// ================================================================

import { useState } from 'react';
import { ChevronRight, ChevronUp, Check, Edit3, Plus, Tags, Trash2, X } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { CATEGORY_COLORS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/config/categories';
import { ColorPicker, IconPicker } from '@/components/ui/CategoryStylePicker';
import { makeCategoryId } from '@/lib/category-id';
import { syncToCloud } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface CategoryManagerProps {
  /** El acordeón está desplegado. */
  abierto: boolean;
  /** Plegar o desplegar; lo controla ProfilePage para que solo haya uno abierto. */
  onToggle: () => void;
  /** Agenda el push a Supabase tras cada cambio. */
  saveData: () => Promise<boolean>;
}

export function CategoryManager({ abierto, onToggle, saveData }: CategoryManagerProps) {
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const addCustomCategory = useFinanceStore((s) => s.addCustomCategory);
  const updateCustomCategory = useFinanceStore((s) => s.updateCustomCategory);
  const deleteCustomCategory = useFinanceStore((s) => s.deleteCustomCategory);
  const addToast = useUiStore((s) => s.addToast);

  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatGroup, setNewCatGroup] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📌');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);
  const [pendingDeleteCat, setPendingDeleteCat] = useState<{ id: string; label: string } | null>(null);

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatLabel, setEditingCatLabel] = useState('');
  const [editingCatIcon, setEditingCatIcon] = useState('📌');

  const activeCustomCats = catType === 'expense' ? customExpenseCategories : customIncomeCategories;
  // Grupos ya existentes del tipo (por defecto + personalizadas), para sugerir
  // en el campo de grupo: así las categorías nuevas caen donde las demás.
  const gruposExistentes = Array.from(
    new Set(
      [...(catType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES), ...activeCustomCats]
        .map((c) => c.group)
        .filter((g): g is string => !!g),
    ),
  );

  function handleAddCategory() {
    const label = newCatLabel.trim();
    if (!label) {
      addToast('Ingresa un nombre para la categoría', 'error');
      return;
    }
    if (activeCustomCats.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      addToast('Ya existe una categoría con ese nombre', 'error');
      return;
    }
    const id = makeCategoryId(label);
    addCustomCategory(catType, { id, label, icon: newCatIcon, color: newCatColor, group: newCatGroup.trim() || undefined });
    setNewCatLabel('');
    addToast('Categoría creada ✅', 'success');
    // Sincronizar con Supabase para que la categoría persista al recargar
    syncToCloud(saveData, addToast);
  }

  function startEditing(cat: typeof activeCustomCats[number]) {
    setEditingCatId(cat.id);
    setEditingCatLabel(cat.label);
    setEditingCatIcon(cat.icon);
  }

  function cancelEditing() {
    setEditingCatId(null);
    setEditingCatLabel('');
    setEditingCatIcon('📌');
  }

  function handleUpdateCategory() {
    const label = editingCatLabel.trim();
    if (!label || !editingCatId) return;
    if (activeCustomCats.some((c) => c.id !== editingCatId && c.label.toLowerCase() === label.toLowerCase())) {
      addToast('Ya existe una categoría con ese nombre', 'error');
      return;
    }
    updateCustomCategory(catType, editingCatId, { label, icon: editingCatIcon });
    addToast('Categoría actualizada ✅', 'success');
    syncToCloud(saveData, addToast);
    cancelEditing();
  }

  /** Borrar es irreversible y el botón está a pocos píxeles del de editar:
   *  pedir confirmación, igual que ya hacen cerrar sesión y borrar movimientos. */
  function confirmDeleteCategory() {
    if (!pendingDeleteCat) return;
    deleteCustomCategory(catType, pendingDeleteCat.id);
    setPendingDeleteCat(null);
    addToast('Categoría eliminada 🗑️', 'success');
    syncToCloud(saveData, addToast);
  }

  return (
    <>
  {/* ─── Categorías ─── */}
  <div>
    <button
      onClick={() => onToggle()}
      type="button"
      aria-expanded={abierto}
      className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
    >
      <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center text-purple-500 flex-shrink-0">
        <Tags className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Categorías personalizadas</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {(() => {
            const n = customExpenseCategories.length + customIncomeCategories.length;
            if (n === 0) return 'Ninguna todavía';
            return n === 1 ? '1 categoría creada' : `${n} categorías creadas`;
          })()}
        </p>
      </div>
      {abierto ? <ChevronUp className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 transition-transform" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 transition-transform" />}
    </button>

    {abierto && (
      <div className="px-4 pb-4 space-y-3 animate-fade-in">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Crea, visualiza y elimina tus categorías personalizadas. Las categorías por defecto no se pueden modificar.
        </p>

        {/* Selector de tipo */}
        <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setCatType(t)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                catType === t
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t === 'expense' ? '💸 Gastos' : '💰 Ingresos'}
            </button>
          ))}
        </div>

        {/* Lista de categorías personalizadas */}
        {activeCustomCats.length > 0 ? (
          <div className="space-y-1">
            {activeCustomCats.map((cat) => (
              <div key={cat.id}>
                {editingCatId === cat.id ? (
                  /* ── Inline edit form ── */
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-brand-300 dark:border-brand-700">
                    <IconPicker value={editingCatIcon} onChange={setEditingCatIcon} size="sm" />
                    <input
                      type="text"
                      value={editingCatLabel}
                      onChange={(e) => setEditingCatLabel(e.target.value)}
                      aria-label="Nombre de la categoría"
                      className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCategory(); }}
                      autoFocus
                    />
                    <button
                      onClick={handleUpdateCategory}
                      className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-600 p-1 flex-shrink-0"
                      aria-label="Guardar categoría"
                      title="Guardar"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="text-slate-600 dark:text-slate-400 hover:text-slate-600 p-1 flex-shrink-0"
                      aria-label="Cancelar edición de categoría"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  /* ── Normal view ── */
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {cat.label}
                    </span>
                    {/* Objetivos táctiles de 36px y separados entre sí:
                        antes eran botones de ~24px pegados, y en un
                        teléfono era fácil dar a Eliminar queriendo Editar. */}
                    <button
                      type="button"
                      onClick={() => startEditing(cat)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                      title="Editar categoría"
                      aria-label={`Editar la categoría ${cat.label}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteCat({ id: cat.id, label: cat.label })}
                      className="w-9 h-9 ml-1 flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950 transition-colors flex-shrink-0"
                      title="Eliminar categoría"
                      aria-label={`Eliminar la categoría ${cat.label}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600 dark:text-slate-400 text-center py-2">
            No tienes categorías personalizadas de {catType === 'expense' ? 'gasto' : 'ingreso'}.
          </p>
        )}

        {/* Form para añadir nueva */}
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Nueva categoría
          </p>
          <input
            type="text"
            value={newCatLabel}
            onChange={(e) => setNewCatLabel(e.target.value)}
            aria-label="Nombre de la nueva categoría"
            className="saas-input-sm text-xs"
            placeholder="Nombre de la categoría"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
          />
          <div>
            <input
              type="text"
              value={newCatGroup}
              onChange={(e) => setNewCatGroup(e.target.value)}
              aria-label="Grupo de la nueva categoría"
              list="grupos-existentes"
              className="saas-input-sm text-xs"
              placeholder="Grupo (p. ej. Suscripciones) — opcional"
            />
            <datalist id="grupos-existentes">
              {gruposExistentes.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Ícono:</span>
            <IconPicker value={newCatIcon} onChange={setNewCatIcon} />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Color:</span>
            <ColorPicker value={newCatColor} onChange={setNewCatColor} />
          </div>
          <button onClick={handleAddCategory} className="saas-btn-primary saas-btn-sm w-full">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Añadir categoría
          </button>
        </div>
      </div>
    )}
  </div>
      <ConfirmDialog
        open={pendingDeleteCat !== null}
        title="Eliminar categoría"
        message={`¿Eliminar «${pendingDeleteCat?.label ?? ''}»? Los movimientos que ya la usan conservan su categoría, pero no podrás asignarla a nuevos movimientos. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteCategory}
        onCancel={() => setPendingDeleteCat(null)}
      />
    </>
  );
}
