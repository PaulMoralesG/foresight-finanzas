import { AppState, setViewDate, setFilter } from './state.js';
import { formatMoney, showNotification, runAsyncAction } from './utils.js';
import { getCategories, getEmailJSConfig } from './config-loader.js';
import { saveData, logout } from './auth.js';

// Variables globales para configuración cargada dinámicamente
let EXPENSE_CATEGORIES = [];
let INCOME_CATEGORIES = [];
let getCategoryById = () => ({ label: 'Cargando...', icon: '⏳', color: 'bg-gray-100 text-gray-600' });
let EMAILJS_SERVICE_ID = "";
let EMAILJS_TEMPLATE_ID = "";

// Cargar configuración al inicializar el módulo
async function initConfig() {
    const categoriesConfig = await getCategories();
    const emailConfig = await getEmailJSConfig();
    
    EXPENSE_CATEGORIES = categoriesConfig.EXPENSE_CATEGORIES;
    INCOME_CATEGORIES = categoriesConfig.INCOME_CATEGORIES;
    getCategoryById = categoriesConfig.getCategoryById;
    EMAILJS_SERVICE_ID = emailConfig.EMAILJS_SERVICE_ID;
    EMAILJS_TEMPLATE_ID = emailConfig.EMAILJS_TEMPLATE_ID;
}

// Inicializar configuración inmediatamente
initConfig();

// DOM ELEMENTS GETTER
export const DOM = {
    get views() { 
        return { 
            login: document.getElementById('login-view'), 
            app: document.getElementById('app-view') 
        }; 
    },
    get auth() { 
        // ... (rest of auth)
        return { 
            form: document.getElementById('auth-form'), 
            email: document.getElementById('auth-email'), 
            pass: document.getElementById('auth-password'),
            submitBtn: document.getElementById('btn-auth-submit'),
            toggleBtn: document.getElementById('btn-auth-toggle'),
            resendBtn: document.getElementById('btn-resend-verify')
        };
    },
    get userDisplay() { return document.getElementById('user-display'); },
    get availableDisplay() { return document.getElementById('available-display'); },
    get dashIncome() { return document.getElementById('dash-income'); },
    get dashExpense() { return document.getElementById('dash-expense'); },
    get budgetBar() { return document.getElementById('budget-bar'); },
    get spentPercent() { return document.getElementById('spent-percent'); },
    get monthDisplay() { return document.getElementById('month-display'); },
    get countDisplay() { return document.getElementById('transaction-count'); },
    get budgetInput() { return document.getElementById('budget-input'); },
    get movementsList() { return document.getElementById('movements-list'); },
    get emptyState() { return document.getElementById('empty-state'); },
    get modal() { return document.getElementById('expense-modal'); },

    // Summary Object with children
    get summary() {
        return {
            modal: document.getElementById('summary-modal'),
            panel: document.getElementById('summary-panel'),
            total: document.getElementById('summary-total'),
            daily: document.getElementById('summary-daily'),
            proj: document.getElementById('summary-proj'),
            savings: document.getElementById('summary-savings'),
            savingsStatus: document.getElementById('savings-status'),
            savingsMsg: document.getElementById('savings-message')
        };
    },
    
    // Inputs del Modal
    get typeInput() { return document.getElementById('transaction-type'); },
    get amountInput() { return document.getElementById('amount'); },
    get conceptInput() { return document.getElementById('concept'); },
    get dateInput() { return document.getElementById('date'); },
    get methodInput() { return document.getElementById('method'); },
    get categoryGrid() { return document.getElementById('category-grid'); },
    
    // Botones especiales
    get btnTypeExpense() { return document.getElementById('btn-type-expense'); },
    get btnTypeIncome() { return document.getElementById('btn-type-income'); },
    get btnDelete() { return document.getElementById('btn-delete'); },
    
    // Inputs ocultos/estado
    get selectedCategoryInput() { return document.getElementById('selected-category'); },
    get editingIdInput() { return document.getElementById('editing-id'); }
};

