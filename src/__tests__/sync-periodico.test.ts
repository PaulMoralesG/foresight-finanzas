// ================================================================
// TESTS — sync periódico con la app abierta y visible
//
// Una PWA que se queda abierta en primer plano nunca volvía a hacer pull:
// los ciclos solo arrancaban en attach, visibilitychange→visible, `online` y
// tras una edición local. Un cambio hecho en otro dispositivo no llegaba
// hasta cambiar de pestaña. Ahora, con sesión sincronizada, pestaña visible y
// red, corre un ciclo incremental cada INTERVALO_SYNC_PERIODICO_MS y otro al
// evento `focus` — siempre por el mismo camino single-flight.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() } as unknown,
}));

vi.mock('@/config/supabase', () => ({
  get supabase() {
    return mocks.supabase;
  },
  supabaseAvailable: true,
}));

import { syncService, INTERVALO_SYNC_PERIODICO_MS } from '@/lib/sync';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';

const mockFrom = (mocks.supabase as { from: ReturnType<typeof vi.fn> }).from;

type Fila = Record<string, unknown>;

let visibilidad: DocumentVisibilityState = 'visible';
let enLinea = true;

/** Cada pull de `expenses` es un ciclo; `incremental` dice si llevó marca. */
let pulls: Array<{ incremental: boolean }> = [];
let filasRemotas: Fila[] = [];
/** Si devuelve una promesa, el pull de expenses queda retenido en ella. */
let retenerPull: (() => Promise<unknown> | null) | null = null;

function builder(table: string) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => {
        let incremental = false;
        const chain = {
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          gte: vi.fn(() => {
            incremental = true;
            return chain;
          }),
          order: vi.fn(() => chain),
          range: vi.fn(() => {
            if (table !== 'expenses') return Promise.resolve({ data: [], error: null });
            pulls.push({ incremental });
            const retenido = retenerPull?.();
            return retenido ?? Promise.resolve({ data: filasRemotas, error: null });
          }),
        };
        return chain;
      }),
    })),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
    update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
  };
}

function ocultar() {
  visibilidad = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
}

function mostrar() {
  visibilidad = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibilidad = 'visible';
  enLinea = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidad });
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => enLinea });
  pulls = [];
  filasRemotas = [];
  retenerPull = null;
  mocks.supabase = { from: mockFrom };
  mockFrom.mockReset();
  mockFrom.mockImplementation(builder);
  syncService.init();
  useFinanceStore.getState().reset();
});

afterEach(() => {
  syncService.detach();
  vi.useRealTimers();
});

