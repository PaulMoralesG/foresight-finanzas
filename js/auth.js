import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { AppState, setCurrentUser, setState } from './state.js';
import { showNotification } from './utils.js';

// NOTA: Usamos window.supabase cargado desde el CDN en index.html
// Esto es más robusto contra inyecciones de extensiones (MetaMask, etc.)
export let supabaseClient = null;

export function initSupabase() {
    if (window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log("✅ Supabase cliente creado (Global UMD).");
        } catch (e) {
            console.error("❌ Error creando cliente Supabase:", e);
        }
    } else {
        console.warn("⚠️ window.supabase no encontrado aún. Reintentando en breve...");
        // Reintento simple por si el script tarda en cargar
        setTimeout(() => {
            if(window.supabase && !supabaseClient) {
                initSupabase();
                // Forzar recarga de listeners si es necesario
                console.log("🔄 Inicialización diferida ejecutada.");
            }
        }, 1000);
    }
    return supabaseClient;
}

// Helpers para manejar Perfiles y Auth de forma segura
export async function loadProfileFromSupabase(email) {
    if(!supabaseClient) return null;
    
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
    return data;
}

export async function createInitialProfile(email) {
    if(!supabaseClient) return;
    
    const { data } = await supabaseClient.from('profiles').select('email').eq('email', email).maybeSingle();
    if (!data) {
        const { error: insertError } = await supabaseClient
            .from('profiles')
            .insert([{ email, budget: 0, expenses: [], password: 'auth-managed' }]);
        
        if (insertError) {
            console.error("Error creando perfil:", insertError);
            throw new Error("No se pudo crear el perfil: " + insertError.message);
        }
    }
}

export async function signIn(email, password) {
    if(!supabaseClient) throw new Error("Offline mode");
    console.log("🔑 Intentando login con:", email);
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    console.log("📬 Resultado Login:", result);
    return result;
}

export async function signUp(email, password) {
    if(!supabaseClient) throw new Error("Offline mode");
    return await supabaseClient.auth.signUp({ 
        email, 
        password,
        options: { emailRedirectTo: window.location.origin }
    });
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
    window.location.reload(); 
}

export async function saveData() {
    const { currentUser, budget, expenses } = AppState;
    if (!currentUser) return false;
    
    // Sync object (reference update)
    currentUser.budget = budget;
    currentUser.expenses = expenses;
    
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ budget, expenses })
                .eq('email', currentUser.email);
            
            if (error) throw error;
        } else {
            // MOdo Local (Legacy/Fallback)
            localStorage.setItem(`foresight_user_${currentUser.email}`, JSON.stringify(currentUser));
            await new Promise(r => setTimeout(r, 500));
        }
        return true; 
    } catch (err) {
        console.error("Error al guardar:", err);
        showNotification("Error al sincronizar con la nube.", 'error');
        return false; 
    }
}