// CORE LOGIC
export function getMonthlyData() {
    const viewMonth = AppState.currentViewDate.getMonth();
    const viewYear = AppState.currentViewDate.getFullYear();

    return AppState.expenses.filter(item => {
        const d = new Date(item.date);
        return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
    });
}

function calculateProjection(totalSpent) {
    const now = new Date();
    if(now.getMonth() !== AppState.currentViewDate.getMonth() || now.getFullYear() !== AppState.currentViewDate.getFullYear()) {
        return totalSpent; 
    }
    const day = Math.max(1, now.getDate());
    return (totalSpent / day) * 30; 
}

// UI UPDATES
export function updateUI() {
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    DOM.monthDisplay.textContent = `${monthNames[AppState.currentViewDate.getMonth()]} ${AppState.currentViewDate.getFullYear()}`;
    
    // Get Data
    const monthlyData = getMonthlyData();
    DOM.countDisplay.textContent = `${monthlyData.length} Reg.`;

    // Separar Gastos e Ingresos
    const incomeItems = monthlyData.filter(i => i.type === 'income');
    const expenseItems = monthlyData.filter(i => i.type === 'expense' || !i.type);

    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalSpent = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    
    const available = (AppState.budget + totalIncome) - totalSpent; 

    // Visuals
    DOM.availableDisplay.textContent = formatMoney(available);
    DOM.dashIncome.textContent = formatMoney(totalIncome);
    DOM.dashExpense.textContent = formatMoney(totalSpent);
    
    // Budget Bar Logic
    const totalCapacity = AppState.budget + totalIncome;
    let percent = 0;
    
    if (totalCapacity > 0) {
        percent = Math.min((totalSpent / totalCapacity) * 100, 100);
    } else if (totalSpent > 0) {
        percent = 100;
    }

    // Alertas específicas para estudiantes universitarios
    DOM.spentPercent.textContent = `${Math.round(percent)}%`;
    DOM.budgetBar.style.width = `${percent}%`;
    
    DOM.budgetBar.className = 'h-full rounded-full transition-all duration-1000 ease-out';
    if(percent > 100) {
            DOM.budgetBar.classList.add('bg-red-500');
            showStudentAlert(`😨 ¡Te quedaste sin dinero! Revisa tus gastos estudiantiles.`, 'error', false);
    } else if (percent > 85) {
        DOM.budgetBar.classList.add('bg-yellow-400');
        showStudentAlert(`⚠️ Cuidado: Ya gastaste ${Math.round(percent)}% de tu presupuesto mensual.`, 'warning', false);
    } else if (percent > 70) {
        DOM.budgetBar.classList.add('bg-orange-400');
        showStudentAlert(`📊 Vas bien, pero modera tus gastos en comida/entretenimiento.`, 'info', false);
    } else {
        DOM.budgetBar.classList.add('bg-white'); 
    }

    // List Rendering
    let itemsToShow = monthlyData;
    if (AppState.currentFilter === 'income') itemsToShow = incomeItems;
    if (AppState.currentFilter === 'expense') itemsToShow = expenseItems;

    renderList(itemsToShow);
    updateFilterHeader();
    
    // ACTUALIZAR MENSAJES MOTIVACIONALES PARA UNIVERSITARIOS
    updateStudentMotivationalMessage(percent, totalSpent, AppState.budget);
    
    // CALCULAR MÉTRICAS ESPECÍFICAS PARA UNIVERSITARIOS
    updateStudentMetrics(expenseItems, totalSpent);
    
    // Verificar alertas específicas para estudiantes
    checkStudentTimeAlerts();
    
    // Actualizar gráfico de gastos (si existe)
    if (window.updateExpenseChart) {
        window.updateExpenseChart();
    }
}

