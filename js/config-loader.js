// GESTOR DE CONFIGURACIÓN DINÁMICA
// Este módulo carga automáticamente la configuración correcta
// según el entorno (desarrollo local vs GitHub Pages)

let configCache = null;

export async function loadConfig() {
    if (configCache) return configCache;
    
    // Detectar si estamos en GitHub Pages
    const isGitHubPages = window.location.hostname.includes('github.io');
    
    try {
        if (isGitHubPages) {
            // GitHub Pages: usar config.prod.js directamente
            console.log("📦 Usando configuración de producción (GitHub Pages)");
            configCache = await import('./config.prod.js');
        } else {
            // Local: intentar config.js, fallar a config.prod.js
            try {
                configCache = await import('./config.js');
                console.log("📦 Configuración local cargada");
            } catch {
                configCache = await import('./config.prod.js');
                console.log("📦 Usando config.prod.js como fallback");
            }
        }
    } catch (e) {
        console.error("Error cargando configuración:", e);
        // Último recurso: config.prod.js
        configCache = await import('./config.prod.js');
    }
    
    return configCache;
}

// Exportamos funciones async para obtener cada valor
export async function getEmailJSConfig() {
    const config = await loadConfig();
    return {
        EMAILJS_PUBLIC_KEY: config.EMAILJS_PUBLIC_KEY,
        EMAILJS_SERVICE_ID: config.EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID: config.EMAILJS_TEMPLATE_ID
    };
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