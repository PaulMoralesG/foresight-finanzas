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
        const config = await getSupabaseConfig();
        SUPABASE_URL = config.SUPABASE_URL;
        SUPABASE_KEY = config.SUPABASE_KEY;
    }

    if (window.supabase && SUPABASE_URL !== "https://demo.supabase.co") {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log("✅ Supabase cliente creado (Global UMD).");
        } catch (e) {
            console.error("❌ Error creando cliente Supabase:", e);
        }
    } else if (SUPABASE_URL === "https://demo.supabase.co") {
        console.log("🎭 Modo DEMO activado - funcionalidad limitada a interfaz");
        supabaseClient = null; // En modo demo no tenemos cliente real
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
    if(!supabaseClient) {
        // Modo local/demo - cargar desde localStorage
        console.log("🎭 Modo DEMO: Cargando perfil local");
        const userKey = `foresight_user_${email}`;
        const stored = localStorage.getItem(userKey);
        return stored ? JSON.parse(stored) : null;
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
    if(!supabaseClient) {
        // Modo local/demo - usar localStorage
        console.log("🎭 Modo DEMO: Usando almacenamiento local");
        const userKey = `foresight_user_${email}`;
        const stored = localStorage.getItem(userKey);
        
        if (stored) {
            const data = JSON.parse(stored);
            if (data.password === password) {
                return { data: { user: { email }, session: { user: { email } } }, error: null };
            } else {
                return { error: { message: "Invalid login credentials" } };
            }
        } else {
            return { error: { message: "User not found" } };
        }
    }
    
    console.log("🔑 Intentando login con:", email);
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    console.log("📬 Resultado Login:", result);
    return result;
}

export async function signUp(email, password) {
    if(!supabaseClient) {
        // Modo local/demo - crear usuario en localStorage
        console.log("🎭 Modo DEMO: Creando usuario local");
        const userKey = `foresight_user_${email}`;
        const stored = localStorage.getItem(userKey);
        
        if (stored) {
            return { error: { message: "User already exists" } };
        } else {
            const newUser = { email, password, budget: 0, expenses: [] };
            localStorage.setItem(userKey, JSON.stringify(newUser));
            return { data: { user: { email }, session: { user: { email } } }, error: null };
        }
    }
    
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