// MENSAJES MOTIVACIONALES PARA ESTUDIANTES
function updateStudentMotivationalMessage(percent, totalSpent, budget) {
    const statusElement = document.getElementById('student-status');
    if (!statusElement) return;
    
    let message = "💪 Maneja tu dinero como un pro";
    
    if (percent > 100) {
        message = "😅 ¡Ups! Tiempo de ajustar gastos";
    } else if (percent > 85) {
        message = "⚠️ Cuidado - Fin de mes cerca";
    } else if (percent > 70) {
        message = "📊 Buen control, modera salidas";
    } else if (percent > 50) {
        message = "😎 ¡Excelente control financiero!";
    } else if (totalSpent > 0) {
        message = "✨ ¡Vas súper bien!";
    } else {
        message = "🚀 ¡Comienza tu control financiero!";
    }
    
    statusElement.textContent = message;
}

// MÉTRICAS ESPECÍFICAS PARA ESTUDIANTES UNIVERSITARIOS
function updateStudentMetrics(expenseItems, totalSpent) {
    // 1. GASTO DIARIO PROMEDIO
    const now = new Date();
    const dayOfMonth = now.getDate();
    const dailyAverage = dayOfMonth > 0 ? totalSpent / dayOfMonth : 0;
    const dailyAverageElement = document.getElementById('daily-average');
    if (dailyAverageElement) {
        dailyAverageElement.textContent = formatMoney(dailyAverage);
    }
    
    // 2. DÍAS RESTANTES DEL MES
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const daysRemainingElement = document.getElementById('days-remaining');
    if (daysRemainingElement) {
        daysRemainingElement.textContent = daysRemaining <= 0 ? '0' : daysRemaining.toString();
    }
    
    // 3. CATEGORÍA TOP DE GASTOS
    const topCategory = calculateTopStudentCategory(expenseItems);
    const topCategoryElement = document.getElementById('top-category');
    if (topCategoryElement) {
        topCategoryElement.textContent = topCategory;
    }
}

// CALCULAR CATEGORÍA DE GASTO MÁS ALTA PARA UNIVERSITARIOS
function calculateTopStudentCategory(expenseItems) {
    if (!expenseItems || expenseItems.length === 0) return '👀';
    
    const categoryTotals = {};
    
    expenseItems.forEach(expense => {
        const categoryId = expense.categoryId || 'otros-gastos';
        categoryTotals[categoryId] = (categoryTotals[categoryId] || 0) + expense.amount;
    });
    
    let maxAmount = 0;
    let topCategoryId = '';
    
    Object.entries(categoryTotals).forEach(([categoryId, amount]) => {
        if (amount > maxAmount) {
            maxAmount = amount;
            topCategoryId = categoryId;
        }
    });
    
    // Mapeo de categorías a emojis específicos para universitarios
    const categoryEmojis = {
        'comida-u': '🍔',
        'transporte-u': '🚌',
        'materiales': '📝',
        'fotocopias': '🖨️',
        'libros': '📚',
        'entretenimiento': '🎉',
        'ropa-casual': '👕',
        'casa-estudiantil': '🏠',
        'salud-estudiantil': '💊',
        'subscripciones': '📱',
        'salidas-amigos': '🍻',
        'emergencias': '⚠️',
        'gimnasio-deporte': '🏋️',
        'proyectos-uni': '📈',
        'otros-gastos': '💸'
    };
    
    return categoryEmojis[topCategoryId] || '💸';
}

// ALERTAS ESPECÍFICAS PARA ESTUDIANTES UNIVERSITARIOS
function showStudentAlert(message, type, persistent = false) {
    // Solo mostrar alertas únicas para no saturar
    const existingAlert = document.querySelector('.student-alert');
    if (existingAlert && !persistent) return;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `student-alert fixed top-4 right-4 z-50 p-3 rounded-2xl shadow-lg max-w-sm text-sm font-medium transition-all duration-300`;
    
    if (type === 'error') {
        alertDiv.className += ' bg-red-100 text-red-700 border border-red-200';
    } else if (type === 'warning') {
        alertDiv.className += ' bg-yellow-100 text-yellow-700 border border-yellow-200';
    } else if (type === 'info') {
        alertDiv.className += ' bg-blue-100 text-blue-700 border border-blue-200';
    }
    
    alertDiv.innerHTML = `<div class="flex items-center"><span>${message}</span><button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-lg">×</button></div>`;
    document.body.appendChild(alertDiv);
    
    if (!persistent) {
        setTimeout(() => alertDiv.remove(), 5000);
    }
}

