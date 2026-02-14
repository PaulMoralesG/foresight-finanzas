import { AppState } from './state.js';
import { showNotification } from './utils.js';
import * as Auth from './auth.js';

// ================================================================
// 🌙 MODO OSCURO
// ================================================================
let expenseChart = null;

export function initDarkMode() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateThemeIcon(isDark);
            
            // Recrear gráfico con nuevo tema
            if (expenseChart) {
                updateExpenseChart();
            }
        });
    }
}

function updateThemeIcon(isDark) {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (isDark) {
            icon.className = 'fa-solid fa-sun';
            themeToggle.classList.remove('hover:text-yellow-500');
            themeToggle.classList.add('hover:text-orange-400');
        } else {
            icon.className = 'fa-solid fa-moon';
            themeToggle.classList.remove('hover:text-orange-400');
            themeToggle.classList.add('hover:text-yellow-500');
        }
    }
}

// ================================================================
// 📊 GRÁFICO DE GASTOS
// ================================================================
export function updateExpenseChart() {
    const canvas = document.getElementById('expense-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const isDark = document.body.classList.contains('dark-mode');
    
    // Filtrar solo gastos del mes actual
    const expenses = AppState.expenses.filter(e => 
        e.type === 'expense' && 
        new Date(e.date).getMonth() === AppState.currentMonth &&
        new Date(e.date).getFullYear() === AppState.currentYear
    );
    
    // Agrupar por categoría
    const categoryTotals = {};
    expenses.forEach(expense => {
        const cat = expense.category || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + expense.amount;
    });
    
    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);
    
    // Colores vibrantes para el gráfico
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384',
        '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
    ];
    
    // Destruir gráfico anterior si existe
    if (expenseChart) {
        expenseChart.destroy();
    }
    
    if (labels.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '14px Nunito';
        ctx.fillStyle = isDark ? '#AEAEB2' : '#6B7280';
        ctx.textAlign = 'center';
        ctx.fillText('No hay datos para mostrar', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: isDark ? '#1C1C1E' : '#FFFFFF'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 11,
                            family: 'Nunito',
                            weight: 'bold'
                        },
                        color: isDark ? '#F2F2F7' : '#1C1C1E'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: $${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ================================================================
// 📥 EXPORTAR A EXCEL
// ================================================================
export function exportToExcel() {
    if (!window.XLSX) {
        showNotification('Error: Librería Excel no cargada', 'error');
        return;
    }
    
    try {
        // Preparar datos para Excel
        const expenses = AppState.expenses.map(e => ({
            'Fecha': new Date(e.date).toLocaleDateString('es-ES'),
            'Tipo': e.type === 'expense' ? 'Gasto' : 'Ingreso',
            'Categoría': e.category,
            'Concepto': e.concept || 'Sin descripción',
            'Monto': e.amount,
            'Método': e.method || 'N/A'
        }));
        
        // Crear resumen
        const totalIncome = AppState.expenses
            .filter(e => e.type === 'income')
            .reduce((sum, e) => sum + e.amount, 0);
        
        const totalExpense = AppState.expenses
            .filter(e => e.type === 'expense')
            .reduce((sum, e) => sum + e.amount, 0);
        
        const summary = [
            { 'Concepto': 'Total Ingresos', 'Monto': totalIncome },
            { 'Concepto': 'Total Gastos', 'Monto': totalExpense },
            { 'Concepto': 'Balance', 'Monto': totalIncome - totalExpense },
            { 'Concepto': 'Presupuesto', 'Monto': AppState.budget }
        ];
        
        // Crear libro de Excel
        const wb = window.XLSX.utils.book_new();
        
        // Hoja 1: Transacciones
        const ws1 = window.XLSX.utils.json_to_sheet(expenses);
        window.XLSX.utils.book_append_sheet(wb, ws1, 'Transacciones');
        
        // Hoja 2: Resumen
        const ws2 = window.XLSX.utils.json_to_sheet(summary);
        window.XLSX.utils.book_append_sheet(wb, ws2, 'Resumen');
        
        // Generar archivo
        const fileName = `Foresight_Reporte_${new Date().toISOString().split('T')[0]}.xlsx`;
        window.XLSX.writeFile(wb, fileName);
        
        showNotification('✅ Reporte exportado exitosamente', 'success');
    } catch (error) {
        console.error('Error exportando:', error);
        showNotification('Error al generar el reporte', 'error');
    }
}

// ================================================================
// 🎯 METAS DE AHORRO
// ================================================================
let currentGoals = [];

export async function loadGoals() {
    // Las metas se guardan en el perfil del usuario
    if (AppState.currentUser && AppState.currentUser.goals) {
        currentGoals = AppState.currentUser.goals;
        renderGoals();
    }
}

export function openGoalModal() {
    const modal = document.getElementById('goal-modal');
    const panel = document.getElementById('goal-panel');
    
    // Reset form
    document.getElementById('goal-form').reset();
    
    modal.classList.remove('invisible', 'opacity-0');
    setTimeout(() => {
        panel.classList.remove('scale-90');
        panel.classList.add('scale-100');
    }, 10);
}

export function toggleGoalModal(show) {
    const modal = document.getElementById('goal-modal');
    const panel = document.getElementById('goal-panel');
    
    if (!show) {
        panel.classList.remove('scale-100');
        panel.classList.add('scale-90');
        setTimeout(() => {
            modal.classList.add('invisible', 'opacity-0');
        }, 200);
    } else {
        openGoalModal();
    }
}

export async function saveGoal(event) {
    event.preventDefault();
    
    const name = document.getElementById('goal-name').value;
    const amount = parseFloat(document.getElementById('goal-amount').value);
    const date = document.getElementById('goal-date').value;
    
    const newGoal = {
        id: Date.now(),
        name,
        targetAmount: amount,
        currentAmount: 0,
        deadline: date,
        createdAt: new Date().toISOString()
    };
    
    currentGoals.push(newGoal);
    
    // Guardar en perfil del usuario
    if (AppState.currentUser) {
        AppState.currentUser.goals = currentGoals;
        await Auth.saveData();
    }
    
    renderGoals();
    toggleGoalModal(false);
    showNotification('🎯 Meta creada exitosamente', 'success');
}

export async function deleteGoal(goalId) {
    currentGoals = currentGoals.filter(g => g.id !== goalId);
    
    if (AppState.currentUser) {
        AppState.currentUser.goals = currentGoals;
        await Auth.saveData();
    }
    
    renderGoals();
    showNotification('Meta eliminada', 'success');
}

function renderGoals() {
    const container = document.getElementById('goals-list');
    if (!container) return;
    
    if (currentGoals.length === 0) {
        container.innerHTML = '<p class="text-center py-8 text-gray-400 text-sm">Créate metas para ahorrar 🎯</p>';
        return;
    }
    
    container.innerHTML = currentGoals.map(goal => {
        const progress = (goal.currentAmount / goal.targetAmount) * 100;
        const daysLeft = Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        
        return `
            <div class="bg-gradient-to-br from-blue-50 to-purple-50 p-4 rounded-2xl border border-blue-100">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-bold text-gray-900 mb-1">${goal.name}</p>
                        <p class="text-xs text-gray-500">${daysLeft > 0 ? `${daysLeft} días restantes` : 'Vencida'}</p>
                    </div>
                    <button onclick="window.deleteGoal(${goal.id})" class="text-red-400 hover:text-red-600">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
                <div class="mb-2">
                    <div class="flex justify-between text-xs font-bold mb-1">
                        <span class="text-blue-600">$${goal.currentAmount.toFixed(2)}</span>
                        <span class="text-gray-600">$${goal.targetAmount.toFixed(2)}</span>
                    </div>
                    <div class="w-full h-2 bg-white rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all" style="width: ${Math.min(progress, 100)}%"></div>
                    </div>
                </div>
                <p class="text-xs font-bold text-purple-600">${progress.toFixed(1)}% completado</p>
            </div>
        `;
    }).join('');
}

// ================================================================
// 🎨 INICIALIZACIÓN
// ================================================================
export function initFeatures() {
    initDarkMode();
    
    // Setup goal form
    const goalForm = document.getElementById('goal-form');
    if (goalForm) {
        goalForm.addEventListener('submit', saveGoal);
    }
    
    // Cargar metas si hay usuario
    if (AppState.currentUser) {
        loadGoals();
    }
}

// Exponer funciones globalmente
window.exportToExcel = exportToExcel;
window.openGoalModal = openGoalModal;
window.toggleGoalModal = toggleGoalModal;
window.deleteGoal = deleteGoal;
window.updateExpenseChart = updateExpenseChart;
