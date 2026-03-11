import { AppState, setState, setCurrentUser, setCurrentMonthBudget } from './state.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';
import { showNotification, runAsyncAction } from './utils.js';
import { startOnboarding, resetOnboarding } from './onboarding.js';

function showView(viewId) {
    const views = ['login-view', 'app-view'];
    views.forEach(id => {
        const view = document.getElementById(id);
        if (view) view.classList.add('hidden-view');
    });
    
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.remove('hidden-view');
}

// --- EXPOSE GLOBALS FOR HTML ---
window.logout = Auth.logout;
window.changeMonth = UI.changeMonth;
window.filterTransactions = UI.filterTransactions;
window.openAddModal = UI.openAddModal;
window.editTransaction = UI.editTransaction;
window.selectCategory = UI.selectCategory;
window.setTransactionType = UI.setTransactionType;
window.setBusinessType = UI.setBusinessType;
window.toggleModal = UI.toggleModal;
window.deleteTransaction = UI.deleteTransaction;
window.toggleDeleteModal = UI.toggleDeleteModal;
window.toggleReportModal = UI.toggleReportModal;
window.toggleSummary = UI.toggleSummary;
window.openReportModal = UI.openReportModal;
window.downloadReport = async function(type) {
    await UI.downloadReport(type);
};
window.showTutorial = () => {
    resetOnboarding();
    setTimeout(() => startOnboarding(), 100);
};

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


document.addEventListener('DOMContentLoaded', async () => {
    await Auth.initSupabase();

    const authCheckInterval = setInterval(() => {
        if (Auth.supabaseClient) {
            clearInterval(authCheckInterval);
            setupAuthObserver();
        } else {
            Auth.initSupabase();
        }
    }, 500);

    setupEventListeners();
});

function setupAuthObserver() {
    if(!Auth.supabaseClient) return;
    
    // Fallback: Si después de 2 segundos ninguna vista está visible, mostrar login
    setTimeout(() => {
        const loginView = document.getElementById('login-view');
        const appView = document.getElementById('app-view');
        if (loginView && appView && 
            loginView.classList.contains('hidden-view') && 
            appView.classList.contains('hidden-view')) {
            showView('login-view');
        }
    }, 2000);
    
    Auth.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
             if (session && session.user) {
                if (!AppState.currentUser) {
                    try {
                        let profile = await Auth.loadProfileFromSupabase(session.user.email);
                        if(profile) {
                            loginSuccess({ ...profile, password: '' }); 
                        } else {
                            // Intentar obtener nombre y apellido de metadatos del usuario o del sessionStorage si acaba de confirmar
                            const firstName = session.user.user_metadata?.first_name || sessionStorage.getItem('temp_first_name') || '';
                            const lastName = session.user.user_metadata?.last_name || sessionStorage.getItem('temp_last_name') || '';
                            
                            await Auth.createInitialProfile(session.user.email, firstName, lastName);
                            const retry = await Auth.loadProfileFromSupabase(session.user.email);
                            
                            // Limpiar variables temporales si existen
                            sessionStorage.removeItem('temp_first_name');
                            sessionStorage.removeItem('temp_last_name');
                            
                            if(retry) {
                                loginSuccess({ ...retry, password: '' });
                            } else {
                                showNotification("Error: No se puede cargar el perfil.", 'error');
                                showView('login-view');
                            }
                        }
                    } catch(e) { 
                        showNotification("Error de conexión.", 'error');
                        showView('login-view');
                    }
                }
             } else {
                // Session es null pero el evento es INITIAL_SESSION - no hay sesión
                showView('login-view');
             }
        } else if (event === 'SIGNED_OUT') {
            // Usuario cerró sesión
            showView('login-view');
        }
    });
}

