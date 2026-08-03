// ================================================================
// TIPOS GLOBALES DE LA APLICACIÓN
// ================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type BusinessType = 'business' | 'personal';
export type TabId = 'home' | 'movements' | 'stats' | 'profile';
export type FilterType = 'all' | 'income' | 'expense' | 'business' | 'personal';

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  concept: string;
  date: string; // ISO format "YYYY-MM-DD"
  category: string;
  method: PaymentMethod;
  businessType: BusinessType;
  created_at?: string;
}

export interface PaymentReminder {
  id: number;
  concept: string;
  amount: number;
  dueDate: string; // ISO format "YYYY-MM-DD"
  category: string;
  businessType: BusinessType;
  method: PaymentMethod;
  isPaid: boolean;
  notes?: string;
  createdAt: string;
}

export interface MonthlyBudget {
  [key: string]: number; // "2026-07": 5000
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface SavingsGoal {
  concept: string;
  target: number;
}