describe('sync periódico con la app abierta', () => {
  it('con sesión, visible y en línea: un ciclo incremental cada intervalo', async () => {
    await syncService.attach('user-1');
    expect(pulls).toEqual([{ incremental: false }]); // attach = completo

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS - 1);
    expect(pulls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(pulls).toHaveLength(2);
    expect(pulls[1].incremental).toBe(true);

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS);
    expect(pulls).toHaveLength(3);
    expect(pulls[2].incremental).toBe(true);
  });

  it('lo que trae el pull periódico llega al store sin agendar ciclos extra', async () => {
    await syncService.attach('user-1');
    filasRemotas = [{
      id: 'e-escritorio', user_id: 'user-1', type: 'expense', amount: 40,
      concept: 'Editado en escritorio', date: '2026-10-28', category: 'food',
      method: 'cash', business_type: 'personal', created_at: null,
      updated_at: new Date(Date.now() + 1000).toISOString(), deleted_at: null,
    }];

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS);
    expect(pulls).toHaveLength(2);
    expect(useFinanceStore.getState().expenses.find((e) => e.id === 'e-escritorio')?.amount).toBe(40);

    // El setState del merge no cuenta como edición: no hay ciclo de rebote.
    await vi.advanceTimersByTimeAsync(5000);
    expect(pulls).toHaveLength(2);
    expect(syncService.hayCambiosSinSubir()).toBe(false);
  });

  it('con la pestaña oculta no sondea; al volver se reanuda', async () => {
    await syncService.attach('user-1');
    ocultar();
    await vi.advanceTimersByTimeAsync(100);
    const trasOcultar = pulls.length; // el flush incremental de ocultar

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS * 3);
    expect(pulls).toHaveLength(trasOcultar);

    mostrar(); // ciclo COMPLETO del regreso, como siempre
    await vi.advanceTimersByTimeAsync(100);
    expect(pulls).toHaveLength(trasOcultar + 1);
    expect(pulls[trasOcultar].incremental).toBe(false);

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS);
    expect(pulls).toHaveLength(trasOcultar + 2);
    expect(pulls[trasOcultar + 1].incremental).toBe(true);
  });

  it('sin red no sondea', async () => {
    await syncService.attach('user-1');
    enLinea = false;
    window.dispatchEvent(new Event('offline'));

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS * 3);
    expect(pulls).toHaveLength(1);
  });

  it('no se solapa con un ciclo en vuelo ni deja otro encolado', async () => {
    await syncService.attach('user-1');

    let soltar: (() => void) | null = null;
    retenerPull = () => {
      retenerPull = null;
      return new Promise((resolve) => { soltar = () => resolve({ data: [], error: null }); });
    };

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS);
    expect(pulls).toHaveLength(2); // el periódico, retenido

    // Otro tick y un focus con ese ciclo todavía en vuelo: nada nuevo.
    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(100);
    expect(pulls).toHaveLength(2);

    soltar!();
    await vi.advanceTimersByTimeAsync(100);
    // Al terminar no arranca ningún ciclo encolado por los ticks.
    expect(pulls).toHaveLength(2);
  });

  it('el evento focus dispara un ciclo incremental', async () => {
    await syncService.attach('user-1');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10);
    expect(pulls).toHaveLength(2);
    expect(pulls[1].incremental).toBe(true);
  });

  it('el focus con la pestaña oculta o sin red no hace nada', async () => {
    await syncService.attach('user-1');
    enLinea = false;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10);
    expect(pulls).toHaveLength(1);
  });

  it('no corre mientras primerSyncCompleto sea falso', async () => {
    await syncService.attach('user-1');
    useUiStore.getState().setPrimerSyncCompleto(false);

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS * 2);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10);
    expect(pulls).toHaveLength(1);
  });

  it('no corre mientras attach no haya terminado', async () => {
    let soltar: (() => void) | null = null;
    retenerPull = () => {
      retenerPull = null;
      return new Promise((resolve) => { soltar = () => resolve({ data: [], error: null }); });
    };
    const attachP = syncService.attach('user-1');
    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS * 2);
    expect(pulls).toHaveLength(1);

    soltar!();
    await attachP;
    await vi.advanceTimersByTimeAsync(100);
    expect(pulls).toHaveLength(1);
  });

  it('se detiene en detach: sin ciclos ni timers colgados', async () => {
    await syncService.attach('user-1');
    syncService.detach();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS * 3);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10);
    expect(pulls).toHaveLength(1);
  });

  it('se detiene si el sync se desactiva (local-only)', async () => {
    await syncService.attach('user-1');
    syncService.disable();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS * 2);
    expect(pulls).toHaveLength(1);
  });

  it('tras un error permanente (RLS) no reintenta cada minuto', async () => {
    await syncService.attach('user-1');
    retenerPull = () => Promise.resolve({ data: null, error: { code: '42501', message: 'rls' } });

    // Primer tick: el ciclo agota sus reintentos (1 + 3, con backoff 1+2+4 s).
    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS + 1000 + 2000 + 4000);
    expect(pulls).toHaveLength(1 + 4);

    await vi.advanceTimersByTimeAsync(INTERVALO_SYNC_PERIODICO_MS * 3);
    expect(pulls).toHaveLength(1 + 4);
  });

  it('flush() no queda esperando por el intervalo', async () => {
    await syncService.attach('user-1');
    let resuelto = false;
    void syncService.flush().then(() => { resuelto = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(resuelto).toBe(true);
    expect(syncService.hayCambiosSinSubir()).toBe(false);
  });
});
