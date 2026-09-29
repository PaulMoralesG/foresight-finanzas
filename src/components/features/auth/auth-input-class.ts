/** Clase del input de los formularios de acceso; con error, borde y anillo de gasto. */
export function authInputClass(hasError: boolean): string {
  return `saas-input ${hasError ? '!border-expense-500 !ring-expense-500/20 focus:!ring-expense-500/30' : ''}`;
}
