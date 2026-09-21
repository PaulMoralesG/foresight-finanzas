// ================================================================
// TIPOS GLOBALES DE LA APLICACIÓN
// ================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /**
   * Correo nuevo, todavía sin confirmar (viene de `session.user.new_email`
   * de Supabase). Supabase exige verificar tanto el correo viejo como el
   * nuevo antes de aplicar el cambio; mientras tanto, esto es lo único que
   * recuerda que hay un cambio a medias — sin esto, solo quedaba un toast de
   * 5 segundos y ningún rastro si el usuario cerraba la pestaña antes de leerlo.
   */
  pendingEmail?: string;
}

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type BusinessType = 'business' | 'personal';
/** Las 8 vistas, en dos secciones (ver src/config/views.ts). */
export type TabId =
  | 'home'
  | 'movements'
  | 'budgets'
  | 'debts'
  | 'goals'
  | 'networth'
  | 'accounts'
  | 'settings';
export type FilterType = 'all' | 'income' | 'expense' | 'business' | 'personal';

export interface Transaction {
  id: string; // UUID
  type: TransactionType;
  amount: number;
  concept: string;
  date: string; // ISO format "YYYY-MM-DD"
  category: string;
  method: PaymentMethod;
  businessType: BusinessType;
  created_at?: string;
  updated_at: string; // ISO — usado por el merge de sync
}

export interface MonthlyBudget {
  [key: string]: number; // "2026-07": 5000
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
  /** ISO — usado por el merge de sync. Las categorías por defecto no lo tienen. */
  updated_at?: string;
}

export interface SavingsGoal {
  id: string; // UUID
  concept: string;
  target: number;
  updated_at: string; // ISO — usado por el merge de sync
}
