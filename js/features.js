import { AppState } from './state.js';
import { showNotification } from './utils.js';
import * as Auth from './auth.js';

// ================================================================
// 📊 GRÁFICO DE GASTOS
// ================================================================
let expenseChart = null;
export function updateExpenseChart() {
    const canvas = document.getElementById('expense-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
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
        ctx.fillStyle = '#6B7280';
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
                borderColor: '#FFFFFF'
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
                        color: '#1C1C1E'
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
// 🎨 INICIALIZACIÓN
// ================================================================
export function initFeatures() {
    // Características inicializadas
}

// Exponer funciones globalmente
window.updateExpenseChart = updateExpenseChart;
