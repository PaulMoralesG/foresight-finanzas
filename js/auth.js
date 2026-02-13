import { AppState, setCurrentUser, setState } from './state.js';
import { showNotification } from './utils.js';
import { getSupabaseConfig } from './config-loader.js';

// Configuración dinámica: será cargada al inicializar
let SUPABASE_URL = null;
let SUPABASE_KEY = null;

// NOTA: Usamos window.supabase cargado desde el CDN en index.html
// Esto es más robusto contra inyecciones de extensiones (MetaMask, etc.)
export let supabaseClient = null;
export let isDemoMode = false;

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
            isDemoMode = false;
        } catch (e) {
            console.error("❌ Error creando cliente Supabase:", e);
        }
    } else if (SUPABASE_URL === "https://demo.supabase.co") {
        console.log("🎭 Modo DEMO activado - funcionalidad limitada a interfaz");
        console.log("📚 Perfecto para demostraciones universitarias");
        supabaseClient = null; // En modo demo no tenemos cliente real
        isDemoMode = true;
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
    if(!supabaseClient) {
        // Modo local/demo - crear perfil en localStorage
        console.log("🎭 Modo DEMO: Creando perfil inicial local");
        const userKey = `foresight_user_${email}`;
        const existing = localStorage.getItem(userKey);
        
        if (!existing) {
            const newProfile = { 
                email, 
                budget: 0, 
                expenses: [], 
                password: 'demo-managed',
                created_at: new Date().toISOString()
            };
            localStorage.setItem(userKey, JSON.stringify(newProfile));
            console.log("✅ Perfil demo creado para:", email);
        }
        return;
    }
    
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
        console.log("🎭 Modo DEMO: Creando usuario local para:", email);
        const userKey = `foresight_user_${email}`;
        const stored = localStorage.getItem(userKey);
        
        if (stored) {
            console.warn("⚠️ Usuario ya existe en localStorage");
            return { error: { message: "User already exists" } };
        } else {
            const newUser = { 
                email, 
                password, 
                budget: 1000, // Presupuesto inicial para demo
                expenses: [
                    // Algunos datos de ejemplo para que se vea mejor
                    {
                        id: Date.now(),
                        concept: "Café bienvenida",
                        amount: 5.50,
                        category: "comida",
                        method: "Efectivo",
                        type: "expense",
                        date: new Date().toISOString()
                    }
                ],
                created_at: new Date().toISOString()
            };
            localStorage.setItem(userKey, JSON.stringify(newUser));
            console.log("✅ Usuario demo creado exitosamente");
            return { 
                data: { 
                    user: { email }, 
                    session: { user: { email } } 
                }, 
                error: null 
            };
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