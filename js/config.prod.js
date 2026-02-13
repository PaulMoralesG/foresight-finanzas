// CONFIGURACIÓN DE PRODUCCIÓN PARA GITHUB PAGES
// Este archivo contiene claves de DEMO/DESARROLLO que permiten
// que la aplicación muestre su interfaz en el deployment público.
// Para uso real, crea tu archivo config.js con tus propias claves.

export const EMAILJS_PUBLIC_KEY = "DEMO_KEY";
export const EMAILJS_SERVICE_ID = "DEMO_SERVICE";  
export const EMAILJS_TEMPLATE_ID = "DEMO_TEMPLATE";

// ⚠️ ESTAS SON CLAVES DE DEMO - REEMPLAZA POR LAS TUYAS
export const SUPABASE_URL = "https://demo.supabase.co";
export const SUPABASE_KEY = "DEMO_ANON_KEY";

// CATEGORIAS (estas sí funcionan normalmente)
export const EXPENSE_CATEGORIES = [
    { id: 'comida', label: 'Comida', icon: '🍔', color: 'bg-orange-100 text-orange-600' },
    { id: 'transporte', label: 'Transp.', icon: '🚖', color: 'bg-blue-100 text-blue-600' },
    { id: 'ocio', label: 'Ocio', icon: '🎉', color: 'bg-purple-100 text-purple-600' },
    { id: 'super', label: 'Súper', icon: '🛒', color: 'bg-green-100 text-green-600' },
    { id: 'ropa', label: 'Ropa', icon: '👕', color: 'bg-pink-100 text-pink-600' },
    { id: 'casa', label: 'Casa', icon: '🏠', color: 'bg-teal-100 text-teal-600' },
    { id: 'salud', label: 'Salud', icon: '💊', color: 'bg-red-100 text-red-600' },
    { id: 'educacion', label: 'Educ.', icon: '📚', color: 'bg-yellow-100 text-yellow-600' },
    { id: 'servicios', label: 'Servic.', icon: '💡', color: 'bg-gray-100 text-gray-600' },
    { id: 'suscrip', label: 'Subs', icon: '📺', color: 'bg-indigo-100 text-indigo-600' },
    { id: 'viajes', label: 'Viajes', icon: '✈️', color: 'bg-cyan-100 text-cyan-600' },
    { id: 'otros', label: 'Otros', icon: '💸', color: 'bg-gray-100 text-gray-600' },
];

export const INCOME_CATEGORIES = [
    { id: 'sueldo', label: 'Sueldo', icon: '💰', color: 'bg-green-100 text-green-600' },
    { id: 'negocio', label: 'Negocio', icon: '👔', color: 'bg-blue-100 text-blue-600' },
    { id: 'venta', label: 'Venta', icon: '🏷️', color: 'bg-purple-100 text-purple-600' },
    { id: 'regalo', label: 'Regalo', icon: '🎁', color: 'bg-pink-100 text-pink-600' },
    { id: 'inversion', label: 'Inversión', icon: '📈', color: 'bg-yellow-100 text-yellow-600' },
    { id: 'otros', label: 'Otros', icon: '💎', color: 'bg-teal-100 text-teal-600' },
];