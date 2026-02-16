import { AppState, setState, setCurrentUser } from './state.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';
import { showNotification, runAsyncAction } from './utils.js';

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
window.downloadReport = async function() {
    await UI.downloadReport();
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
    
    Auth.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
             if (session && session.user) {
                if (!AppState.currentUser) {
                    try {
                        const profile = await Auth.loadProfileFromSupabase(session.user.email);
                        if(profile) {
                            loginSuccess({ ...profile, password: '' }); 
                        } else {
                            // Intentar obtener nombre y apellido de metadatos del usuario
                            const firstName = session.user.user_metadata?.first_name || '';
                            const lastName = session.user.user_metadata?.last_name || '';
                            await Auth.createInitialProfile(session.user.email, firstName, lastName);
                            const retry = await Auth.loadProfileFromSupabase(session.user.email);
                            if(retry) {
                                loginSuccess({ ...retry, password: '' });
                            } else {
                                showNotification("Error: No se puede cargar el perfil.", 'error');
                            }
                        }
                    } catch(e) { 
                        showNotification("Error de conexión.", 'error'); 
                    }
                }
             }
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
    if (auth.toggleBtn) {
        auth.toggleBtn.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
               auth.submitBtn.textContent = "Iniciar Sesión";
               auth.toggleBtn.innerHTML = '¿No tienes cuenta? <span class="text-blue-600">Regístrate aquí</span>';
               if(nameFieldsContainer) {
                   nameFieldsContainer.style.display = 'none';
                   if(firstNameField) firstNameField.required = false;
                   if(lastNameField) lastNameField.required = false;
               }
            } else {
               auth.submitBtn.textContent = "Crear Cuenta";
               auth.toggleBtn.innerHTML = '¿Ya tienes cuenta? <span class="text-blue-600">Inicia sesión</span>';
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
        auth.resendBtn.addEventListener('click', async () => {
            const email = auth.email.value.trim();
            if(!email) { return showNotification("Ingresa tu correo primero", 'error'); }
            
            if(Auth.supabaseClient) {
               await runAsyncAction(auth.resendBtn, async () => {
                   const { error } = await Auth.resendInvite(email);
                   if(error) {
                       showNotification("Error al reenviar. Intenta de nuevo.", 'error');
                       throw error;
                   }
                   showNotification("✅ Correo reenviado. Revisa tu bandeja de entrada y spam.", 'success');
               }, "Reenviando...");
            } else {
                showNotification("Error de conexión. Recarga la página.", 'error');
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
                        if(auth.resendBtn) auth.resendBtn.classList.remove('hidden-view');
                        isLoginMode = true;
                        auth.submitBtn.textContent = "Iniciar Sesión";
                        auth.toggleBtn.innerHTML = '¿No tienes cuenta? <span class="text-blue-600">Regístrate aquí</span>';
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
            setState({ budget: val });
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
        budget: userData.budget, 
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
    
    if(UI.DOM.budgetInput) {
        UI.DOM.budgetInput.value = userData.budget || '';
    }
    
    UI.initCategoryGrid();
    UI.updateUI();
}

function handleAuthError(err, authDOM) {
    let msg = err.message || "Error desconocido";
    
    // Mensajes más claros para usuarios finales
    if (msg.includes("security purposes") || msg.includes("rate limit")) {
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