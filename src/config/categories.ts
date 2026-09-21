// ================================================================
// CATEGORÍAS DE INGRESOS Y GASTOS (por defecto)
// ================================================================

import type { Category } from '@/types';

/** Grupo de una categoría; las que no tienen (custom viejas) caen en "Otros". */
export const DEFAULT_GROUP = 'Otros';
export function categoryGroup(id: string, customCategories?: Category[]): string {
  return getCategoryById(id, customCategories).group || DEFAULT_GROUP;
}

// ── GASTOS ──
export const EXPENSE_CATEGORIES: Category[] = [
  // Hogar y servicios
  { id: 'supermercado', label: 'Supermercado', icon: '🛒', color: 'bg-green-100 text-green-600', group: 'Hogar y servicios' },
  { id: 'servicios', label: 'Servicios', icon: '💡', color: 'bg-yellow-100 text-yellow-600', group: 'Hogar y servicios' },
  { id: 'alquiler', label: 'Alquiler/Renta', icon: '🏠', color: 'bg-teal-100 text-teal-600', group: 'Hogar y servicios' },
  { id: 'hogar', label: 'Hogar', icon: '🛋️', color: 'bg-teal-100 text-teal-700', group: 'Hogar y servicios' },
  { id: 'reparaciones', label: 'Reparaciones', icon: '🔧', color: 'bg-slate-100 text-slate-600', group: 'Hogar y servicios' },

  // Alimentación
  { id: 'comida', label: 'Comida', icon: '🍴', color: 'bg-orange-100 text-orange-600', group: 'Alimentación' },
  { id: 'restaurantes', label: 'Restaurantes', icon: '🍽️', color: 'bg-orange-100 text-orange-700', group: 'Alimentación' },

  // Transporte
  { id: 'transporte', label: 'Transporte', icon: '🚌', color: 'bg-blue-100 text-blue-600', group: 'Transporte' },
  { id: 'gasolina', label: 'Gasolina', icon: '⛽', color: 'bg-blue-100 text-blue-700', group: 'Transporte' },

  // Pagos y finanzas
  { id: 'pago-tarjetas', label: 'Pago de Tarjetas', icon: '💳', color: 'bg-red-100 text-red-600', group: 'Pagos y finanzas' },
  { id: 'impuestos', label: 'Impuestos', icon: '📄', color: 'bg-red-100 text-red-700', group: 'Pagos y finanzas' },
  { id: 'seguros', label: 'Seguros', icon: '🛡️', color: 'bg-indigo-100 text-indigo-600', group: 'Pagos y finanzas' },
  { id: 'prestamos', label: 'Préstamos', icon: '🏦', color: 'bg-red-100 text-red-800', group: 'Pagos y finanzas' },

  // Salud y educación
  { id: 'salud', label: 'Salud', icon: '💊', color: 'bg-red-100 text-red-500', group: 'Salud y educación' },
  { id: 'educacion', label: 'Educación', icon: '📚', color: 'bg-blue-100 text-blue-700', group: 'Salud y educación' },

  // Ocio y estilo de vida
  { id: 'ropa', label: 'Ropa', icon: '👕', color: 'bg-pink-100 text-pink-600', group: 'Ocio y estilo de vida' },
  { id: 'entretenimiento', label: 'Ocio', icon: '🎉', color: 'bg-purple-100 text-purple-600', group: 'Ocio y estilo de vida' },
  { id: 'streaming', label: 'Streaming', icon: '🎬', color: 'bg-purple-100 text-purple-700', group: 'Ocio y estilo de vida' },
  { id: 'subscripciones', label: 'Suscripciones', icon: '📱', color: 'bg-indigo-100 text-indigo-500', group: 'Ocio y estilo de vida' },
  { id: 'deporte', label: 'Deporte', icon: '🏋️', color: 'bg-green-100 text-green-700', group: 'Ocio y estilo de vida' },
  { id: 'viajes', label: 'Viajes', icon: '✈️', color: 'bg-cyan-100 text-cyan-600', group: 'Ocio y estilo de vida' },
  { id: 'mascotas', label: 'Mascotas', icon: '🐾', color: 'bg-amber-100 text-amber-600', group: 'Ocio y estilo de vida' },

  // Otros
  { id: 'regalos', label: 'Regalos', icon: '🎁', color: 'bg-pink-100 text-pink-500', group: 'Otros' },
  { id: 'donaciones', label: 'Donaciones', icon: '🤝', color: 'bg-emerald-100 text-emerald-600', group: 'Otros' },
  { id: 'ahorro', label: 'Ahorro', icon: '🐷', color: 'bg-emerald-100 text-emerald-700', group: 'Otros' },
  { id: 'esenciales', label: 'Esenciales', icon: '⭐', color: 'bg-violet-100 text-violet-600', group: 'Otros' },
  { id: 'general', label: 'General', icon: '📋', color: 'bg-slate-100 text-slate-600', group: 'Otros' },
  { id: 'otros', label: 'Otros', icon: '💸', color: 'bg-gray-100 text-gray-600', group: 'Otros' },
];

