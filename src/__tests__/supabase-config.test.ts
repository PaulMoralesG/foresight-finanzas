// ================================================================
// TESTS — fetchConTimeout (src/config/supabase.ts)
//
// supabase-js no pone timeout a sus peticiones por su cuenta: en una red
// que se cae a medias, el fetch podía quedarse esperando para siempre y el
// indicador de sync ("sincronizando...") con él. Este wrapper es lo que lo
// evita — se prueba aislado, sin tocar el cliente real de Supabase.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchConTimeout, SUPABASE_REQUEST_TIMEOUT_MS } from '@/config/supabase';

describe('fetchConTimeout', () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.useRealTimers();
  });

  it('aborta la petición si supera el tiempo límite', async () => {
    let señal: AbortSignal | undefined;
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      señal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        señal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }) as unknown as typeof fetch;

    const promesa = fetchConTimeout('https://example.com');
    const expectativa = expect(promesa).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS);
    await expectativa;
    expect(señal?.aborted).toBe(true);
  });

  it('no aborta si la respuesta llega antes del tiempo límite', async () => {
    const respuesta = new Response('ok');
    global.fetch = vi.fn(() => Promise.resolve(respuesta)) as unknown as typeof fetch;

    const resultado = await fetchConTimeout('https://example.com');
    expect(resultado).toBe(respuesta);
  });

  it('respeta un AbortSignal externo ya abortado', async () => {
    // Como el fetch real (spec: si `signal.aborted` ya es true, rechaza de
    // inmediato) — un listener de 'abort' agregado DESPUÉS de abortar nunca
    // dispararía, así que el mock necesita el mismo chequeo síncrono.
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as unknown as typeof fetch;

    const controller = new AbortController();
    controller.abort();
    await expect(fetchConTimeout('https://example.com', { signal: controller.signal })).rejects.toThrow();
  });
});
