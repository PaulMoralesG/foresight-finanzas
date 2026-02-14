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
// 🎨 INICIALIZACIÓN
// ================================================================
export function initFeatures() {
    initDarkMode();
}

// Exponer funciones globalmente
window.updateExpenseChart = updateExpenseChart;
