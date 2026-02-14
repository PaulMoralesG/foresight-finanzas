import { AppState, setCurrentUser, setState } from './state.js';
import { showNotification } from './utils.js';
import { getSupabaseConfig } from './config-loader.js';

// Configuración dinámica: será cargada al inicializar
let SUPABASE_URL = null;
let SUPABASE_KEY = null;

// NOTA: Usamos window.supabase cargado desde el CDN en index.html
// Esto es más robusto contra inyecciones de extensiones (MetaMask, etc.)
export let supabaseClient = null;

export async function initSupabase() {
    // Cargar configuración dinámica
    if (!SUPABASE_URL) {
        try {
            const config = await getSupabaseConfig();
            SUPABASE_URL = config.SUPABASE_URL;
            SUPABASE_KEY = config.SUPABASE_KEY;
        } catch (e) {
            console.error("❌ Error cargando configuración Supabase:", e);
            return null;
        }
    }

    // Esperar a que window.supabase esté disponible (máx 5 seg)
    let attempts = 0;
    while (!window.supabase && attempts < 10) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }

    if (window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log("✅ Supabase cliente creado y conectado a la nube.");
        } catch (e) {
            console.error("❌ Error creando cliente Supabase:", e);
        }
    } else {
        console.error("❌ CRÍTICO: window.supabase no cargó desde CDN.");
        showNotification("Error de conexión: Librería no cargada.", 'error');
    }
    return supabaseClient;
}

// Helpers para manejar Perfiles y Auth de forma segura
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
    
    // Auto-reparación
    if (!data) {
        console.log("Perfil no encontrado en base de datos. Creando perfil inicial...");
        await createInitialProfile(email);
        
        const retry = await supabaseClient.from('profiles').select('*').eq('email', email).maybeSingle();
        data = retry.data;
        
        if (!data) {
            throw new Error("Perfil no encontrado incluso después de intentar crearlo.");
        }
    }
    
    // Convertir nombres de columnas snake_case a camelCase para JS
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
            console.error("Error creando perfil:", insertError);
            throw new Error("No se pudo crear el perfil: " + insertError.message);
        }
        console.log("✅ Perfil inicial creado en Supabase para:", email, "| Nombre:", firstName, lastName);
    }
}

export async function signIn(email, password) {
    if(!supabaseClient) {
        throw new Error("No hay conexión con la base de datos. Verifica tu conexión a internet.");
    }
    
    console.log("🔑 Intentando login con:", email);
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    console.log("📬 Resultado Login:", result);
    return result;
}

export async function signUp(email, password) {
    if(!supabaseClient) {
        throw new Error("No hay conexión con la base de datos. Verifica tu conexión a internet.");
    }
    
    console.log("📝 Creando cuenta en Supabase para:", email);
    const result = await supabaseClient.auth.signUp({ 
        email, 
        password,
        options: { emailRedirectTo: window.location.origin }
    });

    // Si la sesión se crea inmediatamente (sin confirmación de email requerida), crear perfil
    if (result.data?.session) {
        console.log("⚡ Sesión creada inmediatamente. Inicializando perfil...");
        await createInitialProfile(email);
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
    
    // Regresar al login
    if (window.showView) {
        window.showView('login-view');
    } else {
        window.location.reload();
    }
}

export async function saveData() {
    const { currentUser, budget, expenses } = AppState;
    if (!currentUser) return false;
    
    // Sync object (reference update)
    currentUser.budget = budget;
    currentUser.expenses = expenses;
    
    try {
        if (supabaseClient) {
            // Usar upsert para asegurar que se guarde incluso si el perfil no existía
            const { error } = await supabaseClient
                .from('profiles')
                .upsert({ 
                    email: currentUser.email, 
                    budget, 
                    expenses,
                    updated_at: new Date()
                }, { onConflict: 'email' });
            
            if (error) throw error;
        } else {
            throw new Error("No hay conexión con la base de datos.");
        }
        return true; 
    } catch (err) {
        console.error("Error al guardar:", err);
        showNotification("Error al sincronizar con la nube.", 'error');
        return false; 
    }
}