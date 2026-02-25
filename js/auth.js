import { AppState, setCurrentUser, setState } from './state.js';
import { showNotification } from './utils.js';
import { getSupabaseConfig } from './config-loader.js';

let SUPABASE_URL = null;
let SUPABASE_KEY = null;
export let supabaseClient = null;

// Función para limpiar el storage cuando hay problemas de sesión
function clearAuthStorage() {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (key.includes('auth-token') || key.includes('supabase'))) {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        console.error('[AUTH] Error limpiando storage:', e);
    }
}

export async function initSupabase() {
    if (supabaseClient) {
        return supabaseClient;
    }
    
    if (!SUPABASE_URL) {
        try {
            const config = await getSupabaseConfig();
            SUPABASE_URL = config.SUPABASE_URL;
            SUPABASE_KEY = config.SUPABASE_KEY;
        } catch (e) {
            console.error('[SUPABASE] Error cargando config:', e);
            return null;
        }
    }

    let attempts = 0;
    while (!window.supabase && attempts < 10) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }

    if (window.supabase) {
        try {
            // Configuración simple y funcional de Supabase
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                }
            });
        } catch (e) {
            console.error("❌ Error creando cliente Supabase:", e);
            clearAuthStorage();
        }
    }
    return supabaseClient;
}

export async function loadProfileFromSupabase(email) {
    if(!supabaseClient) {
        throw new Error("No hay conexión con la base de datos. Verifica tu conexión a internet.");
    }
    
    let { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (error) throw error;
    
    if (!data) {
        await createInitialProfile(email);
        const retry = await supabaseClient.from('profiles').select('*').eq('email', email).maybeSingle();
        data = retry.data;
        
        if (!data) {
            throw new Error("Perfil no encontrado incluso después de intentar crearlo.");
        }
    }
    
    if(data) {
        data.firstName = data.first_name;
        data.lastName = data.last_name;
    }
    
    return data;
}

export async function createInitialProfile(email, firstName = '', lastName = '') {
    if(!supabaseClient) {
        throw new Error("No hay conexión con la base de datos para crear el perfil.");
    }
    
    const { data } = await supabaseClient.from('profiles').select('email').eq('email', email).maybeSingle();
    if (!data) {
        const { error: insertError } = await supabaseClient
            .from('profiles')
            .insert([{ email, first_name: firstName, last_name: lastName, budget: 0, expenses: [], password: 'auth-managed' }]);
        
        if (insertError) {
            throw new Error("No se pudo crear el perfil: " + insertError.message);
        }
    }
}

export async function signIn(email, password) {
    if(!supabaseClient) {
        throw new Error("No hay conexión con la base de datos. Verifica tu conexión a internet.");
    }
    
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    return result;
}

export async function signUp(email, password, firstName = '', lastName = '') {
    if(!supabaseClient) {
        throw new Error("No hay conexión con la base de datos. Verifica tu conexión a internet.");
    }
    
    const result = await supabaseClient.auth.signUp({ 
        email, 
        password,
        options: { 
            emailRedirectTo: window.location.origin,
            data: {
                first_name: firstName,
                last_name: lastName
            }
        }
    });

    // Solo crear perfil si hay sesión automática (sin confirmación de correo)
    if (result.data?.session) {
        await createInitialProfile(email, firstName, lastName);
    }

    return result;
}

export async function resendInvite(email) {
    if(!supabaseClient) return;
    return await supabaseClient.auth.resend({
        type: 'signup',
        email: email,
        options: { emailRedirectTo: window.location.origin }
    });
}

export async function logout() {
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
    setCurrentUser(null);
    
    if (window.showView) {
        window.showView('login-view');
    } else {
        window.location.reload();
    }
}

export async function saveData() {
    const { currentUser, budget, expenses } = AppState;
    if (!currentUser) {
        return false;
    }
    
    currentUser.budget = budget;
    currentUser.expenses = expenses;
    
    try {
        if (supabaseClient) {
            const dataToSave = { 
                email: currentUser.email, 
                budget, 
                expenses,
                first_name: currentUser.firstName || currentUser.first_name || '',
                last_name: currentUser.lastName || currentUser.last_name || '',
                updated_at: new Date().toISOString()
            };
            
            const { data, error } = await supabaseClient
                .from('profiles')
                .upsert(dataToSave, { onConflict: 'email' });
            
            if (error) {
                console.error('[SAVE] Error Supabase:', error);
                throw error;
            }
            
            showNotification("✅ Datos guardados en la nube", 'success');
        } else {
            throw new Error("No hay conexión con la base de datos.");
        }
        return true; 
    } catch (err) {
        console.error('[SAVE] Error completo:', err);
        let errorMsg = "Error al sincronizar con la nube.";
        
        if (err.message?.includes('network') || err.message?.includes('fetch')) {
            errorMsg = "🌐 Error de conexión. Verifica tu internet.";
        } else if (err.message?.includes('permission') || err.message?.includes('policy')) {
            errorMsg = "❌ Error de permisos. Intenta cerrar sesión y volver a entrar.";
        } else if (err.code === 'PGRST116') {
            errorMsg = "⚠️ Error de sincronización. Intenta de nuevo.";
        }
        
        showNotification(errorMsg, 'error');
        return false; 
    }
}

// Función de emergencia para limpiar storage manualmente
export async function clearStorageAndReload() {
    await clearAuthStorage();
    showNotification('🔄 Storage limpiado. Recargando aplicación...', 'success');
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// Exponer función globalmente para uso en consola si es necesario
window.clearForesightStorage = clearStorageAndReload;