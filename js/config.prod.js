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

// CATEGORIAS ESPECÍFICAS PARA ESTUDIANTES UNIVERSITARIOS
export const EXPENSE_CATEGORIES = [
    { id: 'comida-u', label: 'Comida U', icon: '🍴', color: 'bg-orange-100 text-orange-600' },
    { id: 'transporte-u', label: 'Bus/Metro', icon: '🚌', color: 'bg-blue-100 text-blue-600' },
    { id: 'materiales', label: 'Materiales', icon: '📋', color: 'bg-yellow-100 text-yellow-600' },
    { id: 'fotocopias', label: 'Fotocopias', icon: '🖨️', color: 'bg-gray-100 text-gray-600' },
    { id: 'libros', label: 'Libros', icon: '📚', color: 'bg-green-100 text-green-600' },
    { id: 'entretenimiento', label: 'Entretenimiento', icon: '🎉', color: 'bg-purple-100 text-purple-600' },
    { id: 'ropa-casual', label: 'Ropa', icon: '👕', color: 'bg-pink-100 text-pink-600' },
    { id: 'casa-estudiantil', label: 'Hogar', icon: '🏠', color: 'bg-teal-100 text-teal-600' },
    { id: 'salud-estudiantil', label: 'Salud', icon: '💊', color: 'bg-red-100 text-red-600' },
    { id: 'subscripciones', label: 'Apps/Subs', icon: '📱', color: 'bg-indigo-100 text-indigo-600' },
    { id: 'salidas-amigos', label: 'Salidas', icon: '🍻', color: 'bg-cyan-100 text-cyan-600' },
    { id: 'emergencias', label: 'Emergencias', icon: '⚠️', color: 'bg-red-100 text-red-700' },
    { id: 'gimnasio-deporte', label: 'Deporte', icon: '🏋️', color: 'bg-green-100 text-green-700' },
    { id: 'proyectos-uni', label: 'Proyectos', icon: '📈', color: 'bg-blue-100 text-blue-700' },
    { id: 'otros-gastos', label: 'Otros', icon: '💸', color: 'bg-gray-100 text-gray-600' },
];

// INGRESOS ESPECÍFICOS PARA ESTUDIANTES UNIVERSITARIOS
export const INCOME_CATEGORIES = [
    { id: 'beca-estudiantil', label: 'Beca', icon: '🎓', color: 'bg-green-100 text-green-600' },
    { id: 'mesada-familia', label: 'Mesada', icon: '👨‍👩‍👧', color: 'bg-blue-100 text-blue-600' },
    { id: 'trabajo-medio-tiempo', label: 'Trabajo MT', icon: '👩‍💼', color: 'bg-purple-100 text-purple-600' },
    { id: 'freelance', label: 'Freelance', icon: '💻', color: 'bg-yellow-100 text-yellow-600' },
    { id: 'tutorías', label: 'Tutorías', icon: '🎯', color: 'bg-pink-100 text-pink-600' },
    { id: 'venta-productos', label: 'Ventas', icon: '🛍️', color: 'bg-teal-100 text-teal-600' },
    { id: 'apoyo-extra', label: 'Apoyo Extra', icon: '🎁', color: 'bg-indigo-100 text-indigo-600' },
    { id: 'prestamo-familiar', label: 'Prestamo', icon: '🤝', color: 'bg-orange-100 text-orange-600' },
    { id: 'otros-ingresos', label: 'Otros', icon: '💰', color: 'bg-gray-100 text-gray-600' },
];