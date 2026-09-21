// ================================================================
// REPORTADOR DE ERRORES — sustituto propio de Sentry
//
// Inserta cada error en la tabla `error_log` de Supabase (migración 0008).
// Sin tracing ni replay: solo el error, dónde ocurrió y quién lo sufrió.
// Sentry pesaba 156 KB gzip diferidos —el chunk más grande de la app—
// para hacer, en la práctica, esto mismo.
//
// Reglas que mantiene respecto a lo que hacía Sentry:
//   - Solo en producción (`import.meta.env.PROD`).
//   - Nunca lanza ni deja una promesa rechazada: un fallo al reportar no
//     puede convertirse en un segundo error visible.
//   - Dedupe por sesión: un bucle de render que revienta 200 veces manda
//     una fila, no 200. Y un cupo total por sesión como red de seguridad.
// ================================================================

import { supabase } from '@/config/supabase';

interface ContextoError {
  /** Motivo, para filtrar en la tabla sin leer cada mensaje
   *  (`render`, `reintentos-agotados`, `window.error`, …). */
  tag?: string;
  /** Pila de componentes de React, cuando viene del ErrorBoundary. */
  componentStack?: string;
}

/** Fila tal cual la espera `public.error_log`. Los límites de longitud
 *  reflejan los CHECK de la tabla: si se envía más, Postgres rechaza. */
interface FilaErrorLog {
  user_id: string;
  message: string;
  stack: string | null;
  tag: string | null;
  url: string;
  user_agent: string;
  app_version: string;
  context: { componentStack: string } | null;
}

const MAX_MENSAJE = 1000;
const MAX_STACK = 8000;
const MAX_TAG = 64;
const MAX_URL = 2048;
const MAX_USER_AGENT = 512;
/** Envíos máximos por sesión de página. Por encima, se descartan en silencio. */
const CUPO_POR_SESION = 20;

let enviados = 0;
const huellas = new Set<string>();
let listenersInstalados = false;

function recortar(texto: string, max: number): string {
  return texto.length > max ? texto.slice(0, max) : texto;
}

/** Normaliza cualquier cosa lanzada (Error, string, objeto de PostgREST…)
 *  a mensaje + stack. */
function normalizar(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return { message: err.message || err.name, stack: err.stack ?? null };
  }
  if (typeof err === 'string') {
    return { message: err, stack: null };
  }
  try {
    return { message: JSON.stringify(err), stack: null };
  } catch {
    return { message: String(err), stack: null };
  }
}

async function enviar(fila: Omit<FilaErrorLog, 'user_id'>): Promise<void> {
  if (!supabase) return;

  // RLS solo admite insert al usuario autenticado con su propio user_id.
  // Sin sesión (modo offline, o antes del login) no hay a quién atribuir
  // el error y la escritura sería rechazada de todos modos.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return;

  await supabase.from('error_log').insert({ ...fila, user_id: session.user.id });
}

/**
 * Reporta un error a `error_log`. Devuelve inmediatamente; el envío ocurre
 * en segundo plano y cualquier fallo se traga (con un console.error para
 * quien tenga la consola abierta).
 */
export function reportarError(err: unknown, ctx: ContextoError = {}): void {
  if (!import.meta.env.PROD) return;
  if (!supabase) return;

  try {
    const { message, stack } = normalizar(err);
    const tag = ctx.tag ? recortar(ctx.tag, MAX_TAG) : null;

    const huella = `${tag ?? ''}|${message}`;
    if (huellas.has(huella)) return;
    if (enviados >= CUPO_POR_SESION) return;
    huellas.add(huella);
    enviados += 1;

    const fila: Omit<FilaErrorLog, 'user_id'> = {
      message: recortar(message, MAX_MENSAJE),
      stack: stack ? recortar(stack, MAX_STACK) : null,
      tag,
      url: recortar(window.location.href, MAX_URL),
      user_agent: recortar(navigator.userAgent, MAX_USER_AGENT),
      app_version: __APP_VERSION__,
      context: ctx.componentStack ? { componentStack: recortar(ctx.componentStack, MAX_STACK) } : null,
    };

    enviar(fila).catch((e: unknown) => {
      const motivo = e instanceof Error ? e.message : String(e);
      console.error('[error-reporter] No se pudo registrar el error:', motivo);
    });
  } catch (e: unknown) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error('[error-reporter] Fallo interno al preparar el reporte:', motivo);
  }
}

function onWindowError(ev: ErrorEvent): void {
  reportarError(ev.error ?? ev.message, { tag: 'window.error' });
}

function onUnhandledRejection(ev: Event): void {
  // jsdom y algunos navegadores viejos no exponen PromiseRejectionEvent;
  // `reason` es lo único que se necesita.
  const reason = (ev as Event & { reason?: unknown }).reason;
  reportarError(reason ?? 'Promesa rechazada sin motivo', { tag: 'unhandledrejection' });
}

/**
 * Instala los listeners globales que antes ponía `Sentry.init`:
 * errores no capturados y promesas rechazadas sin `catch`. Idempotente.
 */
export function initErrorReporter(): void {
  if (listenersInstalados) return;
  listenersInstalados = true;
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
}

/** Solo para tests: limpia el estado de sesión y quita los listeners. */
export function __resetErrorReporterForTests(): void {
  enviados = 0;
  huellas.clear();
  if (listenersInstalados) {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    listenersInstalados = false;
  }
}
