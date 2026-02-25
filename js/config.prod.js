// ================================================================
// CONFIGURACIÓN DE PRODUCCIÓN PARA GITHUB PAGES
// ================================================================
// Este archivo contiene las claves PÚBLICAS para la aplicación.
// 
// 🔐 NOTA DE SEGURIDAD:
// - La clave SUPABASE_KEY es la clave 'anon' (pública) - ES SEGURO exponerla.
// - Esta clave NO da acceso total a la base de datos.
// - La seguridad real viene de Row Level Security (RLS) en Supabase.
// - Las contraseñas de usuarios NUNCA están aquí - están hasheadas en Supabase Auth.
// - NUNCA expongas la clave 'service_role' (la clave de administrador).
// ================================================================

export const EMAILJS_PUBLIC_KEY = "jvOpRliw08hAwHWee";
export const EMAILJS_SERVICE_ID = "service_xfvaqua";
export const EMAILJS_TEMPLATE_ID = "template_hiw0fpp";

// Clave 'anon' de Supabase (pública, segura para exponer)
export const SUPABASE_URL = "https://sphmdtlvxbypckhavhgb.supabase.co"; 
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwaG1kdGx2eGJ5cGNraGF2aGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTA3MTEsImV4cCI6MjA4NjQ4NjcxMX0.kBqqJpwtPL-W8YEGU9wdA3HvwBsL2-G4ZIv051StvrE";

// CATEGORÍAS DE GASTOS - Para cualquier persona
export const EXPENSE_CATEGORIES = [
    { id: 'esenciales', label: 'Esenciales', icon: '⭐', color: 'bg-violet-100 text-violet-600' },
    { id: 'comida', label: 'Comida', icon: '🍴', color: 'bg-orange-100 text-orange-600' },
    { id: 'supermercado', label: 'Supermercado', icon: '🛒', color: 'bg-green-100 text-green-600' },
    { id: 'transporte', label: 'Transporte', icon: '🚌', color: 'bg-blue-100 text-blue-600' },
    { id: 'servicios', label: 'Servicios', icon: '💡', color: 'bg-yellow-100 text-yellow-600' },
    { id: 'salud', label: 'Salud', icon: '💊', color: 'bg-red-100 text-red-600' },
    { id: 'educacion', label: 'Educación', icon: '📚', color: 'bg-blue-100 text-blue-700' },
    { id: 'hogar', label: 'Hogar', icon: '🏠', color: 'bg-teal-100 text-teal-600' },
    { id: 'ropa', label: 'Ropa', icon: '👕', color: 'bg-pink-100 text-pink-600' },
    { id: 'entretenimiento', label: 'Ocio', icon: '🎉', color: 'bg-purple-100 text-purple-600' },
    { id: 'subscripciones', label: 'Suscripciones', icon: '📱', color: 'bg-indigo-100 text-indigo-600' },
    { id: 'deporte', label: 'Deporte', icon: '🏋️', color: 'bg-green-100 text-green-700' },
    { id: 'mascotas', label: 'Mascotas', icon: '🐾', color: 'bg-amber-100 text-amber-600' },
    { id: 'viajes', label: 'Viajes', icon: '✈️', color: 'bg-cyan-100 text-cyan-600' },
    { id: 'general', label: 'General', icon: '📋', color: 'bg-slate-100 text-slate-600' },
    { id: 'otros', label: 'Otros', icon: '💸', color: 'bg-gray-100 text-gray-600' },
];

// CATEGORÍAS DE INGRESOS - Para cualquier persona
export const INCOME_CATEGORIES = [
    { id: 'sueldo', label: 'Sueldo', icon: '💼', color: 'bg-green-100 text-green-600' },
    { id: 'negocio', label: 'Negocio', icon: '🏢', color: 'bg-blue-100 text-blue-600' },
    { id: 'freelance', label: 'Freelance', icon: '💻', color: 'bg-purple-100 text-purple-600' },
    { id: 'inversiones', label: 'Inversiones', icon: '📈', color: 'bg-yellow-100 text-yellow-600' },
    { id: 'alquiler', label: 'Alquiler', icon: '🏘️', color: 'bg-teal-100 text-teal-600' },
    { id: 'bonos', label: 'Bonos', icon: '🎁', color: 'bg-indigo-100 text-indigo-600' },
    { id: 'propinas', label: 'Propinas', icon: '💵', color: 'bg-green-100 text-green-700' },
    { id: 'ayuda', label: 'Ayuda Familiar', icon: '👨‍👩‍👧', color: 'bg-orange-100 text-orange-600' },
    { id: 'reembolsos', label: 'Reembolsos', icon: '↩️', color: 'bg-cyan-100 text-cyan-600' },
    { id: 'premios', label: 'Premios', icon: '🏆', color: 'bg-amber-100 text-amber-600' },
    { id: 'otros', label: 'Otros', icon: '💰', color: 'bg-gray-100 text-gray-600' },
];