// ── INGRESOS ──
export const INCOME_CATEGORIES: Category[] = [
  // Empleo
  { id: 'sueldo', label: 'Sueldo', icon: '💼', color: 'bg-green-100 text-green-600', group: 'Empleo' },
  { id: 'bonos', label: 'Bonos', icon: '🎁', color: 'bg-indigo-100 text-indigo-600', group: 'Empleo' },
  { id: 'comisiones', label: 'Comisiones', icon: '📊', color: 'bg-green-100 text-green-700', group: 'Empleo' },
  { id: 'propinas', label: 'Propinas', icon: '💵', color: 'bg-green-100 text-green-800', group: 'Empleo' },
  { id: 'horas_extra', label: 'Horas Extra', icon: '⏰', color: 'bg-teal-100 text-teal-600', group: 'Empleo' },

  // Negocio / Independiente
  { id: 'negocio', label: 'Negocio', icon: '🏢', color: 'bg-blue-100 text-blue-600', group: 'Negocio / Independiente' },
  { id: 'ventas', label: 'Ventas', icon: '🛍️', color: 'bg-blue-100 text-blue-700', group: 'Negocio / Independiente' },
  { id: 'freelance', label: 'Freelance', icon: '💻', color: 'bg-purple-100 text-purple-600', group: 'Negocio / Independiente' },

  // Inversiones y pasivos
  { id: 'inversiones', label: 'Inversiones', icon: '📈', color: 'bg-yellow-100 text-yellow-600', group: 'Inversiones y pasivos' },
  { id: 'alquiler_ingreso', label: 'Alquiler', icon: '🏘️', color: 'bg-teal-100 text-teal-500', group: 'Inversiones y pasivos' },
  { id: 'dividendos', label: 'Dividendos', icon: '💹', color: 'bg-yellow-100 text-yellow-700', group: 'Inversiones y pasivos' },

  // Otros ingresos
  { id: 'ayuda', label: 'Ayuda Familiar', icon: '👨‍👩‍👧', color: 'bg-orange-100 text-orange-600', group: 'Otros ingresos' },
  { id: 'reembolsos', label: 'Reembolsos', icon: '↩️', color: 'bg-cyan-100 text-cyan-600', group: 'Otros ingresos' },
  { id: 'premios', label: 'Premios', icon: '🏆', color: 'bg-amber-100 text-amber-600', group: 'Otros ingresos' },
  { id: 'pension', label: 'Pensión', icon: '👴', color: 'bg-amber-100 text-amber-700', group: 'Otros ingresos' },
  { id: 'beca', label: 'Beca', icon: '🎓', color: 'bg-blue-100 text-blue-500', group: 'Otros ingresos' },
  { id: 'ahorros_retiro', label: 'Retiro de Ahorros', icon: '🏦', color: 'bg-emerald-100 text-emerald-600', group: 'Otros ingresos' },
  { id: 'venta_activos', label: 'Venta de Activos', icon: '🏷️', color: 'bg-slate-100 text-slate-600', group: 'Otros ingresos' },
  { id: 'otros', label: 'Otros', icon: '💰', color: 'bg-gray-100 text-gray-600', group: 'Otros ingresos' },
];

/** Obtiene una categoría por id (busca en gastos, ingresos y personalizadas) */
export function getCategoryById(id: string, customCategories?: Category[]): Category {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...(customCategories || [])];
  return all.find((c) => c.id === id) ?? {
    id: 'unknown',
    label: 'Sin categoría',
    icon: '❓',
    color: 'bg-gray-100 text-gray-600',
  };
}

/**
 * Emojis ofrecidos al crear una categoría personalizada.
 *
 * Vivía en `hooks/useCategories.ts` —un hook que ya no llamaba nadie— y
 * TransactionModal llevaba además su propia copia escrita a mano en el JSX, así
 * que las dos listas podían divergir. Va aquí, junto a CATEGORY_COLORS, que es
 * su pareja natural.
 */
export const CATEGORY_EMOJIS = [
  '📌', '🛒', '🍴', '💊', '📚', '🎉', '💼', '🏠', '🚗',
  '💻', '💰', '🎁', '🔧', '🐾', '✈️', '📱', '⛪',
] as const;

/** Paleta de colores para categorías personalizadas (usada en TransactionModal y ProfilePage) */
export const CATEGORY_COLORS = [
  'bg-violet-100 text-violet-600',
  'bg-red-100 text-red-600',
  'bg-orange-100 text-orange-600',
  'bg-green-100 text-green-600',
  'bg-blue-100 text-blue-600',
  'bg-yellow-100 text-yellow-600',
  'bg-teal-100 text-teal-600',
  'bg-pink-100 text-pink-600',
  'bg-purple-100 text-purple-600',
  'bg-indigo-100 text-indigo-600',
  'bg-cyan-100 text-cyan-600',
  'bg-amber-100 text-amber-600',
  'bg-emerald-100 text-emerald-600',
  'bg-slate-100 text-slate-600',
];
