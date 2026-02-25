import { AppState, setCurrentUser, setState } from './state.js';
import { showNotification } from './utils.js';
import { getSupabaseConfig } from './config-loader.js';

let SUPABASE_URL = null;
let SUPABASE_KEY = null;
export let supabaseClient = null;

// Función para limpiar el storage cuando hay problemas de sesión
async function clearAuthStorage() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('auth-token') || key.includes('supabase'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => {
            console.log('[AUTH] Limpiando:', key);
            localStorage.removeItem(key);
        });
        console.log('[AUTH] ✅ Storage limpiado');
    } catch (e) {
        console.error('[AUTH] Error limpiando storage:', e);
    }
}

export async function initSupabase() {
    if (supabaseClient) {
        console.log('[SUPABASE] Cliente ya inicializado');
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
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    flowType: 'pkce',
                    // Configuración para evitar problemas con LockManager
                    storage: window.localStorage,
                    storageKey: 'foresight-auth-token',
                    // Aumentar timeout para evitar errores de lock
                    lock: {
                        acquireTimeout: 15000 // 15 segundos en lugar de 10
                    }
                },
                global: {
                    headers: {
                        'X-Client-Info': 'foresight-finanzas'
                    }
                }
            });
            console.log('[SUPABASE] ✅ Cliente inicializado correctamente');
        } catch (e) {
            console.error("❌ Error creando cliente Supabase:", e);
            // Limpiar localStorage si hay error
            try {
                localStorage.removeItem('foresight-auth-token');
                localStorage.removeItem('sb-sphmtdtlvxbypckhavhgb-auth-token');
            } catch (cleanError) {
                console.error('Error limpiando storage:', cleanError);
            }
        }
    } else {
        showNotification("Error de conexión: Librería no cargada.", 'error');
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
    
    try {
        const result = await supabaseClient.auth.signInWithPassword({ email, password });
        return result;
    } catch (error) {
        // Detectar error de LockManager y limpiar storage
        if (error.message && error.message.includes('LockManager')) {
            console.error('[AUTH] Error de LockManager detectado, limpiando storage...');
            await clearAuthStorage();
            // Reintentar una vez después de limpiar
            const retryResult = await supabaseClient.auth.signInWithPassword({ email, password });
            return retryResult;
        }
        throw error;
    }
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
        console.error('[SAVE] No hay usuario actual');
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

            console.log('[SAVE] Guardando datos...', { email: currentUser.email, items: expenses.length });
            
            const { data, error } = await supabaseClient
                .from('profiles')
                .upsert(dataToSave, { onConflict: 'email' });
            
            if (error) {
                console.error('[SAVE] Error Supabase:', error);
                throw error;
            }
            
            console.log('[SAVE] ✅ Datos guardados exitosamente');
            showNotification("✅ Datos guardados en la nube", 'success');
        } else {
            console.error('[SAVE] SupabaseClient no disponible');
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
    console.log('[AUTH] Limpiando storage y recargando...');
    await clearAuthStorage();
    showNotification('🔄 Storage limpiado. Recargando aplicación...', 'success');
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// Exponer función globalmente para uso en consola si es necesario
window.clearForesightStorage = clearStorageAndReload;