// ALERTAS POR TIEMPOS ESTUDIANTILES
function checkStudentTimeAlerts() {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const dayOfWeek = now.getDay(); // 0 = domingo
    
    // Alerta de fin de mes (días 25-30)
    if (dayOfMonth >= 25 && dayOfMonth <= 30) {
        const { budget, expenses } = AppState;
        const monthlyExpenses = getMonthlyData().filter(i => i.type === 'expense' || !i.type);
        const totalSpent = monthlyExpenses.reduce((s, i) => s + i.amount, 0);        
        if (budget > 0 && totalSpent > budget * 0.90) {
            showStudentAlert('📅 ¡Fin de mes cerca! Modera gastos hasta tu próxima mesada/beca.', 'warning', false);
        }
    }
    
    // Alerta de fin de semana (viernes-sábado)
    if (dayOfWeek === 5 || dayOfWeek === 6) {
        const weeklySpent = calculateWeeklySpending();
        if (weeklySpent > (AppState.budget * 0.3)) {
            showStudentAlert('🎉 Fin de semana: ¡cuidado con los gastos en salidas y entretenimiento!', 'info', false);
        }
    }
}

// CALCULAR GASTOS SEMANALES
function calculateWeeklySpending() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    return AppState.expenses
        .filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= weekAgo && (expense.type === 'expense' || !expense.type);
        })
        .reduce((sum, expense) => sum + expense.amount, 0);
}

function updateFilterHeader() {
    const title = document.getElementById('transactions-title');
    const badge = document.getElementById('transactions-subtitle');
    
    if(!title || !badge) return;

    badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors'; 

    if(AppState.currentFilter === 'income') {
        title.textContent = 'Ingresos';
        title.className = 'font-extrabold text-base text-green-600';
        badge.textContent = 'Ver Todos';
        badge.classList.add('bg-green-100', 'text-green-600');
    } else if(AppState.currentFilter === 'expense') {
        title.textContent = 'Gastos';
        title.className = 'font-extrabold text-base text-red-600';
        badge.textContent = 'Ver Todos';
        badge.classList.add('bg-red-100', 'text-red-600');
    } else {
        title.textContent = 'Transacciones';
        title.className = 'font-extrabold text-base text-gray-900';
        badge.textContent = 'Este Mes';
        badge.classList.add('text-gray-400', 'bg-gray-100');
    }
}

