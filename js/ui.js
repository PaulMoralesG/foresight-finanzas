import { AppState, setViewDate, setFilter } from './state.js';
import { formatMoney, showNotification, runAsyncAction } from './utils.js';
import { getCategories } from './config-loader.js';
import { saveData, logout } from './auth.js';
import { generatePDFReport } from './pdf-generator.js';

// Variables globales para configuración cargada dinámicamente
let EXPENSE_CATEGORIES = [];
let INCOME_CATEGORIES = [];
let getCategoryById = () => ({ label: 'Cargando...', icon: '⏳', color: 'bg-gray-100 text-gray-600' });

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
    
    // Saldo Disponible = Ingresos - Gastos (sin incluir presupuesto)
    const available = totalIncome - totalSpent;

    // Visuals
    DOM.availableDisplay.textContent = formatMoney(available);
    DOM.dashIncome.textContent = formatMoney(totalIncome);
    DOM.dashExpense.textContent = formatMoney(totalSpent);
    
    // Actualizar Utilidad del Mes
    updateProfitDisplay(totalIncome, totalSpent);
    
    // Actualizar Comparación Mes a Mes
    updateMonthlyGrowth(totalIncome);
    
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

// Actualizar visualización de utilidad (lenguaje simple para emprendedores)
function updateProfitDisplay(totalIncome, totalSpent) {
    const profitAmount = totalIncome - totalSpent;
    const profitMargin = totalIncome > 0 ? ((profitAmount / totalIncome) * 100).toFixed(1) : 0;
    
    // Elementos del DOM
    const profitAmountEl = document.getElementById('profit-amount');
    const profitStatusEl = document.getElementById('profit-status');
    const profitEmojiEl = document.getElementById('profit-emoji');
    const profitMarginEl = document.getElementById('profit-margin');
    
    if (!profitAmountEl) return; // Si no existe el elemento, salir
    
    // Actualizar monto
    profitAmountEl.textContent = formatMoney(profitAmount);
    
    // Actualizar margen
    profitMarginEl.textContent = `Margen: ${profitMargin}%`;
    
    // Determinar estado y estilo según la utilidad
    if (profitAmount > 0) {
        profitAmountEl.className = 'text-2xl font-black leading-none mb-1 text-green-600';
        profitStatusEl.textContent = '¡Estás ganando! 🎉';
        profitStatusEl.className = 'text-[10px] font-bold text-green-600';
        profitEmojiEl.textContent = '📈';
    } else if (profitAmount < 0) {
        profitAmountEl.className = 'text-2xl font-black leading-none mb-1 text-red-600';
        profitStatusEl.textContent = 'Estás perdiendo dinero ⚠️';
        profitStatusEl.className = 'text-[10px] font-bold text-red-600';
        profitEmojiEl.textContent = '📉';
    } else {
        profitAmountEl.className = 'text-2xl font-black leading-none mb-1 text-gray-700';
        profitStatusEl.textContent = 'Sin movimientos aún';
        profitStatusEl.className = 'text-[10px] font-bold text-gray-500';
        profitEmojiEl.textContent = '💰';
    }
}

