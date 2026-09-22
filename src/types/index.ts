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

/** `transfer` mueve dinero entre dos cuentas sin contar como gasto ni ingreso. */
export type TransactionType = 'income' | 'expense' | 'transfer';
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
/** Ámbito global (Todo / Personal / Negocio), el segmentado de la cabecera. */
export type Ambito = 'all' | 'personal' | 'business';

export interface Transaction {
  id: string; // UUID
  type: TransactionType;
  amount: number;
  concept: string;
  date: string; // ISO format "YYYY-MM-DD"
  category: string;
  method: PaymentMethod;
  businessType: BusinessType;
  /** Cuenta de la que sale (gasto), a la que entra (ingreso) o de origen (transferencia). */
  accountId?: string | null;
  /** Solo en transferencias: cuenta destino. */
  toAccountId?: string | null;
  /** Si salió de una recurrencia, el id de la regla que la generó. */
  recurrenceId?: string | null;
  created_at?: string;
  updated_at: string; // ISO — usado por el merge de sync
}

export type AccountKind = 'Efectivo' | 'Banco' | 'Tarjeta' | 'Ahorros';

/** Cuenta (Balance Dual: `accounts`). El saldo se deriva: saldo inicial + movimientos. */
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Lo que ya había en la cuenta al darla de alta; no vuelve a contarse en el patrimonio. */
  initialBalance: number;
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
  /** Grupo al que pertenece (Balance Dual: "Gastos Básicos", "Suscripciones"…). Sin grupo = "Otros". */
  group?: string;
  /** ISO — usado por el merge de sync. Las categorías por defecto no lo tienen. */
  updated_at?: string;
}

/**
 * Meta de ahorro (Balance Dual: `goals`). `saved` es el total ahorrado,
 * un número que la propia meta lleva (no se deriva escaneando gastos por
 * texto); `savedFromAccounts` es la parte de `saved` que salió realmente
 * de una cuenta, la que cuenta para el patrimonio (lib/networth.ts) — un
 * aporte "solo para registrar avance" no resta de ningún saldo, así que
 * no debe sumarse dos veces.
 */
export interface SavingsGoal {
  id: string; // UUID
  concept: string; // nombre de la meta
  tag: BusinessType;
  target: number;
  /** Mes objetivo 'YYYY-MM', o null si no se fija fecha. */
  targetDate: string | null;
  saved: number;
  savedFromAccounts: number;
  updated_at: string; // ISO — usado por el merge de sync
}

export type DebtKind = 'Tarjeta de crédito' | 'Préstamo' | 'Hipoteca' | 'Otro';
export type DebtMethod = 'snowball' | 'avalanche';

/** Deuda (Balance Dual: `debts`). El saldo baja con cada pago registrado. */
export interface Debt {
  id: string;
  name: string;
  tag: BusinessType;
  kind: DebtKind;
  balance: number;
  /** Interés anual en %, p. ej. 22. */
  annualRate: number;
  minPayment: number;
  /** Día del mes en que se paga, 1–31, o null. */
  payDay: number | null;
  updated_at: string; // ISO — usado por el merge de sync
}

/** Ajustes sincronizados (Balance Dual: `meta/settings`). Una sola fila por usuario. */
export interface Settings {
  debtMethod: DebtMethod;
  extraPayment: number;
  netWorthGoal: number;
  updated_at: string; // ISO — el más nuevo gana en el merge
}

export type AssetGroup = 'Inversiones' | 'Propiedades' | 'Otros activos';

/** Activo manual (Balance Dual: `assets`): lo que la app no ve en las cuentas. */
export interface Asset {
  id: string;
  name: string;
  tag: BusinessType;
  group: AssetGroup;
  value: number;
  updated_at: string; // ISO — usado por el merge de sync
}

/** Cierre mensual del patrimonio (Balance Dual: `networth`). Clave: el mes. */
export interface NetWorthSnapshot {
  month: string; // 'YYYY-MM'
  assets: number;
  liabilities: number;
  net: number;
  updated_at: string; // ISO — el más nuevo gana en el merge
}

/**
 * Presupuesto por categoría (Balance Dual: `budgets`). `limit` es el
 * límite base mensual; `plan` guarda el monto planificado de los meses
 * que se apartan de esa base ('YYYY-MM' → monto).
 */
export interface BudgetLine {
  id: string;
  tag: BusinessType;
  kind: 'income' | 'expense';
  categoryId: string;
  limit: number;
  plan: Record<string, number>;
  updated_at: string; // ISO — usado por el merge de sync
}

/** Con qué cadencia se repite un movimiento. */
export type Frecuencia = 'daily' | 'weekly' | 'monthly';

/**
 * Plantilla de un movimiento que se repite (la renta, el sueldo, una
 * suscripción). El store la materializa en transacciones reales; cada
 * ocurrencia lleva un id determinista derivado de (regla, fecha), que es lo
 * que impide duplicarla al reabrir la app o al abrirla en dos dispositivos.
 */
export interface Recurrence {
  id: string;
  // Plantilla del movimiento
  type: TransactionType;
  amount: number;
  concept: string;
  category: string;
  method: PaymentMethod;
  businessType: BusinessType;
  accountId?: string | null;
  toAccountId?: string | null;
  // Regla
  frecuencia: Frecuencia;
  /** Cada cuántos días/semanas/meses; mínimo 1. */
  intervalo: number;
  /** Día del mes en las mensuales (1–31; se recorta a la longitud del mes). */
  diaMes: number | null;
  /** Primera fecha posible, 'YYYY-MM-DD'. */
  desde: string;
  /** Última fecha posible inclusive, o null si no termina. */
  hasta: string | null;
  activa: boolean;
  /** Marca de agua: última fecha ya materializada. */
  ultimaGenerada: string | null;
  updated_at: string; // ISO — usado por el merge de sync
}
