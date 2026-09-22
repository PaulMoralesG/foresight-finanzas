// ================================================================
// ÁMBITO — el segmentado Todo / Personal / Negocio de la cabecera, como en
// Balance Dual (`inTagFilter`). Función pura: cada vista filtra sus datos
// con esto antes de calcular nada.
// ================================================================

import type { Ambito, BusinessType } from '@/types';

export const AMBITOS: { id: Ambito; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'personal', label: 'Personal' },
  { id: 'business', label: 'Negocio' },
];

export function enAmbito(ambito: Ambito, tag: BusinessType | undefined): boolean {
  return ambito === 'all' || tag === ambito;
}

/** Filtra una lista por su etiqueta de ámbito (`tag` o `businessType`). */
export function filtrarPorAmbito<T>(items: T[], ambito: Ambito, tagDe: (item: T) => BusinessType | undefined): T[] {
  return ambito === 'all' ? items : items.filter((i) => tagDe(i) === ambito);
}
