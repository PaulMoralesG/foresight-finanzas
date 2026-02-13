import { AppState, setState, setCurrentUser } from './state.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';
import { showNotification, runAsyncAction } from './utils.js';
import { getEmailJSConfig } from './config-loader.js';

// --- EXPOSE GLOBALS FOR HTML ---
window.toggleSummary = UI.toggleSummary;
window.logout = Auth.logout;
window.changeMonth = UI.changeMonth;
window.filterTransactions = UI.filterTransactions;
window.openAddModal = UI.openAddModal;
window.editTransaction = UI.editTransaction; 
window.deleteTransaction = UI.deleteTransaction;
window.toggleModal = UI.toggleModal;
window.sendAlertEmail = UI.sendAlertEmail;
window.setTransactionType = UI.setTransactionType;
window.selectCategory = UI.selectCategory;
window.toggleDeleteModal = UI.toggleDeleteModal; // Explicitly add this line

window.executeDelete = async function() {
    const id = parseInt(UI.DOM.editingIdInput.value);
    if(!id) return;
    
    const btn = document.getElementById('btn-confirm-delete');

    await runAsyncAction(btn, async () => {
        const originalList = [...AppState.expenses];
        // Remove locally
        const newExpenses = AppState.expenses.filter(i => i.id !== id);
        setState({ expenses: newExpenses });
        
        const success = await Auth.saveData();
        
        if(success) {
            UI.toggleDeleteModal(false);
            UI.toggleModal(false); 
            UI.updateUI();
        } else {
            setState({ expenses: originalList });
        }
    }, "Borrando...");
};


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 App iniciando...");
    
    // 0. Init EmailJS
    try {
        const emailConfig = await getEmailJSConfig();
        if(window.emailjs && emailConfig.EMAILJS_PUBLIC_KEY !== "DEMO_KEY") {
            window.emailjs.init(emailConfig.EMAILJS_PUBLIC_KEY);
            console.log("✅ EmailJS inicializado");
        } else {
            console.warn("⚠️ EmailJS en modo demo o no disponible");
        }
    } catch(e) { console.error("EmailJS Error:", e); }

    // 1. Init Supabase
    console.log("🔧 Intentando inicializar Supabase...");
    console.log("📍 window.supabase existe:", !!window.supabase);
    await Auth.initSupabase();
    console.log("📊 supabaseClient después de init:", !!Auth.supabaseClient);

    // Loop de seguridad para asegurar que Supabase arranque incluso si el script tarda
    const authCheckInterval = setInterval(() => {
        if (Auth.supabaseClient) {
            clearInterval(authCheckInterval);
            setupAuthObserver();
        } else {
            // Reintentar init si sigue null
            Auth.initSupabase();
        }
    }, 500);

    // 3. Setup Internal Listeners
    setupEventListeners();
});

function setupAuthObserver() {
    if(!Auth.supabaseClient) {
        console.warn("⚠️ setupAuthObserver llamado pero supabaseClient es null");
        return;
    }
    
    console.log("📡 ========== CONFIGURANDO AUTH OBSERVER ==========");
    console.log("✅ Conectando observadores de autenticación...");
    Auth.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log("🔔 ========== AUTH STATE CHANGE EVENT ==========");
        console.log("🔔 Event tipo:", event);
        console.log("🔔 Session existe:", !!session);
        console.log("🔔 User en session:", session?.user?.email);
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
             if (session && session.user) {
                if (!AppState.currentUser) {
                    try {
                        console.log("👤 Usuario detectado:", session.user.email);
                        const profile = await Auth.loadProfileFromSupabase(session.user.email);
                        if(profile) {
                            loginSuccess({ ...profile, password: '' }); 
                        } else {
                            console.error("❌ Perfil no devuelto por loadProfileFromSupabase");
                            showNotification("Error cargando perfil.", 'error');
                        }
                    } catch(e) { console.error("❌ Error cargando perfil:", e); }
                } else {
                    console.log("ℹ️ Usuario ya estaba en estado local.");
                }
             }
        } else if (event === 'SIGNED_OUT') {
             console.log("👋 Sesión cerrada.");
        }
    });
}

