// GESTOR DE CONFIGURACIÓN DINÁMICA
// Este módulo carga automáticamente la configuración correcta
// según el entorno (desarrollo local vs GitHub Pages)

let configCache = null;

export async function loadConfig() {
    if (configCache) return configCache;
    
    try {
        // Cargar configuración de producción
        configCache = await import('./config.prod.js');
    } catch (e) {
        console.error("❌ Error cargando configuración:", e);
        throw new Error("No se pudo cargar la configuración. Verifica que config.prod.js existe.");
    }
    
    return configCache;
}

export async function getSupabaseConfig() {
    const config = await loadConfig();
    return {
        SUPABASE_URL: config.SUPABASE_URL,
        SUPABASE_KEY: config.SUPABASE_KEY
    };
}

export async function getCategories() {
    const config = await loadConfig();
    return {
        EXPENSE_CATEGORIES: config.EXPENSE_CATEGORIES,
        INCOME_CATEGORIES: config.INCOME_CATEGORIES,
        getCategoryById: (id) => {
            const allCategories = [...config.EXPENSE_CATEGORIES, ...config.INCOME_CATEGORIES];
            return allCategories.find(cat => cat.id === id) || { label: 'Sin categoría', icon: '❓', color: 'bg-gray-100 text-gray-600' };
        }
    };
}