// ================================================================
// IDENTIFICADORES DE CATEGORÍA — fuente única
// ================================================================

import { newId } from '@/lib/ids';

/**
 * Genera el id de una categoría personalizada a partir de su etiqueta.
 *
 * La versión anterior estaba duplicada en ProfilePage y TransactionModal:
 *
 *   'custom_' + label.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')
 *
 * y tenía dos problemas en español:
 *
 *  1. El segundo `replace` BORRA todo lo que no sea ASCII en vez de
 *     transliterarlo. «Café» daba `custom_caf`, y cualquier otra etiqueta que
 *     se redujera a las mismas letras —«Cafó», «Café!»— daba el MISMO id.
 *     El control de duplicados comparaba etiquetas, no ids, así que la
 *     colisión pasaba el filtro y la segunda categoría pisaba a la primera
 *     al sincronizar (upsert con la misma clave).
 *  2. Una etiqueta solo con emoji («🍕») se quedaba en `custom_`.
 *
 * Ahora se normaliza a NFD y se quitan los diacríticos, de modo que «Café» da
 * `cafe`, y se añade un sufijo aleatorio corto que garantiza unicidad incluso
 * cuando dos etiquetas distintas normalizan igual.
 */
export function makeCategoryId(label: string): string {
  const slug = label
    .normalize('NFD')
    // ̀-ͯ = bloque de diacríticos combinables (los acentos que NFD separó)
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);

  // Sufijo de 6 caracteres: hace el id único aunque el slug quede vacío
  // (etiquetas solo con emoji) o coincida con el de otra etiqueta.
  const suffix = newId().replace(/-/g, '').slice(0, 6);

  return slug ? `custom_${slug}_${suffix}` : `custom_${suffix}`;
}