function renderList(items) {
    Array.from(DOM.movementsList.children).forEach(child => {
        if (child.id !== 'empty-state') child.remove();
    });

    if (items.length === 0) {
        DOM.emptyState.style.display = 'block';
    } else {
        DOM.emptyState.style.display = 'none';
        [...items].reverse().forEach(exp => {
            const isIncome = exp.type === 'income';
            
            const catId = exp.category || (isIncome ? 'otros' : 'otros');
            let catData = getCategoryById(catId);
            
            if(isIncome && catId === 'otros') {
                catData = { label: 'Ingreso', icon: '💰', color: 'bg-green-100 text-green-700' };
            }

            let mainTitle = catData.label;
            let subTitle = `${exp.concept || (isIncome ? 'Ingreso Extra' : 'Sin descripción')}`;
            
            if (exp.concept && exp.concept.length > 0) {
                mainTitle = exp.concept;
                subTitle = catData.label; 
            }
            
            const li = document.createElement('li');
            li.className = 'buddy-card p-4 flex justify-between items-center slide-up group cursor-pointer hover:bg-gray-50 transition-colors active:scale-95';
            li.onclick = () => window.editTransaction(exp.id); 
            
            const amountClass = isIncome ? 'text-green-600' : 'text-gray-900';
            const sign = isIncome ? '+' : '-';

            li.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="icon-squircle text-2xl ${catData.color ?? 'bg-gray-100'}">${catData.icon}</div>
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-gray-800 leading-tight truncate pr-2">${mainTitle}</p>
                        <p class="text-xs font-bold text-gray-400 mt-0.5 truncate">
                            ${subTitle} • ${exp.method || 'Efectivo'}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                        <div class="text-right">
                            <span class="font-extrabold ${amountClass} text-lg block">${sign}${formatMoney(exp.amount)}</span>
                            <span class="text-[10px] font-bold text-gray-400 opacity-60">${new Date(exp.date).toLocaleDateString()}</span>
                        </div>
                        <div class="w-6 h-6 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center text-[10px]"><i class="fa-solid fa-pen"></i></div>
                </div>
            `;
            DOM.movementsList.appendChild(li);
        });
    }
}

// INTERACTIONS
export function changeMonth(step) {
    setViewDate(step);
    updateUI();
}

export function filterTransactions(type) {
    if (type === 'all') {
        setFilter('all');
    } else if (AppState.currentFilter === type) {
        setFilter('all');
    } else {
        setFilter(type);
    }
    updateUI();
}

export function setTransactionType(type) {
    DOM.typeInput.value = type;
    DOM.categoryGrid.style.display = 'grid'; 
    
    if(type === 'expense') {
        DOM.btnTypeExpense.className = "px-4 py-2 rounded-lg text-sm font-extrabold shadow-sm bg-white text-black transition-all";
        DOM.btnTypeIncome.className = "px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        initCategoryGrid(EXPENSE_CATEGORIES);
        DOM.conceptInput.placeholder = "¿En qué lo gastaste?";
    } else {
        DOM.btnTypeIncome.className = "px-4 py-2 rounded-lg text-sm font-extrabold shadow-sm bg-green-100 text-green-700 transition-all";
        DOM.btnTypeExpense.className = "px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        initCategoryGrid(INCOME_CATEGORIES);
        DOM.conceptInput.placeholder = "¿De dónde provino este dinero?";
    }
}

export function initCategoryGrid(categoriesToRender = EXPENSE_CATEGORIES) {
    DOM.categoryGrid ? DOM.categoryGrid.innerHTML = '' : null;
    if(!DOM.categoryGrid) return;
    
    categoriesToRender.forEach((cat, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isDefault = index === 0;
        btn.className = `flex flex-col items-center justify-center p-1 rounded-xl border-2 border-transparent transition-all ${isDefault ? 'bg-white shadow-md border-gray-200 transform scale-105' : 'bg-gray-50 hover:bg-gray-100'}`;
        
        btn.innerHTML = `<span class="text-xl mb-0.5">${cat.icon}</span><span class="text-[9px] font-bold ${isDefault ? 'text-gray-900' : 'text-gray-500'} uppercase">${cat.label}</span>`;
        
        btn.onclick = () => selectCategory(cat.id, btn);
        DOM.categoryGrid.appendChild(btn);
    });
    // Select default
    if(categoriesToRender.length > 0) {
            selectCategory(categoriesToRender[0].id, DOM.categoryGrid.firstChild);
    }
}

export function selectCategory(id, btnElement) {
    DOM.selectedCategoryInput.value = id;
    // Reset visual
    Array.from(DOM.categoryGrid.children).forEach(b => {
        b.className = 'flex flex-col items-center justify-center p-1 rounded-xl border-2 border-transparent bg-gray-50 hover:bg-gray-100 text-gray-400 transition-all opacity-60 grayscale';
    });
    // Highlight
    const cat = getCategoryById(id);
    btnElement.className = `flex flex-col items-center justify-center p-1 rounded-xl border-2 border-black bg-white shadow-md transition-all transform scale-105`;
    btnElement.innerHTML = `<span class="text-xl mb-0.5">${cat.icon}</span><span class="text-[9px] font-bold text-gray-900 uppercase">${cat.label}</span>`;
}

// MODALS
export function toggleModal(show) {
    const modal = DOM.modal;
    const panel = document.getElementById('expense-form');
    if(show) {
        modal.classList.remove('invisible', 'opacity-0');
        if(window.innerWidth < 640) {
                panel.classList.remove('translate-y-full');
        } else { 
            panel.classList.remove('scale-95');
            setTimeout(()=>document.getElementById('amount').focus(), 100);
        }
    } else {
        modal.classList.add('invisible', 'opacity-0');
        if(window.innerWidth < 640) panel.classList.add('translate-y-full');
        else panel.classList.add('scale-95');
        
        setTimeout(() => {
            DOM.editingIdInput.value = '';
            document.getElementById('expense-form').reset();
            DOM.btnDelete.classList.add('hidden'); 
            setTransactionType('expense');
            DOM.dateInput.valueAsDate = new Date();
            selectCategory('comida', DOM.categoryGrid.firstChild);
        }, 300);
    }
}

export function toggleSummary(show) {
    const monthly = getMonthlyData();
    const expensesOnly = monthly.filter(i => i.type === 'expense' || !i.type);
    const incomeOnly = monthly.filter(i => i.type === 'income');
    const totalSpent = expensesOnly.reduce((s, i) => s + i.amount, 0);
    const totalIncome = incomeOnly.reduce((s, i) => s + i.amount, 0);

    const now = new Date();
    const viewingMonth = AppState.currentViewDate.getMonth();
    const viewingYear = AppState.currentViewDate.getFullYear();
    const isCurrentMonth = (now.getMonth() === viewingMonth) && (now.getFullYear() === viewingYear);
    const daysInMonth = new Date(viewingYear, viewingMonth + 1, 0).getDate();
    let dayDivisor = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;
    const dailyAvg = totalSpent / dayDivisor;
    const projectionSpent = isCurrentMonth ? (dailyAvg * daysInMonth) : totalSpent;
    const totalCapacity = AppState.budget > 0 ? AppState.budget : totalIncome;
    const projectedSavings = totalCapacity - projectionSpent;

    if(show) {
        DOM.summary.total.textContent = formatMoney(totalSpent);
        DOM.summary.daily.textContent = formatMoney(dailyAvg);
        DOM.summary.proj.textContent = formatMoney(projectionSpent); 
        DOM.summary.savings.textContent = formatMoney(projectedSavings);

        if (projectedSavings >= 0) {
            DOM.summary.savings.classList.remove('text-red-800');
            DOM.summary.savings.classList.add('text-green-800');
            DOM.summary.savingsStatus.textContent = "Superávit";
            DOM.summary.savingsStatus.className = "text-xs font-bold text-green-700 bg-green-200 px-2 py-1 rounded-full";
            DOM.summary.savingsMsg.textContent = isCurrentMonth ? "¡Bien! A este ritmo te sobrará dinero." : "Cerraste el mes con saldo positivo.";
        } else {
            DOM.summary.savings.classList.remove('text-green-800');
            DOM.summary.savings.classList.add('text-red-800');
            DOM.summary.savingsStatus.textContent = "Déficit";
            DOM.summary.savingsStatus.className = "text-xs font-bold text-red-700 bg-red-200 px-2 py-1 rounded-full";
            DOM.summary.savingsMsg.textContent = isCurrentMonth ? "Cuidado: Vas camino a gastar más de lo que tienes." : "Gastaste más de lo disponible este mes.";
        }
        DOM.summary.modal.classList.remove('invisible', 'opacity-0');
        DOM.summary.panel.classList.remove('translate-y-full');
    } else {
        DOM.summary.modal.classList.add('invisible', 'opacity-0');
        DOM.summary.panel.classList.add('translate-y-full');
    }
}

export function toggleDeleteModal(show) {
    const modal = document.getElementById('delete-modal');
    const panel = document.getElementById('delete-panel');
    if(show) {
        modal.classList.remove('invisible', 'opacity-0');
        panel.classList.remove('scale-90');
        panel.classList.add('scale-100');
    } else {
        modal.classList.add('invisible', 'opacity-0');
        panel.classList.remove('scale-100');
        panel.classList.add('scale-90');
    }
}

export function openAddModal() {
    DOM.editingIdInput.value = '';
    document.getElementById('expense-form').reset();
    DOM.btnDelete.classList.add('hidden'); 
    setTransactionType('expense');
    if(DOM.dateInput) DOM.dateInput.valueAsDate = new Date();
    selectCategory('comida', DOM.categoryGrid.firstChild); 
    toggleModal(true);
}

export function editTransaction(id) {
    const item = AppState.expenses.find(i => i.id === id);
    if(!item) return;

    DOM.editingIdInput.value = item.id;
    DOM.amountInput.value = item.amount;
    DOM.conceptInput.value = item.concept;
    DOM.methodInput.value = item.method || 'Efectivo';
    
    try {
        const dateObj = new Date(item.date);
        const isoDate = dateObj.toISOString().split('T')[0];
        DOM.dateInput.value = isoDate;
    } catch(e) { DOM.dateInput.valueAsDate = new Date(); }

    const type = item.type || 'expense';
    setTransactionType(type);
    
    // Restore Category
    const catId = item.category || (type === 'income' ? 'otros_ingreso' : 'otros');
    const targetList = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const catIndex = targetList.findIndex(c => c.id === catId);
    
    if (catIndex >= 0 && DOM.categoryGrid.children[catIndex]) {
        selectCategory(catId, DOM.categoryGrid.children[catIndex]);
    } else if (DOM.categoryGrid.children.length > 0) {
            selectCategory(targetList[0].id, DOM.categoryGrid.children[0]);
    }

    DOM.btnDelete.classList.remove('hidden'); 
    toggleModal(true);
}

export function deleteTransaction() {
    toggleDeleteModal(true);
}

// EMAIL CON CONTEXTO ESTUDIANTIL
export async function sendAlertEmail(manual) {
    if (!AppState.currentUser || !AppState.currentUser.email) return;
    const monthly = getMonthlyData();
    const expensesOnly = monthly.filter(i => i.type === 'expense' || !i.type);
    const incomeOnly = monthly.filter(i => i.type === 'income');
    const totalSpent = expensesOnly.reduce((s, i) => s + i.amount, 0);
    const totalIncome = incomeOnly.reduce((s, i) => s + i.amount, 0);
    
    let limit = AppState.budget;
    if (limit <= 0 && totalIncome > 0) limit = totalIncome;

    const projection = calculateProjection(totalSpent);
    let status = "Neutro";
    let studentTip = "";
    
    if (limit > 0) {
        const percentage = (totalSpent / limit) * 100;
        if (totalSpent > limit) {
            status = "😨 ¡Sin dinero!"; 
            studentTip = "Hora de hablar con familia o buscar ingresos extra (tutorías, freelance).";
        } else if (projection > limit) {
            status = "⚠️ Proyección riesgosa";
            studentTip = "Reduce gastos en comida fuera de casa y entretenimiento.";
        } else if (percentage > 70) {
            status = "📊 Gastando rápido";
            studentTip = "Buen ritmo, pero modera las salidas con amigos.";
        } else {
            status = "✅ Control financiero estudiantil";
            studentTip = "¡Excelente! Mantienes un buen control de tus gastos universitarios.";
        }
    }

    const projectedLeftover = limit > 0 ? (limit - projection) : 0;
    const btn = DOM.btnEmail;
    const label = btn.querySelector('p:nth-child(2)');
    const originalText = label.textContent;
    label.textContent = 'Enviando...';
    btn.disabled = true;

    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: AppState.currentUser.email,
            user_name: AppState.currentUser.email.split('@')[0],
            total_spent: formatMoney(totalSpent),
            budget_limit: formatMoney(limit), 
            financial_status: status,
            projected_balance: formatMoney(projectedLeftover),
            student_tip: studentTip
        });
        showNotification('🎓 ¡Reporte estudiantil enviado! 🚀', 'success');
    } catch (error) {
        console.error(error);
        showNotification("Error técnico al enviar.", 'error');
    } finally {
        label.textContent = originalText;
        btn.disabled = false;
    }
}