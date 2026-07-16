import { AppState, setViewDate, setViewMonth, setFilter, getCurrentMonthBudget, getCarryOverForMonth, setCarryOverForMonth } from './state.js';
import { formatMoney, showNotification, runAsyncAction } from './utils.js';
import { getCategories } from './config-loader.js';
import { saveData, logout } from './auth.js';
import { generatePDFReport } from './pdf-generator.js';

// Variables globales para configuración cargada dinámicamente
let EXPENSE_CATEGORIES = [];
let INCOME_CATEGORIES = [];
let getCategoryById = () => ({ label: 'Cargando...', icon: '⏳', color: 'bg-gray-100 text-gray-600' });

// Estado del filtro por rango de fechas en el reporte
let reportDateFilter = null; // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } o null

// Cargar configuración al inicializar el módulo
async function initConfig() {
    const categoriesConfig = await getCategories();
    
    EXPENSE_CATEGORIES = categoriesConfig.EXPENSE_CATEGORIES;
    INCOME_CATEGORIES = categoriesConfig.INCOME_CATEGORIES;
    getCategoryById = categoriesConfig.getCategoryById;
}

// Inicializar configuración inmediatamente
initConfig();

// Helper: Obtener fecha de hoy en formato ISO local (evita problemas de zona horaria)
function getTodayISO() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// DOM ELEMENTS GETTER
export const DOM = {
    get views() { 
        return { 
            login: document.getElementById('login-view'), 
            app: document.getElementById('app-view') 
        }; 
    },
    get auth() { 
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
    get currentMonthLabel() { return document.getElementById('current-month-label'); },
    get monthDisplay() { return document.getElementById('month-display'); },
    get countDisplay() { return document.getElementById('transaction-count'); },
    get budgetInput() { return document.getElementById('budget-input'); },
    get movementsList() { return document.getElementById('movements-list'); },
    get emptyState() { return document.getElementById('empty-state'); },
    get modal() { return document.getElementById('expense-modal'); },
    
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
    get btnBusiness() { return document.getElementById('btn-business'); },
    get btnPersonal() { return document.getElementById('btn-personal'); },
    get btnDelete() { return document.getElementById('btn-delete'); },
    
    // Inputs ocultos/estado
    get selectedCategoryInput() { return document.getElementById('selected-category'); },
    get businessTypeInput() { return document.getElementById('business-type'); },
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

// Obtener datos del mes anterior
function getPreviousMonthData() {
    const previousDate = new Date(AppState.currentViewDate);
    previousDate.setMonth(previousDate.getMonth() - 1);
    
    const prevMonth = previousDate.getMonth();
    const prevYear = previousDate.getFullYear();

    return AppState.expenses.filter(item => {
        const d = new Date(item.date);
        return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });
}

// Obtener datos filtrados por rango de fechas (o del mes actual si no hay filtro)
function getReportFilteredData() {
    if (reportDateFilter) {
        const startDate = new Date(reportDateFilter.start + 'T00:00:00');
        const endDate = new Date(reportDateFilter.end + 'T23:59:59');
        return AppState.expenses.filter(item => {
            const d = new Date(item.date);
            return d >= startDate && d <= endDate;
        });
    }
    return getMonthlyData();
}

// Actualizar las estadísticas del modal con datos filtrados
function updateReportStats(data, label) {
    const reportMonthEl = document.getElementById('report-month');
    const reportBalanceEl = document.getElementById('report-balance');
    const reportIncomeEl = document.getElementById('report-income');
    const reportExpensesEl = document.getElementById('report-expenses');
    const reportCountEl = document.getElementById('report-count');

    const incomeItems = data.filter(i => i.type === 'income');
    const expenseItems = data.filter(i => i.type === 'expense' || !i.type);
    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalIncome - totalExpenses;

    if (reportMonthEl) reportMonthEl.textContent = label;
    if (reportBalanceEl) reportBalanceEl.textContent = formatMoney(balance);
    if (reportIncomeEl) reportIncomeEl.textContent = formatMoney(totalIncome);
    if (reportExpensesEl) reportExpensesEl.textContent = formatMoney(totalExpenses);
    if (reportCountEl) reportCountEl.textContent = `${data.length} movimiento${data.length !== 1 ? 's' : ''} registrado${data.length !== 1 ? 's' : ''}`;
}

// Filtrar reporte por rango de fechas (calendario día/mes)
export function filterReportByDateRange() {
    const startInput = document.getElementById('report-date-start');
    const endInput = document.getElementById('report-date-end');
    const rangeSummary = document.getElementById('report-range-summary');

    if (!startInput || !endInput || !rangeSummary) return;

    const startValue = startInput.value;
    const endValue = endInput.value;

    if (!startValue || !endValue) {
        showNotification('⚠️ Selecciona ambas fechas (desde y hasta)', 'error');
        return;
    }

    if (startValue > endValue) {
        showNotification('⚠️ La fecha "Desde" debe ser anterior a "Hasta"', 'error');
        return;
    }

    // Guardar filtro activo
    reportDateFilter = { start: startValue, end: endValue };

    const filtered = getReportFilteredData();

    // Formatear fechas para mostrar
    const startDate = new Date(startValue + 'T12:00:00');
    const endDate = new Date(endValue + 'T12:00:00');
    const formatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const startLabel = startDate.toLocaleDateString('es-ES', formatOptions);
    const endLabel = endDate.toLocaleDateString('es-ES', formatOptions);
    const label = `${startLabel} - ${endLabel}`;

    // Actualizar estadísticas del modal
    updateReportStats(filtered, label);

    // Mostrar resumen del filtro
    const incomeItems = filtered.filter(i => i.type === 'income');
    const expenseItems = filtered.filter(i => i.type === 'expense' || !i.type);
    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalIncome - totalExpenses;

    rangeSummary.innerHTML = `
        <div class="space-y-1">
            <p class="text-[10px] uppercase tracking-wider text-blue-500">${label}</p>
            <p class="text-sm font-black text-gray-800">Saldo: ${formatMoney(balance)}</p>
            <div class="grid grid-cols-2 gap-2 text-[10px]">
                <div class="rounded-lg bg-green-50 p-1.5 text-green-700">Ingresos: ${formatMoney(totalIncome)}</div>
                <div class="rounded-lg bg-red-50 p-1.5 text-red-700">Gastos: ${formatMoney(totalExpenses)}</div>
            </div>
        </div>
    `;
    rangeSummary.classList.remove('hidden');

    showNotification(`📅 Mostrando datos del ${label}`, 'success');
}

// UI UPDATES
export function updateUI() {
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    DOM.monthDisplay.textContent = `${monthNames[AppState.currentViewDate.getMonth()]} ${AppState.currentViewDate.getFullYear()}`;
    
    // Limpiar campo de presupuesto cuando se cambia de mes (cada mes comienza vacío)
    if (DOM.budgetInput) {
        const currentBudget = getCurrentMonthBudget();
        DOM.budgetInput.value = currentBudget > 0 ? currentBudget : '';
    }
    
    // Get Data
    const monthlyData = getMonthlyData();
    DOM.countDisplay.textContent = `${monthlyData.length} Reg.`;

    // Separar Gastos e Ingresos
    const incomeItems = monthlyData.filter(i => i.type === 'income');
    const expenseItems = monthlyData.filter(i => i.type === 'expense' || !i.type);

    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalSpent = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    
    // Separar ingresos y gastos del NEGOCIO (para comparación y utilidad)
    const businessIncomeItems = incomeItems.filter(i => i.businessType === 'business' || !i.businessType);
    const businessIncome = businessIncomeItems.reduce((sum, item) => sum + item.amount, 0);
    
    const businessExpenseItems = expenseItems.filter(i => i.businessType === 'business' || !i.businessType);
    const businessSpent = businessExpenseItems.reduce((sum, item) => sum + item.amount, 0);
    
    // Saldo Disponible = Ingresos - Gastos TOTALES (personal + negocio)
    const available = totalIncome - totalSpent;

    // Visuals
    DOM.availableDisplay.textContent = formatMoney(available);
    DOM.dashIncome.textContent = formatMoney(totalIncome);
    DOM.dashExpense.textContent = formatMoney(totalSpent);
    
    // Actualizar Comparación Mes a Mes (SOLO ingresos de negocio)
    updateMonthlyGrowth(businessIncome);
    
    // Actualizar Control de Presupuesto (todos los gastos)
    updateBudgetAlert(totalSpent);

    // Actualizar seguimiento mensual y recordatorios
    updateCarryOverAndReminders(monthlyData, totalIncome, totalSpent);
    
    // Actualizar Utilidad del Negocio (SOLO negocio, no personal)
    updateProfitCalculation(businessIncome, businessSpent);
    
    // Mes actual en el cuadro de saldo
    if (DOM.currentMonthLabel) {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthName = months[AppState.currentViewDate.getMonth()];
        const year = AppState.currentViewDate.getFullYear();
        DOM.currentMonthLabel.textContent = `${monthName} ${year}`;
    }

    // List Rendering
    let itemsToShow = monthlyData;
    if (AppState.currentFilter === 'income') itemsToShow = incomeItems;
    if (AppState.currentFilter === 'expense') itemsToShow = expenseItems;
    if (AppState.currentFilter === 'business') itemsToShow = monthlyData.filter(i => i.businessType === 'business' || !i.businessType);
    if (AppState.currentFilter === 'personal') itemsToShow = monthlyData.filter(i => i.businessType === 'personal');

    renderList(itemsToShow);
    updateFilterHeader();
}

// Actualizar comparación mes a mes (para emprendedores: ¿estoy creciendo?)
// IMPORTANTE: Solo mide ingresos de NEGOCIO, no personales
function updateMonthlyGrowth(currentBusinessIncome) {
    const growthPercentageEl = document.getElementById('growth-percentage');
    const growthStatusEl = document.getElementById('growth-status');
    const growthEmojiEl = document.getElementById('growth-emoji');
    const growthBadgeEl = document.getElementById('growth-badge');
    const currentMonthIncomeEl = document.getElementById('current-month-income');
    const lastMonthIncomeEl = document.getElementById('last-month-income');
    
    if (!growthPercentageEl) return; // Si no existe el elemento, salir
    
    // Obtener datos del mes anterior (SOLO negocio)
    const previousMonthData = getPreviousMonthData();
    const previousBusinessIncome = previousMonthData
        .filter(i => i.type === 'income' && (i.businessType === 'business' || !i.businessType))
        .reduce((sum, item) => sum + item.amount, 0);
    
    // Actualizar valores (solo ingresos de negocio)
    currentMonthIncomeEl.textContent = formatMoney(currentBusinessIncome);
    lastMonthIncomeEl.textContent = formatMoney(previousBusinessIncome);
    
    // Calcular crecimiento del NEGOCIO
    if (previousBusinessIncome === 0 && currentBusinessIncome === 0) {
        // Sin datos de negocio
        growthPercentageEl.textContent = '0%';
        growthPercentageEl.className = 'text-2xl font-black leading-none text-gray-500';
        growthStatusEl.textContent = 'Sin ventas registradas';
        growthEmojiEl.textContent = '💼';
        growthBadgeEl.textContent = 'Sin datos';
        growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500';
    } else if (previousBusinessIncome === 0) {
        // Primer mes con ventas del negocio
        growthPercentageEl.textContent = '🎉 Nuevo';
        growthPercentageEl.className = 'text-2xl font-black leading-none text-blue-600';
        growthStatusEl.textContent = '¡Primeras ventas del negocio!';
        growthEmojiEl.textContent = '🚀';
        growthBadgeEl.textContent = '¡Comenzando!';
        growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600';
    } else {
        // Calcular porcentaje de crecimiento del negocio
        const growthPercentage = ((currentBusinessIncome - previousBusinessIncome) / previousBusinessIncome * 100).toFixed(1);
        const absGrowth = Math.abs(parseFloat(growthPercentage));
        
        if (growthPercentage > 0) {
            // Negocio creciendo
            growthPercentageEl.textContent = `+${absGrowth}%`;
            growthPercentageEl.className = 'text-2xl font-black leading-none text-green-600';
            growthStatusEl.textContent = absGrowth > 10 ? '¡Excelente crecimiento! 🎉' : '¡Tu negocio va creciendo! 👍';
            growthEmojiEl.textContent = '📈';
            growthBadgeEl.textContent = 'Creciendo';
            growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-600';
        } else if (growthPercentage < 0) {
            // Ventas del negocio bajaron
            growthPercentageEl.textContent = `-${absGrowth}%`;
            growthPercentageEl.className = 'text-2xl font-black leading-none text-orange-600';
            growthStatusEl.textContent = '¡Hay que mejorar las ventas del negocio!';
            growthEmojiEl.textContent = '📉';
            growthBadgeEl.textContent = 'Bajó';
            growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-600';
        } else {
            // Igual
            growthPercentageEl.textContent = '0%';
            growthPercentageEl.className = 'text-2xl font-black leading-none text-gray-600';
            growthStatusEl.textContent = 'Igual que el mes pasado';
            growthEmojiEl.textContent = '➡️';
            growthBadgeEl.textContent = 'Estable';
            growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600';
        }
    }
}

// Actualizar control de presupuesto (alertas visuales cuando se exceda)
function updateBudgetAlert(totalSpent) {
    const budgetAlertCard = document.getElementById('budget-alert-card');
    const budgetStatusText = document.getElementById('budget-status-text');
    const budgetEmoji = document.getElementById('budget-emoji');
    const budgetProgressBar = document.getElementById('budget-progress-bar');
    const budgetPercentage = document.getElementById('budget-percentage');
    const budgetRemaining = document.getElementById('budget-remaining');
    const budgetSpentAmount = document.getElementById('budget-spent-amount');
    const budgetTotalAmount = document.getElementById('budget-total-amount');
    
    if (!budgetAlertCard) return; // Si no existe el elemento, salir
    
    const budget = getCurrentMonthBudget();
    
    // Actualizar montos
    budgetSpentAmount.textContent = formatMoney(totalSpent);
    budgetTotalAmount.textContent = formatMoney(budget);
    
    // Si no hay presupuesto definido
    if (budget === 0 || budget === null) {
        budgetStatusText.textContent = 'Define tu presupuesto mensual';
        budgetEmoji.textContent = '🎯';
        budgetProgressBar.style.width = '0%';
        budgetProgressBar.className = 'h-full bg-gray-300 transition-all duration-500';
        budgetPercentage.textContent = '0%';
        budgetRemaining.textContent = formatMoney(0);
        budgetAlertCard.className = 'bg-white p-4 rounded-2xl shadow-sm border border-gray-100';
        return;
    }
    
    // Calcular porcentaje usado
    const percentageUsed = (totalSpent / budget) * 100;
    const remaining = budget - totalSpent;
    
    budgetPercentage.textContent = `${Math.min(percentageUsed, 100).toFixed(0)}%`;
    budgetRemaining.textContent = formatMoney(remaining);
    budgetProgressBar.style.width = `${Math.min(percentageUsed, 100)}%`;
    
    // Estados visuales según el porcentaje usado
    if (percentageUsed >= 100) {
        // EXCEDIDO - Alerta crítica
        budgetStatusText.textContent = '⚠️ ¡Presupuesto excedido!';
        budgetEmoji.textContent = '🚨';
        budgetProgressBar.className = 'h-full bg-red-500 transition-all duration-500';
        budgetAlertCard.className = 'bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-2xl shadow-lg border-2 border-red-300 animate-pulse';
        
        // Mostrar notificación si se acaba de exceder
        if (percentageUsed >= 100 && percentageUsed < 105) {
            showNotification('🚨 ¡Atención! Has excedido tu presupuesto mensual', 'error');
        }
    } else if (percentageUsed >= 90) {
        // ADVERTENCIA - Cerca del límite
        budgetStatusText.textContent = '⚠️ Cerca del límite';
        budgetEmoji.textContent = '⚠️';
        budgetProgressBar.className = 'h-full bg-orange-500 transition-all duration-500';
        budgetAlertCard.className = 'bg-gradient-to-br from-orange-50 to-yellow-50 p-4 rounded-2xl shadow-md border-2 border-orange-200';
    } else if (percentageUsed >= 75) {
        // PRECAUCIÓN - Alto uso
        budgetStatusText.textContent = 'Controlando gastos 👀';
        budgetEmoji.textContent = '📊';
        budgetProgressBar.className = 'h-full bg-yellow-500 transition-all duration-500';
        budgetAlertCard.className = 'bg-white p-4 rounded-2xl shadow-sm border-2 border-yellow-200';
    } else if (percentageUsed >= 50) {
        // MEDIO - Uso moderado
        budgetStatusText.textContent = 'Vas bien 👍';
        budgetEmoji.textContent = '💪';
        budgetProgressBar.className = 'h-full bg-blue-500 transition-all duration-500';
        budgetAlertCard.className = 'bg-white p-4 rounded-2xl shadow-sm border border-gray-100';
    } else {
        // BUENO - Bajo uso
        budgetStatusText.textContent = '¡Excelente control! 🎉';
        budgetEmoji.textContent = '✅';
        budgetProgressBar.className = 'h-full bg-green-500 transition-all duration-500';
        budgetAlertCard.className = 'bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-2xl shadow-sm border border-green-200';
    }
}

// Actualizar cálculo de utilidad del NEGOCIO (solo ingresos y gastos de negocio)
// IMPORTANTE: No incluye movimientos personales (esos ya se ven en Saldo Disponible)
function updateProfitCalculation(businessIncome, businessSpent) {
    const profitAmountEl = document.getElementById('profit-amount');
    const profitStatusEl = document.getElementById('profit-status');
    const profitEmojiEl = document.getElementById('profit-emoji');
    const profitMarginEl = document.getElementById('profit-margin');
    
    if (!profitAmountEl) return; // Si no existe el elemento, salir
    
    // Calcular utilidad del NEGOCIO (ventas - gastos de negocio)
    const profit = businessIncome - businessSpent;
    
    // Calcular margen de utilidad (profit / ventas * 100)
    let marginPercentage = 0;
    if (businessIncome > 0) {
        marginPercentage = (profit / businessIncome * 100).toFixed(1);
    }
    
    // Actualizar monto de utilidad del negocio
    profitAmountEl.textContent = formatMoney(profit);
    profitMarginEl.textContent = `Margen: ${marginPercentage}%`;
    
    // Estados visuales según la utilidad del negocio
    if (businessIncome === 0 && businessSpent === 0) {
        // Sin movimientos de negocio
        profitAmountEl.className = 'text-2xl font-black leading-none mb-1 text-gray-500';
        profitStatusEl.textContent = 'Sin ventas del negocio este mes';
        profitEmojiEl.textContent = '💼';
    } else if (profit > 0) {
        // NEGOCIO RENTABLE - Utilidad positiva
        profitAmountEl.className = 'text-2xl font-black leading-none mb-1 text-green-600';
        
        if (marginPercentage >= 50) {
            profitStatusEl.textContent = '¡Negocio muy rentable! 🎉';
            profitEmojiEl.textContent = '🤑';
        } else if (marginPercentage >= 30) {
            profitStatusEl.textContent = '¡Tu negocio está dando utilidad! 💪';
            profitEmojiEl.textContent = '💰';
        } else if (marginPercentage >= 10) {
            profitStatusEl.textContent = 'Negocio con utilidad, ¡sigue así!';
            profitEmojiEl.textContent = '💵';
        } else {
            profitStatusEl.textContent = 'Utilidad baja, hay que mejorar';
            profitEmojiEl.textContent = '💸';
        }
    } else if (profit < 0) {
        // NEGOCIO CON PÉRDIDAS - Utilidad negativa
        profitAmountEl.className = 'text-2xl font-black leading-none mb-1 text-red-600';
        
        const lossAmount = Math.abs(profit);
        if (lossAmount > businessIncome * 0.5) {
            profitStatusEl.textContent = '⚠️ Negocio con pérdidas altas!';
            profitEmojiEl.textContent = '🚨';
        } else if (lossAmount > businessIncome * 0.2) {
            profitStatusEl.textContent = '⚠️ El negocio está perdiendo';
            profitEmojiEl.textContent = '📉';
        } else {
            profitStatusEl.textContent = 'Pérdida pequeña - Puedes recuperar';
            profitEmojiEl.textContent = '⚠️';
        }
    } else {
        // EQUILIBRIO - Ventas = Gastos del negocio
        profitAmountEl.className = 'text-2xl font-black leading-none mb-1 text-blue-600';
        profitStatusEl.textContent = 'Negocio en punto de equilibrio';
        profitEmojiEl.textContent = '⚖️';
    }
}

function updateCarryOverAndReminders(monthlyData, totalIncome, totalSpent) {
    const carryoverBalanceEl = document.getElementById('carryover-balance');
    const carryoverStatusEl = document.getElementById('carryover-status');
    const remindersListEl = document.getElementById('reminders-list');

    if (!carryoverBalanceEl || !carryoverStatusEl || !remindersListEl) return;

    const previousMonthDate = new Date(AppState.currentViewDate.getFullYear(), AppState.currentViewDate.getMonth() - 1, 1);
    const previousCarryOver = getCarryOverForMonth(previousMonthDate);
    const currentCarryOver = Math.max(0, previousCarryOver + totalIncome - totalSpent);
    setCarryOverForMonth(AppState.currentViewDate, currentCarryOver);

    carryoverBalanceEl.textContent = formatMoney(currentCarryOver);
    if (currentCarryOver > 0) {
        carryoverStatusEl.textContent = 'Puedes usar este saldo el próximo mes';
    } else if (currentCarryOver === 0) {
        carryoverStatusEl.textContent = 'Sin saldo pendiente';
    } else {
        carryoverStatusEl.textContent = 'Saldo comprometido';
    }

    const upcomingReminders = monthlyData
        .filter(item => item.type === 'expense' && item.date)
        .filter(item => {
            const expenseDate = new Date(item.date);
            const today = new Date();
            const diffDays = Math.ceil((expenseDate - today) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 15;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 3);

    if (upcomingReminders.length === 0) {
        remindersListEl.innerHTML = '<li class="opacity-70">No hay pagos próximos en este mes</li>';
        return;
    }

    remindersListEl.innerHTML = upcomingReminders.map(item => {
        const dueDate = new Date(item.date);
        const dateLabel = dueDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        return `<li class="rounded-lg bg-white/80 px-2 py-1">${item.concept || 'Pago'} • ${dateLabel}</li>`;
    }).join('');
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
            li.className = 'buddy-card p-2.5 flex justify-between items-center slide-up group cursor-pointer hover:bg-gray-50 transition-colors active:scale-95';
            li.onclick = () => window.editTransaction(exp.id); 
            
            const amountClass = isIncome ? 'text-green-600' : 'text-red-600';
            const sign = isIncome ? '+' : '-';
            
            // Indicador de tipo de gasto (Personal/Negocio)
            const businessType = exp.businessType || 'business';
            const businessBadge = businessType === 'personal' 
                ? '<span class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">👤 Personal</span>'
                : '<span class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">💼 Negocio</span>';

            li.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <div class="icon-squircle text-xl ${catData.color ?? 'bg-gray-100'}">${catData.icon}</div>
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-sm text-gray-800 leading-tight truncate pr-1">${mainTitle}</p>
                        <p class="text-[10px] font-bold text-gray-400 mt-0.5 truncate">
                            ${subTitle} • ${exp.method || 'Efectivo'}
                        </p>
                        <div class="mt-1">
                            ${businessBadge}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                        <div class="text-right">
                            <span class="font-extrabold ${amountClass} text-base block">${sign}${formatMoney(exp.amount)}</span>
                            <span class="text-[9px] font-bold text-gray-400 opacity-60">${new Date(exp.date).toLocaleDateString()}</span>
                        </div>
                        <div class="w-5 h-5 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center text-[9px]"><i class="fa-solid fa-pen"></i></div>
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

// === SELECTOR DE MES (CALENDARIO) ===
// Nombres de mes en español (centralizados para el picker)
const PICKER_MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Año que se está navegando DENTRO del picker (independiente del mes visualizado)
let pickerDisplayYear = new Date().getFullYear();

// Abrir/cerrar el popover del calendario (mismo patrón que toggleReportModal)
export function toggleMonthPicker(show) {
    const modal = document.getElementById('month-picker-modal');
    const panel = document.getElementById('month-picker-panel');
    if (!modal || !panel) return;

    if (show) {
        // Sincroniza el año del picker con el mes que se está visualizando
        pickerDisplayYear = AppState.currentViewDate.getFullYear();
        renderMonthPicker();
        modal.classList.remove('invisible', 'opacity-0');
        panel.classList.remove('scale-90');
        panel.classList.add('scale-100');
    } else {
        modal.classList.add('invisible', 'opacity-0');
        panel.classList.remove('scale-100');
        panel.classList.add('scale-90');
    }
}

// Avanzar/retroceder el año mostrado en el picker
export function changePickerYear(step) {
    pickerDisplayYear += step;
    renderMonthPicker();
}

// Volver al mes/año reales de hoy
export function goToToday() {
    const today = new Date();
    pickerDisplayYear = today.getFullYear();
    setViewMonth(today.getFullYear(), today.getMonth());
    toggleMonthPicker(false);
    updateUI();
}

// Seleccionar un mes del grid: cambia el mes visualizado, cierra el picker y re-renderiza
export function selectMonth(monthIndex) {
    setViewMonth(pickerDisplayYear, monthIndex);
    toggleMonthPicker(false);
    updateUI();
}

// Construye el grid de los 12 meses dentro del picker
function renderMonthPicker() {
    const yearEl = document.getElementById('picker-year');
    const grid = document.getElementById('picker-month-grid');
    if (!yearEl || !grid) return;

    yearEl.textContent = pickerDisplayYear;
    grid.innerHTML = '';

    const viewYear = AppState.currentViewDate.getFullYear();
    const viewMonth = AppState.currentViewDate.getMonth();
    const today = new Date();
    const isCurrentRealYear = today.getFullYear() === pickerDisplayYear;

    // Conteo de movimientos por mes (para el indicador de actividad)
    const countsByMonth = {};
    AppState.expenses.forEach(item => {
        const d = new Date(item.date);
        if (d.getFullYear() === pickerDisplayYear) {
            countsByMonth[d.getMonth()] = (countsByMonth[d.getMonth()] || 0) + 1;
        }
    });

    PICKER_MONTH_NAMES.forEach((name, index) => {
        const isSelected = pickerDisplayYear === viewYear && index === viewMonth;
        const isToday = isCurrentRealYear && index === today.getMonth();
        const hasActivity = countsByMonth[index] > 0;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `relative flex flex-col items-center justify-center py-3 rounded-xl text-xs font-extrabold uppercase transition-all ${
            isSelected
                ? 'bg-blue-500 text-white shadow-md scale-105'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`;
        btn.innerHTML = `
            <span class="leading-none">${name.slice(0, 3)}</span>
            ${hasActivity ? `<span class="mt-1 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}"></span>` : '<span class="mt-1 w-1.5 h-1.5"></span>'}
        `;
        if (isToday && !isSelected) {
            btn.innerHTML += `<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500"></span>`;
        }
        btn.onclick = () => selectMonth(index);
        grid.appendChild(btn);
    });
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
        DOM.btnTypeExpense.className = "px-4 py-2 rounded-lg text-sm font-extrabold shadow-sm bg-red-100 text-red-700 transition-all";
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

export function setBusinessType(type) {
    if(!DOM.businessTypeInput) return;
    DOM.businessTypeInput.value = type;
    
    if(type === 'business') {
        DOM.btnBusiness.className = "flex-1 py-2 rounded-lg text-xs font-bold bg-blue-500 text-white shadow-sm transition-all";
        DOM.btnPersonal.className = "flex-1 py-2 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-700 transition-all";
    } else {
        DOM.btnPersonal.className = "flex-1 py-2 rounded-lg text-xs font-bold bg-purple-500 text-white shadow-sm transition-all";
        DOM.btnBusiness.className = "flex-1 py-2 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-700 transition-all";
    }
}

export function initCategoryGrid(categoriesToRender = EXPENSE_CATEGORIES) {
    DOM.categoryGrid ? DOM.categoryGrid.innerHTML = '' : null;
    if(!DOM.categoryGrid) return;
    
    categoriesToRender.forEach((cat, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.category = cat.id;
        const isDefault = index === 0;
        btn.className = `flex flex-col items-center justify-center p-1 rounded-xl border-2 border-transparent transition-all ${isDefault ? 'bg-white shadow-md border-gray-200 transform scale-105' : 'bg-gray-50 hover:bg-gray-100'}`;
        
        btn.innerHTML = `<span class="text-xl mb-0.5">${cat.icon}</span><span class="text-[9px] font-bold ${isDefault ? 'text-gray-900' : 'text-gray-500'} uppercase">${cat.label}</span>`;
        
        btn.onclick = () => selectCategory(cat.id, btn);
        DOM.categoryGrid.appendChild(btn);
    });
    // Seleccionar automáticamente la primera categoría del tipo actual
    if(categoriesToRender.length > 0 && DOM.categoryGrid.firstChild) {
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
            DOM.dateInput.value = getTodayISO();
            // La categoría se selecciona automáticamente en initCategoryGrid()
        }, 300);
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
    setBusinessType('business'); // Por defecto es negocio
    if(DOM.dateInput) {
        DOM.dateInput.value = getTodayISO();
    }
    // La categoría se selecciona automáticamente en initCategoryGrid()
    toggleModal(true);
}

export function editTransaction(id) {
    const transaction = AppState.expenses.find(exp => exp.id === id);
    if (!transaction) {
        showNotification('Transacción no encontrada', 'error');
        return;
    }
    
    // Establecer modo edición
    DOM.editingIdInput.value = transaction.id;
    
    // Rellenar campos del formulario
    DOM.amountInput.value = transaction.amount;
    DOM.conceptInput.value = transaction.concept;
    DOM.methodInput.value = transaction.method;
    
    // Configurar fecha
    if (transaction.date) {
        const date = new Date(transaction.date);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        DOM.dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
    
    // Configurar tipo de transacción (ingreso/gasto)
    setTransactionType(transaction.type || 'expense');
    
    // Configurar tipo de negocio (personal/negocio)
    setBusinessType(transaction.businessType || 'business');
    
    // Seleccionar categoría (esperar a que se genere el grid)
    setTimeout(() => {
        const category = transaction.category || 'Otros';
        const categoryBtn = Array.from(DOM.categoryGrid.children).find(
            btn => btn.dataset.category === category
        );
        if (categoryBtn) {
            selectCategory(category, categoryBtn);
        }
    }, 50);
    
    // Mostrar botón eliminar
    DOM.btnDelete.classList.remove('hidden');
    
    // Abrir modal
    toggleModal(true);
}

export function deleteTransaction() {
    toggleDeleteModal(true);
}

export async function downloadReport(type) {
    // Ocultar feedback previo
    const feedbackDiv = document.getElementById('report-feedback');
    if (feedbackDiv) feedbackDiv.classList.add('hidden');
    
    // Usar datos filtrados por rango si existe filtro activo, o del mes actual
    const monthly = getReportFilteredData();
    let filtered = monthly;
    let label = '';
    
    if (type === 'business') {
        filtered = monthly.filter(i => i.businessType === 'business');
        label = 'Negocio';
    } else if (type === 'personal') {
        filtered = monthly.filter(i => i.businessType === 'personal');
        label = 'Personal';
    }
    
    // Determinar fecha de referencia para el título del PDF
    let viewDateForPDF = AppState.currentViewDate;
    let rangeLabel = '';
    if (reportDateFilter) {
        const startDate = new Date(reportDateFilter.start + 'T12:00:00');
        viewDateForPDF = startDate;
        const endDate = new Date(reportDateFilter.end + 'T12:00:00');
        const fmt = { day: 'numeric', month: 'short', year: 'numeric' };
        rangeLabel = `${startDate.toLocaleDateString('es-ES', fmt)} - ${endDate.toLocaleDateString('es-ES', fmt)}`;
    }
    
    // Si no hay datos, mostrar mensaje DENTRO del modal
    if (filtered.length === 0) {
        if (feedbackDiv) {
            const feedbackEmoji = document.getElementById('report-feedback-emoji');
            const feedbackMessage = document.getElementById('report-feedback-message');
            const feedbackHint = document.getElementById('report-feedback-hint');
            
            feedbackEmoji.textContent = '📭';
            feedbackMessage.textContent = `No hay movimientos de ${label}`;
            feedbackHint.textContent = 'Registra gastos o ingresos de este tipo primero';
            
            // Aplicar estilo según el tipo
            if (type === 'business') {
                feedbackDiv.className = 'mb-4 p-4 rounded-2xl text-center bg-blue-50 border-2 border-blue-200';
                feedbackMessage.className = 'text-sm font-bold text-blue-700';
                feedbackHint.className = 'text-xs text-blue-600 mt-1';
            } else {
                feedbackDiv.className = 'mb-4 p-4 rounded-2xl text-center bg-purple-50 border-2 border-purple-200';
                feedbackMessage.className = 'text-sm font-bold text-purple-700';
                feedbackHint.className = 'text-xs text-purple-600 mt-1';
            }
            
            feedbackDiv.classList.remove('hidden');
            
            // Auto-ocultar después de 5 segundos
            setTimeout(() => {
                if (feedbackDiv) feedbackDiv.classList.add('hidden');
            }, 5000);
        }
        return;
    }
    
    try {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        showNotification(`📄 Generando PDF de ${label}...`, 'success');
        const pdfResult = await generatePDFReport(filtered, viewDateForPDF, label, rangeLabel);
        if (pdfResult) {
            const { doc, monthName: pdfMonth, year: pdfYear } = pdfResult;
            const suffix = rangeLabel ? rangeLabel.replace(/[\/\s-]/g, '_') : `${pdfMonth}-${pdfYear}`;
            const fileName = `Reporte-${label.toLowerCase()}-${suffix}.pdf`;
            if (isMobile) {
                const pdfUrl = doc.output('bloburl');
                window.open(pdfUrl, '_blank');
                showNotification('📱 PDF abierto en nueva pestaña', 'success');
            } else {
                doc.save(fileName);
                showNotification(`📄 PDF de ${label} descargado exitosamente`, 'success');
            }
            return;
        }
    } catch (error) {
        showNotification(`⚠️ Error generando PDF de ${label}, descargando archivo de texto`, 'error');
        console.error('PDF Error:', error);
    }
    // Fallback to text report if PDF fails
    const incomeItems = filtered.filter(i => i.type === 'income');
    const expenseItems = filtered.filter(i => i.type === 'expense' || !i.type);
    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalIncome - totalExpenses;
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = months[viewDateForPDF.getMonth()];
    const year = viewDateForPDF.getFullYear();
    const periodTitle = rangeLabel || `${monthName} ${year}`;
    let report = `REPORTE FINANCIERO - ${periodTitle.toUpperCase()} (${label})\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `RESUMEN:\n`;
    report += `  Saldo Final: ${formatMoney(balance)}\n`;
    report += `  Ingresos:    ${formatMoney(totalIncome)}\n`;
    report += `  Gastos:      ${formatMoney(totalExpenses)}\n`;
    report += `  Movimientos: ${filtered.length}\n\n`;
    if (filtered.length > 0) {
        report += `DETALLE DE MOVIMIENTOS:\n`;
        report += `${'-'.repeat(50)}\n`;
        filtered.forEach(item => {
            const type = item.type === 'income' ? 'INGRESO' : 'GASTO';
            report += `${item.date} | ${type} | ${formatMoney(item.amount)}\n`;
            report += `  ${item.concept}\n`;
        });
    }
    report += `\n${'-'.repeat(50)}\n`;
    report += `Generado: ${new Date().toLocaleString('es-ES')}\n`;
    report += `Foresight Finanzas - Control Simple y Efectivo\n`;
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileSuffix = rangeLabel ? rangeLabel.replace(/[\/\s-]/g, '_') : `${monthName}-${year}`;
    a.download = `reporte-${label.toLowerCase()}-${fileSuffix}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification(`📄 Reporte de texto de ${label} descargado`, 'success');
}

export function showConsolidatedReport() {
    const startInput = document.getElementById('consolidated-start');
    const endInput = document.getElementById('consolidated-end');
    const summaryEl = document.getElementById('consolidated-summary');

    if (!startInput || !endInput || !summaryEl) return;

    const startValue = startInput.value;
    const endValue = endInput.value;

    if (!startValue || !endValue) {
        summaryEl.innerHTML = 'Selecciona un rango completo para ver el consolidado.';
        return;
    }

    const start = new Date(`${startValue}-01T12:00:00`);
    const end = new Date(`${endValue}-01T12:00:00`);
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

    while (cursor <= end) {
        months.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }

    let totalIncome = 0;
    let totalExpenses = 0;
    let transactionCount = 0;

    months.forEach(monthDate => {
        const monthTransactions = AppState.expenses.filter(item => {
            const d = new Date(item.date);
            return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth();
        });
        totalIncome += monthTransactions.filter(i => i.type === 'income').reduce((sum, item) => sum + item.amount, 0);
        totalExpenses += monthTransactions.filter(i => i.type === 'expense' || !i.type).reduce((sum, item) => sum + item.amount, 0);
        transactionCount += monthTransactions.length;
    });

    const balance = totalIncome - totalExpenses;
    const monthLabel = months.length === 1
        ? `${months[0].toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`
        : `${months[0].toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })} - ${months[months.length - 1].toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;

    summaryEl.innerHTML = `
        <div class="space-y-2">
            <p class="text-[10px] uppercase tracking-wider text-gray-400">${monthLabel}</p>
            <p class="text-sm font-black text-gray-800">Saldo: ${formatMoney(balance)}</p>
            <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div class="rounded-lg bg-green-50 p-2 text-green-700">Ingresos: ${formatMoney(totalIncome)}</div>
                <div class="rounded-lg bg-red-50 p-2 text-red-700">Gastos: ${formatMoney(totalExpenses)}</div>
            </div>
            <p class="text-[10px] text-gray-500">${transactionCount} movimientos en el rango</p>
        </div>
    `;
}

export function openReportModal() {
    // Resetear filtro de rango de fechas
    reportDateFilter = null;
    const startInput = document.getElementById('report-date-start');
    const endInput = document.getElementById('report-date-end');
    const rangeSummary = document.getElementById('report-range-summary');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    if (rangeSummary) rangeSummary.classList.add('hidden');
    
    // Ocultar mensaje de feedback previo
    const feedbackDiv = document.getElementById('report-feedback');
    if (feedbackDiv) feedbackDiv.classList.add('hidden');
    
    const monthly = getMonthlyData();
    const incomeItems = monthly.filter(i => i.type === 'income');
    const expenseItems = monthly.filter(i => i.type === 'expense' || !i.type);
    
    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalIncome - totalExpenses;
    
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = months[AppState.currentViewDate.getMonth()];
    const year = AppState.currentViewDate.getFullYear();
    
    const reportMonthEl = document.getElementById('report-month');
    const reportBalanceEl = document.getElementById('report-balance');
    const reportIncomeEl = document.getElementById('report-income');
    const reportExpensesEl = document.getElementById('report-expenses');
    const reportCountEl = document.getElementById('report-count');
    
    if (reportMonthEl) reportMonthEl.textContent = `${monthName} ${year}`;
    if (reportBalanceEl) reportBalanceEl.textContent = formatMoney(balance);
    if (reportIncomeEl) reportIncomeEl.textContent = formatMoney(totalIncome);
    if (reportExpensesEl) reportExpensesEl.textContent = formatMoney(totalExpenses);
    if (reportCountEl) reportCountEl.textContent = `${monthly.length} movimiento${monthly.length !== 1 ? 's' : ''} registrado${monthly.length !== 1 ? 's' : ''}`;
    
    toggleReportModal(true);
}

export function toggleReportModal(show) {
    const modal = document.getElementById('report-modal');
    const panel = document.getElementById('report-panel');
    if (!modal || !panel) return;
    
    if (show) {
        modal.classList.remove('invisible', 'opacity-0');
        panel.classList.remove('scale-90');
        panel.classList.add('scale-100');
    } else {
        modal.classList.add('invisible', 'opacity-0');
        panel.classList.remove('scale-100');
        panel.classList.add('scale-90');
    }
}

// SUMMARY MODAL FUNCTION
export function toggleSummary(show) {
    const modal = document.getElementById('summary-modal');
    const panel = document.getElementById('summary-panel');
    if(!modal || !panel) return;
    
    if(show) {
        modal.classList.remove('invisible', 'opacity-0');
        panel.classList.remove('translate-y-full');
    } else {
        modal.classList.add('invisible', 'opacity-0');
        panel.classList.add('translate-y-full');
    }
}
