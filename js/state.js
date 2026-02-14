// ESTADO DE LA APLICACIÓN
export const AppState = {
    currentUser: null,
    currentViewDate: new Date(),
    budget: 0,
    expenses: [],
    currentFilter: 'all'
};

export function setCurrentUser(user) {
    AppState.currentUser = user;
}

export function setState(newState) {
    if(newState.budget !== undefined) AppState.budget = newState.budget;
    if(newState.expenses !== undefined) AppState.expenses = newState.expenses;
}

export function setViewDate(step) {
    AppState.currentViewDate.setMonth(AppState.currentViewDate.getMonth() + step);
}

export function setFilter(filter) {
    AppState.currentFilter = filter;
}