// Actualizar comparación mes a mes (para emprendedores: ¿estoy creciendo?)
function updateMonthlyGrowth(currentIncome) {
    const growthPercentageEl = document.getElementById('growth-percentage');
    const growthStatusEl = document.getElementById('growth-status');
    const growthEmojiEl = document.getElementById('growth-emoji');
    const growthBadgeEl = document.getElementById('growth-badge');
    const currentMonthIncomeEl = document.getElementById('current-month-income');
    const lastMonthIncomeEl = document.getElementById('last-month-income');
    
    if (!growthPercentageEl) return; // Si no existe el elemento, salir
    
    // Obtener datos del mes anterior
    const previousMonthData = getPreviousMonthData();
    const previousIncome = previousMonthData
        .filter(i => i.type === 'income')
        .reduce((sum, item) => sum + item.amount, 0);
    
    // Actualizar valores
    currentMonthIncomeEl.textContent = formatMoney(currentIncome);
    lastMonthIncomeEl.textContent = formatMoney(previousIncome);
    
    // Calcular crecimiento
    if (previousIncome === 0 && currentIncome === 0) {
        // Sin datos
        growthPercentageEl.textContent = '0%';
        growthPercentageEl.className = 'text-2xl font-black leading-none text-gray-500';
        growthStatusEl.textContent = 'Sin datos del mes pasado';
        growthEmojiEl.textContent = '📊';
        growthBadgeEl.textContent = 'Sin datos';
        growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500';
    } else if (previousIncome === 0) {
        // Primer mes con ingresos
        growthPercentageEl.textContent = '🎉 Nuevo';
        growthPercentageEl.className = 'text-2xl font-black leading-none text-blue-600';
        growthStatusEl.textContent = '¡Primeros ingresos!';
        growthEmojiEl.textContent = '🚀';
        growthBadgeEl.textContent = '¡Comenzando!';
        growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600';
    } else {
        // Calcular porcentaje de crecimiento
        const growthPercentage = ((currentIncome - previousIncome) / previousIncome * 100).toFixed(1);
        const absGrowth = Math.abs(parseFloat(growthPercentage));
        
        if (growthPercentage > 0) {
            // Creciendo
            growthPercentageEl.textContent = `+${absGrowth}%`;
            growthPercentageEl.className = 'text-2xl font-black leading-none text-green-600';
            growthStatusEl.textContent = absGrowth > 10 ? '¡Excelente crecimiento! 🎉' : '¡Vas creciendo! 👍';
            growthEmojiEl.textContent = '📈';
            growthBadgeEl.textContent = 'Creciendo';
            growthBadgeEl.className = 'text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-600';
        } else if (growthPercentage < 0) {
            // Decreciendo
            growthPercentageEl.textContent = `-${absGrowth}%`;
            growthPercentageEl.className = 'text-2xl font-black leading-none text-orange-600';
            growthStatusEl.textContent = '¡Hay que mejorar las ventas!';
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
            DOM.dateInput.value = getTodayISO();
            selectCategory('comida', DOM.categoryGrid.firstChild);
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
    } catch(e) { 
        DOM.dateInput.value = getTodayISO();
    }

    const type = item.type || 'expense';
    setTransactionType(type);
    
    // Restore Business Type
    const businessType = item.businessType || 'business';
    setBusinessType(businessType);
    
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

// REPORT MODAL FUNCTIONS
export function toggleReportModal(show) {
    const modal = document.getElementById('report-modal');
    const panel = document.getElementById('report-panel');
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

export function openReportModal() {
    const monthly = getMonthlyData();
    const incomeItems = monthly.filter(i => i.type === 'income');
    const expenseItems = monthly.filter(i => i.type === 'expense' || !i.type);
    
    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalIncome - totalExpenses;
    
    // Populate modal
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = months[AppState.currentViewDate.getMonth()];
    const year = AppState.currentViewDate.getFullYear();
    
    document.getElementById('report-month').textContent = `${monthName} ${year}`;
    document.getElementById('report-balance').textContent = formatMoney(balance);
    document.getElementById('report-income').textContent = formatMoney(totalIncome);
    document.getElementById('report-expenses').textContent = formatMoney(totalExpenses);
    document.getElementById('report-count').textContent = `${monthly.length} movimiento${monthly.length !== 1 ? 's' : ''} registrado${monthly.length !== 1 ? 's' : ''}`;
    
    toggleReportModal(true);
}

export async function downloadReport() {
    const monthly = getMonthlyData();
    
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = months[AppState.currentViewDate.getMonth()];
    const year = AppState.currentViewDate.getFullYear();
    
    // Try to generate PDF first
    try {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        showNotification('📄 Generando PDF profesional...', 'success');
        const pdfResult = await generatePDFReport(monthly, AppState.currentViewDate);
        
        if (pdfResult) {
            const { doc, monthName: pdfMonth, year: pdfYear } = pdfResult;
            const fileName = `Reporte-${pdfMonth}-${pdfYear}.pdf`;
            
            if (isMobile) {
                // Mobile: Open in new tab for viewing
                const pdfUrl = doc.output('bloburl');
                window.open(pdfUrl, '_blank');
                showNotification('📱 PDF abierto en nueva pestaña', 'success');
            } else {
                // Desktop: Download file
                doc.save(fileName);
                showNotification('📄 PDF descargado exitosamente', 'success');
            }
            return;
        }
    } catch (error) {
        showNotification('⚠️ Error generando PDF, descargando archivo de texto', 'error');
        console.error('PDF Error:', error);
    }
    
    // Fallback to text report if PDF fails
    const incomeItems = monthly.filter(i => i.type === 'income');
    const expenseItems = monthly.filter(i => i.type === 'expense' || !i.type);
    
    const totalIncome = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalIncome - totalExpenses;
    
    let report = `REPORTE FINANCIERO - ${monthName.toUpperCase()} ${year}\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `RESUMEN:\n`;
    report += `  Saldo Final: ${formatMoney(balance)}\n`;
    report += `  Ingresos:    ${formatMoney(totalIncome)}\n`;
    report += `  Gastos:      ${formatMoney(totalExpenses)}\n`;
    report += `  Movimientos: ${monthly.length}\n\n`;
    
    if (monthly.length > 0) {
        report += `DETALLE DE MOVIMIENTOS:\n`;
        report += `${'-'.repeat(50)}\n`;
        
        monthly.forEach(item => {
            const type = item.type === 'income' ? 'INGRESO' : 'GASTO';
            const cat = getCategoryById(item.category);
            report += `${item.date} | ${type} | ${formatMoney(item.amount)}\n`;
            report += `  ${item.concept} (${cat.label})\n`;
        });
    }
    
    report += `\n${'-'.repeat(50)}\n`;
    report += `Generado: ${new Date().toLocaleString('es-ES')}\n`;
    report += `Foresight Finanzas - Control Simple y Efectivo\n`;
    
    // Download as text file
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-${monthName}-${year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('📄 Reporte de texto descargado', 'success');
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
