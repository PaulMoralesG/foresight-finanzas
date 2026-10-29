// ================================================================
// Dueño de los datos locales — qué cuenta escribió lo que hay en
// `foresight-finance-storage`.
//
// Sirve para decidir cuándo borrar el estado local al arrancar la sesión:
// solo si entra OTRA cuenta (o la sesión es inválida de verdad), nunca por un
// fallo de red, que antes se llevaba por delante los cambios sin subir.
// ================================================================

import { isAuthRetryableFetchError } from '@supabase/supabase-js';

const CLAVE_DUENO = 'foresight-finance-owner';

export interface DuenoDatos {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** La sesión se cerró a propósito conservando cambios sin sincronizar:
   *  el arranque sin sesión no debe borrarlos. */
  conservarDatos?: boolean;
}

export function leerDuenoDatos(): DuenoDatos | null {
  try {
    const crudo = localStorage.getItem(CLAVE_DUENO);
    if (!crudo) return null;
    const dato: unknown = JSON.parse(crudo);
    if (!dato || typeof dato !== 'object') return null;
    const d = dato as Record<string, unknown>;
    if (typeof d.id !== 'string' || typeof d.email !== 'string') return null;
    return {
      id: d.id,
      email: d.email,
      firstName: typeof d.firstName === 'string' ? d.firstName : undefined,
      lastName: typeof d.lastName === 'string' ? d.lastName : undefined,
      conservarDatos: d.conservarDatos === true,
    };
  } catch (e: unknown) {
    console.warn('[dueno-datos] No se pudo leer el dueño de los datos locales:', e instanceof Error ? e.message : e);
    return null;
  }
}

export function guardarDuenoDatos(dueno: DuenoDatos): void {
  try {
    localStorage.setItem(CLAVE_DUENO, JSON.stringify(dueno));
  } catch (e: unknown) {
    console.warn('[dueno-datos] No se pudo guardar el dueño de los datos locales:', e instanceof Error ? e.message : e);
  }
}

export function borrarDuenoDatos(): void {
  try {
    localStorage.removeItem(CLAVE_DUENO);
  } catch (e: unknown) {
    console.warn('[dueno-datos] No se pudo borrar el dueño de los datos locales:', e instanceof Error ? e.message : e);
  }
}

/**
 * Cambios sin subir de OTRA cuenta que se perderían si inicia sesión `email`.
 *
 * Devuelve el dueño anterior solo si cerró conservando datos (`conservarDatos`:
 * cierre por inactividad o sesión caída con cambios sin subir) y `email` no es
 * el suyo. Al entrar otra cuenta, cargarPerfil reinicia el store (ALT-1): el
 * login lo usa para avisar ANTES de llamar a Supabase. Se compara por email
 * porque el uid de la cuenta entrante aún no se conoce; si la misma cuenta
 * cambió de correo en otro dispositivo, el aviso sobra pero no borra nada
 * (cargarPerfil compara por uid).
 */
export function datosSinSubirDeOtraCuenta(email: string): DuenoDatos | null {
  const dueno = leerDuenoDatos();
  if (!dueno?.conservarDatos) return null;
  const normalizar = (e: string) => e.trim().toLowerCase();
  return normalizar(dueno.email) === normalizar(email) ? null : dueno;
}

// Dueño del store EN MEMORIA de esta pestaña. No basta con la clave de
// localStorage: otra pestaña puede reescribirla (entra otra cuenta) mientras
// ésta conserva en memoria los datos de la anterior. Al cargar el módulo, la
// memoria acaba de hidratarse de localStorage: su dueño es el guardado.
let duenoMemoria: string | null = leerDuenoDatos()?.id ?? null;

export function duenoEnMemoria(): string | null {
  return duenoMemoria;
}

export function fijarDuenoEnMemoria(id: string | null): void {
  duenoMemoria = id;
}

const PATRON_RED = /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborterror|timeout|timed out/i;

/** Fallo de red o de conectividad (no una respuesta del servidor). */
export function esFalloDeRed(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (isAuthRetryableFetchError(err)) return true;
  if (err instanceof Error) return PATRON_RED.test(`${err.name} ${err.message}`);
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown };
    return PATRON_RED.test(`${String(e.message ?? '')} ${String(e.details ?? '')}`);
  }
  return false;
}