function setupEventListeners() {
    const { auth, budgetInput } = UI.DOM;

    // Login Toggle
    let isLoginMode = true;
    if (auth.toggleBtn) {
        auth.toggleBtn.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
               auth.submitBtn.textContent = "Iniciar Sesión";
               auth.toggleBtn.innerHTML = '¿No tienes cuenta? <span class="text-blue-600">Regístrate aquí</span>';
            } else {
               auth.submitBtn.textContent = "Crear Cuenta";
               auth.toggleBtn.innerHTML = '¿Ya tienes cuenta? <span class="text-blue-600">Inicia sesión</span>';
            }
        });
    }

    // Resend Verify
    if (auth.resendBtn) {
        auth.resendBtn.addEventListener('click', async () => {
            const email = auth.email.value.trim();
            if(!email) { return showNotification("Ingresa tu correo primero", 'error'); }
            
            if(Auth.supabaseClient) {
               await runAsyncAction(auth.resendBtn, async () => {
                   const { error } = await Auth.resendInvite(email);
                   if(error) throw error;
                   showNotification("Correo reenviado.", 'success');
                   auth.resendBtn.classList.add('hidden-view');
               }, "Reenviando...");
            }
        });
    }

    // Auth Submit
    auth.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("🔐 Form submit interceptado");
        const email = auth.email.value.trim();
        const pass = auth.pass.value.trim();
        console.log("📧 Email:", email);
        console.log("🔑 Password length:", pass.length);

        if(!email || !pass) {
            console.warn("⚠️ Campos vacíos detectados");
            return showNotification("Completa todos los campos", 'error');
        }

        // MODO NUBE
        console.log("☁️ Supabase Client existe:", !!Auth.supabaseClient);
        if (Auth.supabaseClient) {
            console.log("✅ Procesando con Supabase...");
            if(auth.resendBtn) auth.resendBtn.classList.add('hidden-view');
            
            const btn = auth.submitBtn;
            const oldText = btn.innerHTML;
            btn.textContent = isLoginMode ? "Verificando..." : "Registrando...";
            btn.disabled = true;

            try {
                if (isLoginMode) {
                    console.log("🔓 Modo LOGIN activado. Llamando a signIn...");
                    const { error } = await Auth.signIn(email, pass);
                    console.log("📡 Respuesta signIn - Error:", error);
                    if (error) throw error;
                    console.log("✅ Login exitoso. Cargando perfil...");
                    const profile = await Auth.loadProfileFromSupabase(email);
                    console.log("📦 Perfil recibido:", profile);
                    if(profile) {
                        console.log("🎯 Llamando a loginSuccess...");
                        loginSuccess({ ...profile, password: '' });
                    } else {
                        console.error("❌ Perfil es null/undefined");
                    }
                } else {
                    const { data, error } = await Auth.signUp(email, pass);
                    if (error) throw error;
                    
                    if (data.user && !data.session) {
                         showNotification("Revisa tu correo para confirmar.", 'success');
                         return; 
                    }
                    if (data.user) {
                       await Auth.createInitialProfile(email);
                       const profile = await Auth.loadProfileFromSupabase(email);
                       loginSuccess({ ...profile, password: '' });
                    }
                }
            } catch (err) {
                console.error(err);
                handleAuthError(err, auth);
            } finally {
                btn.innerHTML = oldText;
                btn.disabled = false;
            }
            return;
        }

        // MODO LOCAL
        const userKey = `foresight_user_${email}`;
        const stored = localStorage.getItem(userKey);

        if (isLoginMode) {
            if (stored) {
                const data = JSON.parse(stored);
                if (data.password === pass) loginSuccess(data);
                else showNotification('Contraseña incorrecta', 'error');
            } else {
                showNotification("Usuario no encontrado.", 'error');
            }
        } else {
            if (stored) {
                showNotification("Usuario ya existe.", 'error');
            } else {
                const newUser = { email, password: pass, budget: 0, expenses: [] };
                localStorage.setItem(userKey, JSON.stringify(newUser));
                loginSuccess(newUser);
            }
        }
    });

    // Budget Change
    if(budgetInput) {
        budgetInput.addEventListener('change', async (e) => {
            const val = parseFloat(e.target.value) || 0;
            setState({ budget: val });
            e.target.classList.add('bg-blue-100');
            await Auth.saveData();
            e.target.classList.remove('bg-blue-100');
            UI.updateUI(); // Refresh visual
        });
    }

    // Expense Form Submit
    const expenseForm = document.getElementById('expense-form');
    if(expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            
            await runAsyncAction(btnSubmit, async () => {
                const concept = document.getElementById('concept').value;
                const amount = parseFloat(document.getElementById('amount').value);
                const category = document.getElementById('selected-category').value;
                const dateVal = document.getElementById('date').value;
                const method = document.getElementById('method').value;
                const type = document.getElementById('transaction-type').value; 
                const editingId = UI.DOM.editingIdInput.value ? parseInt(UI.DOM.editingIdInput.value) : null;

                if (amount > 0) {
                    let finalDate = new Date();
                    if(dateVal) {
                        const [y, m, d] = dateVal.split('-').map(Number);
                        finalDate = new Date(y, m-1, d, 12, 0, 0); 
                    }

                    const transactionData = { 
                        id: editingId || Date.now(), 
                        concept: concept || (type === 'income' ? 'Ingreso' : 'Gasto'), 
                        amount, 
                        category,
                        method,
                        type,
                        date: finalDate.toISOString() 
                    };

                    const originalList = [...AppState.expenses]; 
                    let newList = [...AppState.expenses];

                    if (editingId) {
                        const index = newList.findIndex(i => i.id === editingId);
                        if(index !== -1) newList[index] = transactionData;
                    } else {
                        newList.push(transactionData);
                    }

                    setState({ expenses: newList });
                    
                    const success = await Auth.saveData();
                    
                    if (success) {
                        UI.toggleModal(false);
                        e.target.reset();
                        UI.setTransactionType('expense');
                        UI.updateUI();
                    } else {
                        setState({ expenses: originalList }); // Revert
                    }
                }
            }, "Guardando...");
        });
    }
}

