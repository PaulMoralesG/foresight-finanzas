// ================================================================
// useCategories — Hook compartido para gestión de categorías personalizadas
// Elimina duplicación entre TransactionModal y ProfilePage
// ================================================================

import { useState } from 'react';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { CATEGORY_COLORS } from '@/config/categories';
import type { Category } from '@/types';

export const CATEGORY_EMOJIS = ['📌', '🛒', '🍴', '💊', '📚', '🎉', '💼', '🏠', '🚗', '💻', '💰', '🎁', '🔧', '🐾', '✈️', '📱', '⛪'] as const;

export interface UseCategoriesOptions {
  /** Callback after successful save (e.g., to sync with Supabase) */
  onSaved?: () => void;
  /** Default type for new categories */
  defaultType?: 'expense' | 'income';
}

export function useCategories(options: UseCategoriesOptions = {}) {
  const { onSaved, defaultType = 'expense' } = options;

  const addCustomCategory = useFinanceStore((s) => s.addCustomCategory);
  const addToast = useUiStore((s) => s.addToast);

  // ── Estado del formulario de nueva categoría ──
  const [type, setType] = useState<'expense' | 'income'>(defaultType);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<string>('📌');
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  // Categorías activas según el tipo seleccionado
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const activeCategories = type === 'expense' ? customExpenseCategories : customIncomeCategories;

  /** Validar y crear la categoría. Retorna true si se creó correctamente */
  function handleCreate(): boolean {
    const trimmed = label.trim();
    if (!trimmed) {
      addToast('Ingresa un nombre para la categoría', 'error');
      return false;
    }
    if (activeCategories.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())) {
      addToast('Ya existe una categoría con ese nombre', 'error');
      return false;
    }
    const id = 'custom_' + trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const newCategory: Category = { id, label: trimmed, icon, color };
    addCustomCategory(type, newCategory);
    setLabel('');
    setShowForm(false);
    addToast('Categoría creada ✅', 'success');
    onSaved?.();
    return true;
  }

  /** Crear y retornar el ID de la nueva categoría */
  function handleCreateAndGetId(): string | null {
    const trimmed = label.trim();
    if (!trimmed) {
      addToast('Ingresa un nombre para la categoría', 'error');
      return null;
    }
    if (activeCategories.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())) {
      addToast('Ya existe una categoría con ese nombre', 'error');
      return null;
    }
    const id = 'custom_' + trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const newCategory: Category = { id, label: trimmed, icon, color };
    addCustomCategory(type, newCategory);
    setLabel('');
    setShowForm(false);
    addToast('Categoría creada ✅', 'success');
    onSaved?.();
    return id;
  }

  /** Resetear el formulario */
  function reset() {
    setLabel('');
    setIcon('📌');
    setColor(CATEGORY_COLORS[0]);
    setShowForm(false);
  }

  return {
    // Estado
    type,
    setType,
    showForm,
    setShowForm,
    label,
    setLabel,
    icon,
    setIcon,
    color,
    setColor,
    activeCategories,
    // Acciones
    handleCreate,
    handleCreateAndGetId,
    reset,
    // Constantes
    EMOJIS: CATEGORY_EMOJIS,
    COLORS: CATEGORY_COLORS,
  };
}
