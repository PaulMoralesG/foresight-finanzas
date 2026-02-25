// ESTADO DE LA APLICACIÓN
export const AppState = {
    currentUser: null,
    currentViewDate: new Date(),
    budgets: {},  // Formato: { "YYYY-MM": valor }
    expenses: [],
    currentFilter: 'all'
};

export function setCurrentUser(user) {
    AppState.currentUser = user;
}

export function setState(newState) {
    if(newState.budgets !== undefined) AppState.budgets = newState.budgets;
    if(newState.expenses !== undefined) AppState.expenses = newState.expenses;
}

// Obtener presupuesto del mes actual visualizado
export function getCurrentMonthBudget() {
    const monthKey = getMonthKey(AppState.currentViewDate);
    return AppState.budgets[monthKey] || 0;
}

// Establecer presupuesto para el mes actual visualizado
export function setCurrentMonthBudget(value) {
    const monthKey = getMonthKey(AppState.currentViewDate);
    AppState.budgets[monthKey] = value;
}

// Generar clave de mes en formato YYYY-MM
function getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

export function setViewDate(step) {
    AppState.currentViewDate.setMonth(AppState.currentViewDate.getMonth() + step);
}

export function setFilter(filter) {
    AppState.currentFilter = filter;
}