function loginSuccess(userData) {
    console.log("🎉 ========== LOGIN SUCCESS EJECUTADO ==========");
    console.log("📦 userData recibido:", userData);
    console.log("📧 Email:", userData.email);
    console.log("💰 Budget:", userData.budget);
    console.log("📊 Expenses count:", userData.expenses?.length || 0);
    console.log("Cambiando de vista...");

    setCurrentUser(userData);
    setState({ 
        budget: userData.budget, 
        expenses: userData.expenses || [] 
    });
    
    // Verificamos si los elementos existen antes de actuar
    if(UI.DOM.views.login && UI.DOM.views.app) {
        UI.DOM.views.login.classList.add('hidden-view');
        UI.DOM.views.app.classList.remove('hidden-view');
        console.log("✅ Vistas actualizadas.");
    } else {
        console.error("❌ Error CRÍTICO: No se encontraron los elementos HTML de las vistas.");
        return;
    }

    if(UI.DOM.userDisplay) {
        UI.DOM.userDisplay.textContent = userData.email.split('@')[0];
    }
    
    if(UI.DOM.budgetInput) {
        UI.DOM.budgetInput.value = userData.budget || '';
    }
    
    console.log("Inicializando UI...");
    UI.initCategoryGrid();
    UI.updateUI();
    console.log("🚀 Aplicación lista.");
}

function handleAuthError(err, authDOM) {
    let msg = err.message;
    if (msg.includes("security purposes")) msg = "Espera unos segundos.";
    else if (msg.includes("Invalid login")) {
        msg = "Credenciales incorrectas.";
        if(authDOM.resendBtn) authDOM.resendBtn.classList.remove('hidden-view');
    }
    else if (msg.includes("already registered")) msg = "Correo ya registrado.";
    else if (msg.includes("rate limit")) msg = "Demasiados intentos.";
    else if (msg.includes("Email not confirmed")) {
        msg = "Correo no confirmado.";
        if(authDOM.resendBtn) authDOM.resendBtn.classList.remove('hidden-view');
    }
    showNotification(msg, 'error');
}