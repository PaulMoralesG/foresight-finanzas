import { AppState, setCurrentUser, setState } from './state.js';
import { showNotification } from './utils.js';
import { getSupabaseConfig } from './config-loader.js';

let SUPABASE_URL = null;
let SUPABASE_KEY = null;
export let supabaseClient = null;

export async function initSupabase() {
    if (!SUPABASE_URL) {
        try {
            const config = await getSupabaseConfig();
            SUPABASE_URL = config.SUPABASE_URL;
            SUPABASE_KEY = config.SUPABASE_KEY;
        } catch (e) {
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
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch (e) {
            console.error("❌ Error creando cliente Supabase:", e);
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
    if (!currentUser) return false;
    
    currentUser.budget = budget;
    currentUser.expenses = expenses;
    
    try {
        if (supabaseClient) {
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
        showNotification("Error al sincronizar con la nube.", 'error');
        return false; 
    }
}