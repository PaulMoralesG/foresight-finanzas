// ================================================================
// CATEGORÍAS DE INGRESOS Y GASTOS (por defecto)
// ================================================================

import type { Category } from '@/types';

// ── GASTOS ──
export const EXPENSE_CATEGORIES: Category[] = [
  // Hogar y servicios
  { id: 'supermercado', label: 'Supermercado', icon: '🛒', color: 'bg-green-100 text-green-600' },
  { id: 'servicios', label: 'Servicios', icon: '💡', color: 'bg-yellow-100 text-yellow-600' },
  { id: 'alquiler', label: 'Alquiler/Renta', icon: '🏠', color: 'bg-teal-100 text-teal-600' },
  { id: 'hogar', label: 'Hogar', icon: '🛋️', color: 'bg-teal-100 text-teal-700' },
  { id: 'reparaciones', label: 'Reparaciones', icon: '🔧', color: 'bg-slate-100 text-slate-600' },

  // Alimentación
  { id: 'comida', label: 'Comida', icon: '🍴', color: 'bg-orange-100 text-orange-600' },
  { id: 'restaurantes', label: 'Restaurantes', icon: '🍽️', color: 'bg-orange-100 text-orange-700' },

  // Transporte
  { id: 'transporte', label: 'Transporte', icon: '🚌', color: 'bg-blue-100 text-blue-600' },
  { id: 'gasolina', label: 'Gasolina', icon: '⛽', color: 'bg-blue-100 text-blue-700' },

  // Pagos y finanzas
  { id: 'pago-tarjetas', label: 'Pago de Tarjetas', icon: '💳', color: 'bg-red-100 text-red-600' },
  { id: 'impuestos', label: 'Impuestos', icon: '📄', color: 'bg-red-100 text-red-700' },
  { id: 'seguros', label: 'Seguros', icon: '🛡️', color: 'bg-indigo-100 text-indigo-600' },
  { id: 'prestamos', label: 'Préstamos', icon: '🏦', color: 'bg-red-100 text-red-800' },

  // Salud y educación
  { id: 'salud', label: 'Salud', icon: '💊', color: 'bg-red-100 text-red-500' },
  { id: 'educacion', label: 'Educación', icon: '📚', color: 'bg-blue-100 text-blue-700' },

  // Ocio y estilo de vida
  { id: 'ropa', label: 'Ropa', icon: '👕', color: 'bg-pink-100 text-pink-600' },
  { id: 'entretenimiento', label: 'Ocio', icon: '🎉', color: 'bg-purple-100 text-purple-600' },
  { id: 'streaming', label: 'Streaming', icon: '🎬', color: 'bg-purple-100 text-purple-700' },
  { id: 'subscripciones', label: 'Suscripciones', icon: '📱', color: 'bg-indigo-100 text-indigo-500' },
  { id: 'deporte', label: 'Deporte', icon: '🏋️', color: 'bg-green-100 text-green-700' },
  { id: 'viajes', label: 'Viajes', icon: '✈️', color: 'bg-cyan-100 text-cyan-600' },
  { id: 'mascotas', label: 'Mascotas', icon: '🐾', color: 'bg-amber-100 text-amber-600' },

  // Otros
  { id: 'regalos', label: 'Regalos', icon: '🎁', color: 'bg-pink-100 text-pink-500' },
  { id: 'donaciones', label: 'Donaciones', icon: '🤝', color: 'bg-emerald-100 text-emerald-600' },
  { id: 'ahorro', label: 'Ahorro', icon: '🐷', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'esenciales', label: 'Esenciales', icon: '⭐', color: 'bg-violet-100 text-violet-600' },
  { id: 'general', label: 'General', icon: '📋', color: 'bg-slate-100 text-slate-600' },
  { id: 'otros', label: 'Otros', icon: '💸', color: 'bg-gray-100 text-gray-600' },
];

// ── INGRESOS ──
export const INCOME_CATEGORIES: Category[] = [
  // Empleo
  { id: 'sueldo', label: 'Sueldo', icon: '💼', color: 'bg-green-100 text-green-600' },
  { id: 'bonos', label: 'Bonos', icon: '🎁', color: 'bg-indigo-100 text-indigo-600' },
  { id: 'comisiones', label: 'Comisiones', icon: '📊', color: 'bg-green-100 text-green-700' },
  { id: 'propinas', label: 'Propinas', icon: '💵', color: 'bg-green-100 text-green-800' },
  { id: 'horas_extra', label: 'Horas Extra', icon: '⏰', color: 'bg-teal-100 text-teal-600' },

  // Negocio / Independiente
  { id: 'negocio', label: 'Negocio', icon: '🏢', color: 'bg-blue-100 text-blue-600' },
  { id: 'ventas', label: 'Ventas', icon: '🛍️', color: 'bg-blue-100 text-blue-700' },
  { id: 'freelance', label: 'Freelance', icon: '💻', color: 'bg-purple-100 text-purple-600' },

  // Inversiones y pasivos
  { id: 'inversiones', label: 'Inversiones', icon: '📈', color: 'bg-yellow-100 text-yellow-600' },
  { id: 'alquiler_ingreso', label: 'Alquiler', icon: '🏘️', color: 'bg-teal-100 text-teal-500' },
  { id: 'dividendos', label: 'Dividendos', icon: '💹', color: 'bg-yellow-100 text-yellow-700' },

  // Otros ingresos
  { id: 'ayuda', label: 'Ayuda Familiar', icon: '👨‍👩‍👧', color: 'bg-orange-100 text-orange-600' },
  { id: 'reembolsos', label: 'Reembolsos', icon: '↩️', color: 'bg-cyan-100 text-cyan-600' },
  { id: 'premios', label: 'Premios', icon: '🏆', color: 'bg-amber-100 text-amber-600' },
  { id: 'pension', label: 'Pensión', icon: '👴', color: 'bg-amber-100 text-amber-700' },
  { id: 'beca', label: 'Beca', icon: '🎓', color: 'bg-blue-100 text-blue-500' },
  { id: 'ahorros_retiro', label: 'Retiro de Ahorros', icon: '🏦', color: 'bg-emerald-100 text-emerald-600' },
  { id: 'venta_activos', label: 'Venta de Activos', icon: '🏷️', color: 'bg-slate-100 text-slate-600' },
  { id: 'otros', label: 'Otros', icon: '💰', color: 'bg-gray-100 text-gray-600' },
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
