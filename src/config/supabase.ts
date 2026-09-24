// ================================================================
// CONFIGURACIÓN DE SUPABASE - Cliente tipado y seguro
// ================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

const supabaseAvailable = !!(supabaseUrl && supabaseKey);

/** Sin esto, una petición en una red que se cae a medias podía quedarse
 *  esperando para siempre: supabase-js no pone timeout por su cuenta. El
 *  indicador de sync del header se quedaba en "sincronizando..." sin poder
 *  distinguir "todavía en curso" de "colgado". */
export const SUPABASE_REQUEST_TIMEOUT_MS = 20_000;

/** `fetch` de supabase-js con límite de tiempo: pasado
 *  SUPABASE_REQUEST_TIMEOUT_MS aborta la petición para que el llamador vea un
 *  error y pueda reintentar o caer a modo local, en vez de colgarse. Si el
 *  propio caller ya trae un `signal` (encadenado con `.abortSignal()`),
 *  cualquiera de los dos que dispare primero aborta la petición. */
export function fetchConTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  const externo = init.signal;
  if (externo) {
    if (externo.aborted) controller.abort();
    else externo.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

export const supabase: SupabaseClient | null = supabaseAvailable
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: fetchConTimeout,
      },
    })
  : null;

export { supabaseAvailable };
