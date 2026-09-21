// ================================================================
// VISTAS — el catálogo de pantallas, en un solo sitio
//
// Misma estructura que Balance Dual: ocho vistas en dos secciones. Sidebar
// (escritorio) y TabBar (móvil) leen de aquí; ninguno tiene su propia lista.
// ================================================================

import {
  LayoutGrid,
  ArrowLeftRight,
  Target,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Wallet,
  Settings,
} from '@/components/ui/icons.generated';
import type { IconComponent } from '@/components/ui/Icon';
import type { TabId } from '@/types';

export type SeccionId = 'dia-a-dia' | 'patrimonio';

export interface Vista {
  id: TabId;
  label: string;
  icon: IconComponent;
  seccion: SeccionId;
  /** Una línea para el encabezado de la página. */
  descripcion: string;
}

export const SECCIONES: { id: SeccionId; label: string }[] = [
  { id: 'dia-a-dia', label: 'Día a día' },
  { id: 'patrimonio', label: 'Patrimonio' },
];

export const VIEWS: Vista[] = [
  { id: 'home', label: 'Resumen', icon: LayoutGrid, seccion: 'dia-a-dia', descripcion: 'Cómo va el mes, de un vistazo.' },
  { id: 'movements', label: 'Movimientos', icon: ArrowLeftRight, seccion: 'dia-a-dia', descripcion: 'Todo lo que entra y sale.' },
  { id: 'budgets', label: 'Presupuestos', icon: Target, seccion: 'dia-a-dia', descripcion: 'Plan del mes, plan del año y reporte anual.' },
  { id: 'debts', label: 'Deudas', icon: CreditCard, seccion: 'patrimonio', descripcion: 'Lo que debes y cuándo terminas de pagarlo.' },
  { id: 'goals', label: 'Metas', icon: PiggyBank, seccion: 'patrimonio', descripcion: 'Lo que estás ahorrando y para qué.' },
  { id: 'networth', label: 'Patrimonio', icon: TrendingUp, seccion: 'patrimonio', descripcion: 'Lo que tienes menos lo que debes, mes a mes.' },
  { id: 'accounts', label: 'Cuentas', icon: Wallet, seccion: 'patrimonio', descripcion: 'Dónde está tu dinero.' },
  { id: 'settings', label: 'Ajustes', icon: Settings, seccion: 'patrimonio', descripcion: 'Tu cuenta, tus categorías y tus copias de seguridad.' },
];

/** Las cuatro que caben en la barra inferior del móvil; el resto va en "Más". */
export const MOBILE_TABS: TabId[] = ['home', 'movements', 'budgets', 'networth'];

export const vistaPorId = (id: TabId): Vista => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

/**
 * Ids de pestaña anteriores a la reorganización, para que quien tenía una
 * guardada en localStorage no caiga en una vista que ya no existe.
 */
const IDS_ANTIGUOS: Record<string, TabId> = {
  stats: 'home',
  savings: 'goals',
  profile: 'settings',
};

export function normalizarTabId(valor: string | null | undefined): TabId {
  if (!valor) return 'home';
  if (VIEWS.some((v) => v.id === valor)) return valor as TabId;
  return IDS_ANTIGUOS[valor] ?? 'home';
}