function setupEventListeners() {
    const { auth, budgetInput } = UI.DOM;

    // Login Toggle
    let isLoginMode = true;
    const nameFieldsContainer = document.getElementById('name-fields');
    const firstNameField = document.getElementById('auth-firstname');
    const lastNameField = document.getElementById('auth-lastname');
    
    // Toggle para ver/ocultar contraseña
    const togglePasswordBtn = document.getElementById('toggle-password');
    const togglePasswordIcon = document.getElementById('toggle-password-icon');
    if (togglePasswordBtn && auth.pass) {
        const togglePassword = (e) => {
            if (e) e.preventDefault();
            const isPassword = auth.pass.type === 'password';
            auth.pass.type = isPassword ? 'text' : 'password';
            togglePasswordIcon.className = isPassword ? 'fa-solid fa-eye text-blue-600 text-lg' : 'fa-solid fa-eye-slash text-lg';
        };
        togglePasswordBtn.addEventListener('click', togglePassword);
        togglePasswordBtn.addEventListener('touchstart', togglePassword, { passive: false });
    }

    if (auth.toggleBtn) {
        auth.toggleBtn.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            const toggleText = document.getElementById('auth-toggle-text');
            const toggleBtn = document.getElementById('btn-auth-toggle');
            const forgotPass = document.getElementById('btn-forgot-password');
            const reqText = document.getElementById('password-requirements');

            if (isLoginMode) {
               auth.submitBtn.textContent = "Iniciar Sesión";
               if(toggleText) toggleText.textContent = '¿No tienes cuenta?';
               if(toggleBtn) toggleBtn.textContent = 'Regístrate';
               if(forgotPass) forgotPass.style.display = 'block';
               if(reqText) reqText.classList.add('hidden-view');
               
               if(nameFieldsContainer) {
                   nameFieldsContainer.style.display = 'none';
                   if(firstNameField) firstNameField.required = false;
                   if(lastNameField) lastNameField.required = false;
               }
            } else {
               auth.submitBtn.textContent = "Crear Cuenta";
               if(toggleText) toggleText.textContent = '¿Ya tienes cuenta?';
               if(toggleBtn) toggleBtn.textContent = 'Inicia sesión';
               if(forgotPass) forgotPass.style.display = 'none';
               if(reqText) reqText.classList.remove('hidden-view');

               if(nameFieldsContainer) {
                   nameFieldsContainer.style.display = 'grid';
                   if(firstNameField) firstNameField.required = true;
                   if(lastNameField) lastNameField.required = true;
               }
            }
        });
    }

    // Resend Verify
    if (auth.resendBtn) {
        let lastResend = 0;
        auth.resendBtn.addEventListener('click', async () => {
            const now = Date.now();
            if (now - lastResend < 60000) {
                return showNotification("Por favor espera 1 minuto antes de volver a intentar.", 'error');
            }

            const email = auth.email.value.trim();
            if(!email) { return showNotification("Ingresa tu correo primero", 'error'); }
            
            if(Auth.supabaseClient) {
               await runAsyncAction(auth.resendBtn, async () => {
                   const { error } = await Auth.resendInvite(email);
                   if(error) {
                       if(error.message.includes('rate limit')) {
                           showNotification("Límite de envíos alcanzado. Intenta de nuevo en unos minutos.", 'error');
                       } else {
                           showNotification("Error al reenviar: " + error.message, 'error');
                       }
                       throw error;
                   }
                   lastResend = Date.now();
                   showNotification("✅ Correo reenviado. Revisa tu bandeja de entrada y spam.", 'success');
               }, "Reenviando...");
            } else {
                showNotification("Error de conexión. Recarga la página.", 'error');
            }
        });
    }

    // Olvidé mi contraseña
    const forgotPassBtn = document.getElementById('btn-forgot-password');
    if (forgotPassBtn) {
        forgotPassBtn.addEventListener('click', async () => {
            const email = auth.email.value.trim();
            if(!email) {
                return showNotification("⚠️ Ingresa tu correo primero en el campo de Email para recuperar tu contraseña.", 'error');
            }
            if(Auth.supabaseClient) {
                await runAsyncAction(forgotPassBtn, async () => {
                    const { error } = await Auth.supabaseClient.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin
                    });
                    if(error) throw error;
                    showNotification("✅ Se ha enviado un enlace a tu correo para restablecer la contraseña.", 'success');
                }, "Enviando...");
            }
        });
    }

    auth.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = auth.email.value.trim();
        const pass = auth.pass.value.trim();
        const firstName = firstNameField ? firstNameField.value.trim() : '';
        const lastName = lastNameField ? lastNameField.value.trim() : '';

        if(!email || !pass) {
            return showNotification("Completa todos los campos", 'error');
        }
        
        if(!isLoginMode && (!firstName || !lastName)) {
            return showNotification("Ingresa tu nombre y apellido", 'error');
        }

        // Validación de contraseña segura (Solo en registro)
        if (!isLoginMode) {
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]{8,}$/;
            if (!passwordRegex.test(pass)) {
                return showNotification("La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y un carácter especial", 'error');
            }
        }

        if (Auth.supabaseClient) {
            if(auth.resendBtn) auth.resendBtn.classList.add('hidden-view');
            
            const btn = auth.submitBtn;
            const oldText = btn.innerHTML;
            btn.textContent = isLoginMode ? "Verificando..." : "Registrando...";
            btn.disabled = true;

            try {
                if (isLoginMode) {
                    const { data, error } = await Auth.signIn(email, pass);
                    if (error) throw error;
                    
                    if (data && data.user) {
                        const profile = await Auth.loadProfileFromSupabase(email);
                        if(profile) {
                            loginSuccess({ ...profile, password: '' });
                        } else {
                            showNotification("Error cargando perfil.", 'error');
                        }
                    } else {
                        showNotification("Error en respuesta del servidor.", 'error');
                    }
                } else {
                    const { data, error } = await Auth.signUp(email, pass, firstName, lastName);
                    if (error) throw error;

                    if (data.user && !data.session) {
                        // Requiere confirmación por correo
                        showNotification("📧 Cuenta creada. Revisa tu correo (y spam) para confirmar.", 'success');
                        if(firstNameField) firstNameField.value = '';
                        if(lastNameField) lastNameField.value = '';
                        auth.pass.value = '';
                        if(auth.resendBtn) auth.resendBtn.classList.remove('hidden-view');
                        isLoginMode = true;
                        
                        // Retornar la interfaz a modo inicio de sesión
                        auth.submitBtn.textContent = "Iniciar Sesión";
                        const toggleText = document.getElementById('auth-toggle-text');
                        const toggleBtn = document.getElementById('btn-auth-toggle');
                        const forgotPass = document.getElementById('btn-forgot-password');
                        const reqText = document.getElementById('password-requirements');
                        
                        // Guardar nombre y apellido temporalmente en sessionStorage para usarlos al confirmar
                        sessionStorage.setItem('temp_first_name', firstName);
                        sessionStorage.setItem('temp_last_name', lastName);
                        
                        if(toggleText) toggleText.textContent = '¿No tienes cuenta?';
                        if(toggleBtn) toggleBtn.textContent = 'Regístrate';
                        if(forgotPass) forgotPass.style.display = 'block';
                        if(reqText) reqText.classList.add('hidden-view');
                        if(nameFieldsContainer) nameFieldsContainer.style.display = 'none';
                        return;
                    }
                    if (data.user && data.session) {
                        // Login automático (confirmación desactivada)
                        await Auth.createInitialProfile(email, firstName, lastName);
                        const profile = await Auth.loadProfileFromSupabase(email);
                        if (profile) {
                            showNotification("✅ Cuenta creada exitosamente. ¡Bienvenido!", 'success');
                            loginSuccess({ ...profile, password: '' });
                        }
                    }
                }
            } catch (err) {
                handleAuthError(err, auth);
            } finally {
                btn.innerHTML = oldText;
                btn.disabled = false;
            }
        } else {
            showNotification("Error de conexión. Intenta recargar la página.", 'error');
        }
    });

    // Budget Change
    if(budgetInput) {
        budgetInput.addEventListener('change', async (e) => {
            const val = parseFloat(e.target.value) || 0;
            setCurrentMonthBudget(val);
            e.target.classList.add('bg-blue-100');
            await Auth.saveData();
            e.target.classList.remove('bg-blue-100');
            UI.updateUI();
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
                const businessType = document.getElementById('business-type').value || 'business';
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
                        businessType,
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
    setCurrentUser(userData);
    setState({ 
        budgets: userData.budgets || {}, 
        expenses: userData.expenses || [] 
    });
    
    if(UI.DOM.views.login && UI.DOM.views.app) {
        showView('app-view');
    } else {
        return;
    }

    if(UI.DOM.userDisplay) {
        let displayName = userData.email.split('@')[0];
        if(userData.firstName && userData.lastName) {
            displayName = `${userData.firstName} ${userData.lastName}`;
        } else if(userData.firstName) {
            displayName = userData.firstName;
        }
        UI.DOM.userDisplay.textContent = displayName;
    }
    
    UI.initCategoryGrid();
    UI.updateUI();
    
    // Mostrar tutorial si es primera vez
    setTimeout(() => startOnboarding(), 800);
}

function handleAuthError(err, authDOM) {
    let msg = err.message || "Error desconocido";
    
    // Manejo automático y transparente de errores de sesión
    if (msg.includes("LockManager") || msg.includes("timed out waiting") || msg.includes("this.lock")) {
        // Limpiar storage automáticamente
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.includes('auth-token') || key.includes('supabase'))) {
                    localStorage.removeItem(key);
                }
            }
        } catch (e) {
            console.error('[AUTH] Error limpiando:', e);
        }
        // Recargar sin mostrar mensaje al usuario
        setTimeout(() => window.location.reload(), 300);
        return;
    } else if (msg.includes("security purposes") || msg.includes("rate limit")) {
        msg = "⏰ Demasiados intentos. Espera 1 minuto e intenta nuevamente.";
    } else if (msg.includes("Invalid login") || msg.includes("Invalid credentials")) {
        msg = "❌ Correo o contraseña incorrectos. Verifica tus datos.";
        if(authDOM.resendBtn) authDOM.resendBtn.classList.remove('hidden-view');
    } else if (msg.includes("already registered") || msg.includes("User already exists")) {
        msg = "📧 Este correo ya tiene una cuenta. Intenta iniciar sesión.";
    } else if (msg.includes("Email not confirmed")) {
        msg = "📬 Debes confirmar tu correo antes de acceder. Revisa tu bandeja de entrada.";
        if(authDOM.resendBtn) authDOM.resendBtn.classList.remove('hidden-view');
    } else if (msg.includes("User not found")) {
        msg = "👤 No existe una cuenta con este correo. ¿Quieres registrarte?";
    } else if (msg.includes("Password")) {
        msg = "🔒 La contraseña debe tener al menos 6 caracteres.";
    } else if (msg.includes("network") || msg.includes("fetch")) {
        msg = "🌐 Error de conexión. Verifica tu internet e intenta nuevamente.";
    } else if (msg.includes("Offline mode")) {
        msg = "💻 Estás en modo demo. Crea una cuenta local para continuar.";
    }
    
    showNotification(msg, 'error');
}