// ================================================================
// TESTS — src/lib/lazy-recovery.ts
//
// La ruta de recuperación no se puede provocar de forma fiable en el
// navegador: la caché HTTP sigue sirviendo el chunk viejo aunque se borre
// la Cache Storage, así que el 404 no llega a ocurrir. Aquí sí se controla.
// ================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { lazyConRecuperacion } from '@/lib/lazy-recovery';

const CLAVE = 'foresight-recuperacion-chunk';

/** El error que lanza el navegador cuando el chunk ya no está en el servidor. */
function errorDeChunk() {
  return new TypeError(
    'Failed to fetch dynamically imported module: https://app/assets/StatsPage-abc123.js',
  );
}

/** Registro de service worker de mentira, con control sobre cuándo aparece `waiting`. */
function registroFalso({ apareceTrasMs = 0 }: { apareceTrasMs?: number } = {}) {
  const enEspera = { postMessage: vi.fn() };
  const oyentes: Record<string, (() => void)[]> = {};
  const reg: Record<string, unknown> = {
    waiting: null,
    installing: null,
    update: vi.fn(() => {
      setTimeout(() => {
        reg.waiting = enEspera;
      }, apareceTrasMs);
      return Promise.resolve();
    }),
    addEventListener: (ev: string, cb: () => void) => {
      (oyentes[ev] ||= []).push(cb);
    },
  };
  return { reg, enEspera };
}

let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  reloadSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: reloadSpy },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Dispara el cargador de un componente lazy sin montar React.
 *
 * React lanza la promesa mientras carga (protocolo de Suspense) y la deja
 * rechazada si el módulo falla. Aquí se le engancha un `catch` para que el
 * rechazo no quede sin manejar: vitest lo cuenta como error del proceso y
 * devolvería exit 1 aunque todas las aserciones pasen.
 */
function provocarCarga(comp: unknown): void {
  const payload = (comp as { _payload: unknown })._payload;
  const init = (comp as { _init: (p: unknown) => unknown })._init;
  try {
    init(payload);
  } catch (lanzado) {
    if (lanzado && typeof (lanzado as Promise<unknown>).then === 'function') {
      (lanzado as Promise<unknown>).catch(() => {});
    }
  }
  // El propio payload guarda la promesa interna; también hay que silenciarla.
  const p = payload as { _result?: unknown };
  if (p?._result && typeof (p._result as Promise<unknown>).then === 'function') {
    (p._result as Promise<unknown>).catch(() => {});
  }
}

describe('lazyConRecuperacion', () => {
  it('activa el worker en espera cuando el chunk ya no existe', async () => {
    const { reg, enEspera } = registroFalso({ apareceTrasMs: 300 });
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: () => Promise.resolve(reg) },
    });

    const Comp = lazyConRecuperacion(() => Promise.reject(errorDeChunk()));
    provocarCarga(Comp);
    await new Promise((r) => setTimeout(r, 1200));

    // Le pidió al worker nuevo que tome el control...
    expect(enEspera.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    // ...y NO recargó a mano: de eso se encarga `controllerchange` en main.tsx
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CLAVE)).toBe('1');

  });

  it('espera a que el worker termine de instalarse, no mira una sola vez', async () => {
    // `update()` resuelve antes de que `waiting` exista. Mirando una vez, la
    // versión anterior caía a una recarga inútil que servía el mismo shell.
    const { reg, enEspera } = registroFalso({ apareceTrasMs: 900 });
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: () => Promise.resolve(reg) },
    });

    const Comp = lazyConRecuperacion(() => Promise.reject(errorDeChunk()));
    provocarCarga(Comp);
    await new Promise((r) => setTimeout(r, 2000));

    expect(enEspera.postMessage).toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('recarga si no aparece ningún worker nuevo', async () => {
    const reg = {
      waiting: null,
      update: vi.fn(() => Promise.resolve()),
      addEventListener: () => {},
    };
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: () => Promise.resolve(reg) },
    });

    const Comp = lazyConRecuperacion(() => Promise.reject(errorDeChunk()));
    provocarCarga(Comp);
    // El límite de espera son 8 s
    await new Promise((r) => setTimeout(r, 9000));

    expect(reloadSpy).toHaveBeenCalled();
  }, 20000);

  it('no entra en bucle: solo intenta recuperarse una vez por pestaña', async () => {
    sessionStorage.setItem(CLAVE, '1');
    const { reg, enEspera } = registroFalso();
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: () => Promise.resolve(reg) },
    });

    const Comp = lazyConRecuperacion(() => Promise.reject(errorDeChunk()));
    provocarCarga(Comp);
    await new Promise((r) => setTimeout(r, 800));

    expect(enEspera.postMessage).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('un error de render NO provoca recarga', async () => {
    const { reg, enEspera } = registroFalso();
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: () => Promise.resolve(reg) },
    });

    const Comp = lazyConRecuperacion(() => Promise.reject(new Error('undefined is not a function')));
    provocarCarga(Comp);
    await new Promise((r) => setTimeout(r, 800));

    // Recargar en bucle ante un bug de código sería peor que el propio bug
    expect(enEspera.postMessage).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  it('una carga correcta limpia la marca, para poder recuperarse más adelante', async () => {
    sessionStorage.setItem(CLAVE, '1');
    const Comp = lazyConRecuperacion(() => Promise.resolve({ default: () => null }));
    provocarCarga(Comp);
    await new Promise((r) => setTimeout(r, 300));

    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });
});
