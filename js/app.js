import { AppState, setState, setCurrentUser, setCurrentMonthBudget } from './state.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';
import { showNotification, runAsyncAction, formatMoney } from './utils.js';
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

// --- TAB BAR NAVIGATION ---
window.switchTab = function(tab) {
    const tabs = ['home', 'movements', 'stats', 'profile'];
    const contentIds = ['tab-home-content', 'tab-movements-content', 'tab-stats-content', 'tab-profile-content'];
    
    tabs.forEach((t, i) => {
        const btn = document.getElementById(`tab-${t}`);
        const content = document.getElementById(contentIds[i]);
        
        if (t === tab) {
            btn.classList.add('active-tab');
            btn.classList.remove('text-gray-400', 'dark:text-gray-500');
            btn.classList.add('text-blue-600', 'dark:text-blue-400');
            content.classList.remove('hidden');
        } else {
            btn.classList.remove('active-tab');
            btn.classList.remove('text-blue-600', 'dark:text-blue-400');
            btn.classList.add('text-gray-400', 'dark:text-gray-500');
            content.classList.add('hidden');
        }
    });

    if (tab === 'stats') updateStatsTab();
    if (tab === 'profile') updateProfileTab();
};

function updateProfileTab() {
    const avatar = document.getElementById('profile-avatar-letter');
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const darkIcon = document.getElementById('profile-dark-icon');
    
    if (nameEl && AppState.currentUser) {
        const firstName = AppState.currentUser.firstName || AppState.currentUser.email?.charAt(0).toUpperCase() || 'U';
        const lastName = AppState.currentUser.lastName || '';
        nameEl.textContent = `${firstName} ${lastName}`.trim();
        if (avatar) avatar.textContent = firstName.charAt(0).toUpperCase();
        if (emailEl) emailEl.textContent = AppState.currentUser.email || '';
    }
    if (darkIcon) {
        const isDark = document.documentElement.classList.contains('dark');
        darkIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
}

function getMonthlyData() {
    const data = AppState.expenses || [];
    const year = AppState.currentViewDate.getFullYear();
    const month = AppState.currentViewDate.getMonth();
    return data.filter(i => {
        const d = new Date(i.date);
        return d.getFullYear() === year && d.getMonth() === month;
    });
}

// === STATS TAB STATE ===
let statsState = {
    mode: 'month',           // 'month' | 'range'
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    fromDate: null,
    toDate: null,
};

function updateStatsTab() {
    const totalEl = document.getElementById('tab-stats-total');
    const incomeEl = document.getElementById('tab-stats-income');
    const expenseEl = document.getElementById('tab-stats-expense');
    const countEl = document.getElementById('tab-stats-count');
    if (!totalEl) return;

    const filtered = getStatsFilteredData();
    const totalIncome = filtered.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
    const totalExpense = filtered.filter(i => i.type === 'expense' || !i.type).reduce((s, i) => s + i.amount, 0);

    incomeEl.textContent = formatMoney(totalIncome);
    expenseEl.textContent = formatMoney(totalExpense);
    totalEl.textContent = formatMoney(totalIncome - totalExpense);
    totalEl.className = (totalIncome - totalExpense) >= 0
        ? 'text-white text-3xl font-black'
        : 'text-red-200 text-3xl font-black';
    if (countEl) countEl.textContent = filtered.length;

    // Period label
    const label = document.getElementById('stats-period-label');
    if (label) {
        if (statsState.mode === 'month') {
            const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            label.textContent = `${months[statsState.month]} ${statsState.year}`;
        } else if (statsState.fromDate && statsState.toDate) {
            label.textContent = `${statsState.fromDate} → ${statsState.toDate}`;
        }
    }

    // Sync selectors
    document.getElementById('stats-month-select').value = statsState.month;
    const yearSel = document.getElementById('stats-year-select');
    if (yearSel) yearSel.value = statsState.year;

    // Extra indicators
    updateStatsIndicators(filtered);
    updateStatsTopCategories(filtered);
    updateStatsComparison(filtered);
}

function getStatsFilteredData() {
    const data = AppState.expenses || [];
    if (statsState.mode === 'range' && statsState.fromDate && statsState.toDate) {
        const from = new Date(statsState.fromDate);
        const to = new Date(statsState.toDate);
        to.setHours(23, 59, 59, 999);
        return data.filter(i => {
            const d = new Date(i.date);
            return d >= from && d <= to;
        });
    }
    // month mode
    return data.filter(i => {
        const d = new Date(i.date);
        return d.getFullYear() === statsState.year && d.getMonth() === statsState.month;
    });
}

function updateStatsIndicators(filtered) {
    const avgEl = document.getElementById('stats-avg-daily');
    const pctEl = document.getElementById('stats-business-pct');
    if (!avgEl) return;

    if (filtered.length === 0) {
        avgEl.textContent = '$0';
        if (pctEl) pctEl.textContent = '0%';
        return;
    }

    // Average daily balance
    const dates = [...new Set(filtered.map(i => i.date))].sort();
    const dayCount = dates.length || 1;
    const totalExpense = filtered.filter(i => i.type === 'expense' || !i.type).reduce((s, i) => s + i.amount, 0);
    avgEl.textContent = formatMoney(totalExpense / dayCount);

    // Business vs Personal
    if (pctEl) {
        const totalExpenseItems = filtered.filter(i => i.type === 'expense' || !i.type);
        const businessExpense = totalExpenseItems.filter(i => i.businessType === 'business' || !i.businessType).reduce((s, i) => s + i.amount, 0);
        const allExpense = totalExpenseItems.reduce((s, i) => s + i.amount, 0);
        const pct = allExpense > 0 ? (businessExpense / allExpense) * 100 : 0;
        pctEl.textContent = `${pct.toFixed(0)}%`;
    }
}

function updateStatsTopCategories(filtered) {
    const container = document.getElementById('stats-top-categories');
    if (!container) return;

    const expenses = filtered.filter(i => i.type === 'expense' || !i.type);
    if (expenses.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-gray-400 font-bold text-center py-2">Sin datos</p>';
        return;
    }

    // Group by category
    const catMap = {};
    expenses.forEach(i => {
        const cat = i.category || 'Otros';
        catMap[cat] = (catMap[cat] || 0) + i.amount;
    });

    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const total = sorted.reduce((s, [, v]) => s + v, 0);

    container.innerHTML = sorted.map(([cat, amount]) => {
        const pct = total > 0 ? (amount / total) * 100 : 0;
        return `
        <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold text-gray-600 dark:text-gray-300 w-20 truncate">${cat}</span>
            <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-blue-500 rounded-full" style="width:${pct}%"></div>
            </div>
            <span class="text-[9px] font-bold text-gray-400 w-12 text-right">${pct.toFixed(0)}%</span>
        </div>`;
    }).join('');
}

function updateStatsComparison(filtered) {
    const incomeEl = document.getElementById('stats-vs-income');
    const expenseEl = document.getElementById('stats-vs-expense');
    if (!incomeEl) return;

    const currentIncome = filtered.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
    const currentExpense = filtered.filter(i => i.type === 'expense' || !i.type).reduce((s, i) => s + i.amount, 0);

    // Get previous period data
    const prevData = getPreviousPeriodData();
    const prevIncome = prevData.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
    const prevExpense = prevData.filter(i => i.type === 'expense' || !i.type).reduce((s, i) => s + i.amount, 0);

    incomeEl.textContent = prevIncome > 0 ? `${(((currentIncome - prevIncome) / prevIncome) * 100).toFixed(1)}%` : 'N/A';
    incomeEl.className = prevIncome > 0
        ? (currentIncome >= prevIncome ? 'text-sm font-black text-green-600 dark:text-green-400' : 'text-sm font-black text-red-600 dark:text-red-400')
        : 'text-sm font-black text-gray-400';

    expenseEl.textContent = prevExpense > 0 ? `${(((currentExpense - prevExpense) / prevExpense) * 100).toFixed(1)}%` : 'N/A';
    expenseEl.className = prevExpense > 0
        ? (currentExpense <= prevExpense ? 'text-sm font-black text-green-600 dark:text-green-400' : 'text-sm font-black text-red-600 dark:text-red-400')
        : 'text-sm font-black text-gray-400';
}

function getPreviousPeriodData() {
    const data = AppState.expenses || [];
    if (statsState.mode === 'range' && statsState.fromDate && statsState.toDate) {
        const from = new Date(statsState.fromDate);
        const to = new Date(statsState.toDate);
        const diffMs = to.getTime() - from.getTime();
        const prevTo = new Date(from.getTime() - 1);
        const prevFrom = new Date(prevTo.getTime() - diffMs);
        return data.filter(i => {
            const d = new Date(i.date);
            return d >= prevFrom && d <= prevTo;
        });
    }
    // month mode: same month previous year
    const prevYear = statsState.year - 1;
    return data.filter(i => {
        const d = new Date(i.date);
        return d.getFullYear() === prevYear && d.getMonth() === statsState.month;
    });
}

// --- STATS UI CONTROLS ---
window.setStatsMode = function(mode) {
    statsState.mode = mode;
    document.getElementById('stats-mode-month').className = mode === 'month'
        ? 'flex-1 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500 text-white shadow-sm transition-all'
        : 'flex-1 py-1.5 rounded-lg text-[10px] font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-all';
    document.getElementById('stats-mode-range').className = mode === 'range'
        ? 'flex-1 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500 text-white shadow-sm transition-all'
        : 'flex-1 py-1.5 rounded-lg text-[10px] font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-all';
    document.getElementById('stats-month-filters').classList.toggle('hidden', mode !== 'month');
    document.getElementById('stats-range-filters').classList.toggle('hidden', mode !== 'range');
    if (mode === 'range') {
        const now = new Date();
        document.getElementById('stats-date-from').value = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}-01`;
        document.getElementById('stats-date-to').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }
    applyStatsFilter();
};

window.statsChangeMonth = function(step) {
    statsState.month += step;
    if (statsState.month < 0) { statsState.month = 11; statsState.year--; }
    if (statsState.month > 11) { statsState.month = 0; statsState.year++; }
    document.getElementById('stats-month-select').value = statsState.month;
    document.getElementById('stats-year-select').value = statsState.year;
    applyStatsFilter();
};

window.applyStatsFilter = function() {
    if (statsState.mode === 'month') {
        statsState.month = parseInt(document.getElementById('stats-month-select').value);
        statsState.year = parseInt(document.getElementById('stats-year-select').value);
    } else {
        statsState.fromDate = document.getElementById('stats-date-from').value;
        statsState.toDate = document.getElementById('stats-date-to').value;
        if (!statsState.fromDate || !statsState.toDate) {
            showNotification('Selecciona ambas fechas', 'error');
            return;
        }
        if (statsState.fromDate > statsState.toDate) {
            showNotification('La fecha "desde" debe ser anterior', 'error');
            return;
        }
    }
    updateStatsTab();
};

window.downloadStatsReport = async function() {
    const filtered = getStatsFilteredData();
    if (filtered.length === 0) {
        showNotification('No hay datos en este período', 'error');
        return;
    }
    
    // Reuse report modal logic to generate PDF
    const { generatePDFReport } = await import('./pdf-generator.js');
    const label = statsState.mode === 'month'
        ? `Estadísticas-${statsState.month+1}-${statsState.year}`
        : `Estadísticas-${statsState.fromDate}-a-${statsState.toDate}`;
    
    showNotification('📄 Generando reporte de estadísticas...', 'success');

    try {
        const pdfResult = await generatePDFReport(filtered, AppState.currentViewDate, label);
        if (pdfResult) {
            const { doc } = pdfResult;
            const fileName = `Reporte-${label}.pdf`;
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (isMobile) {
                window.open(doc.output('bloburl'), '_blank');
            } else {
                doc.save(fileName);
            }
            showNotification('✅ Reporte descargado', 'success');
            return;
        }
    } catch (e) {
        console.error('PDF error:', e);
    }
    
    // Fallback text report
    const totalIncome = filtered.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
    const totalExpense = filtered.filter(i => i.type === 'expense' || !i.type).reduce((s, i) => s + i.amount, 0);
    
    let report = `REPORTE DE ESTADÍSTICAS - ${label}\n${'='.repeat(50)}\n\n`;
    report += `Período: ${document.getElementById('stats-period-label').textContent}\n\n`;
    report += `RESUMEN:\n`;
    report += `  Saldo Final: ${formatMoney(totalIncome - totalExpense)}\n`;
    report += `  Ingresos:    ${formatMoney(totalIncome)}\n`;
    report += `  Gastos:      ${formatMoney(totalExpense)}\n`;
    report += `  Movimientos: ${filtered.length}\n`;
    report += `  Promedio diario: ${formatMoney(totalExpense / (filtered.length || 1))}\n\n`;
    report += `DETALLE:\n${'-'.repeat(50)}\n`;
    filtered.forEach(item => {
        const type = item.type === 'income' ? 'INGRESO' : 'GASTO';
        report += `${item.date} | ${type} | ${formatMoney(item.amount)} | ${item.category || '—'} | ${item.concept || '—'}\n`;
    });
    report += `\n${'-'.repeat(50)}\n`;
    report += `Generado: ${new Date().toLocaleString('es-ES')}\n`;
    report += `Foresight Finanzas\n`;
    
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-${label}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('📄 Reporte de texto descargado', 'success');
};

function initStatsSelectors() {
    const yearSel = document.getElementById('stats-year-select');
    if (!yearSel) return;
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        yearSel.appendChild(opt);
    }
    statsState.month = new Date().getMonth();
    statsState.year = currentYear;
    document.getElementById('stats-month-select').value = statsState.month;
    yearSel.value = statsState.year;
}

// Initialize stats selectors after DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStatsSelectors);
} else {
    initStatsSelectors();
}

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

// --- DARK MODE ---
function applyDarkMode(isDark) {
    const html = document.documentElement;
    const loginIcon = document.getElementById('dark-icon-login');
    const appIcon = document.getElementById('dark-icon-app');
    const profileIcon = document.getElementById('profile-dark-icon');

    if (isDark) {
        html.classList.add('dark');
        if (loginIcon) { loginIcon.className = 'fa-solid fa-sun'; }
        if (appIcon) { appIcon.className = 'fa-solid fa-sun'; }
        if (profileIcon) { profileIcon.className = 'fa-solid fa-sun'; }
    } else {
        html.classList.remove('dark');
        if (loginIcon) { loginIcon.className = 'fa-solid fa-moon'; }
        if (appIcon) { appIcon.className = 'fa-solid fa-moon'; }
        if (profileIcon) { profileIcon.className = 'fa-solid fa-moon'; }
    }
    localStorage.setItem('darkMode', isDark ? 'true' : 'false');
}

window.toggleDarkMode = function() {
    const html = document.documentElement;
    const isDark = !html.classList.contains('dark');
    applyDarkMode(isDark);
};

// Initialize dark mode from localStorage on load
(function initDarkMode() {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') {
        applyDarkMode(true);
    } else if (saved === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // Auto-detect system preference on first visit
        applyDarkMode(true);
    }
})();