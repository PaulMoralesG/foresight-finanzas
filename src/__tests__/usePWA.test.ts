// ================================================================
// TESTS — usePWA: banner de instalación y aviso de versión nueva.
// El hook usa navigator.serviceWorker directamente (no virtual:pwa-register),
// así que se simula ese objeto. Invariante clave (skipWaiting: false): el
// worker en espera SOLO se activa cuando el usuario llama a handleUpdate.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePWA } from '@/hooks/usePWA';

type Oyente = () => void;

function registroSimulado(opts: { waiting?: boolean } = {}) {
  const oyentes: Record<string, Oyente[]> = {};
  const waiting = opts.waiting ? { postMessage: vi.fn() } : null;
  return {
    waiting,
    installing: null as null | { state: string; addEventListener: (t: string, cb: Oyente) => void },
    addEventListener: (tipo: string, cb: Oyente) => { (oyentes[tipo] ??= []).push(cb); },
    emitir: (tipo: string) => (oyentes[tipo] ?? []).forEach((cb) => cb()),
  };
}

function instalarServiceWorker(registro: ReturnType<typeof registroSimulado>, controller: unknown = {}) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registro),
      controller,
      getRegistration: vi.fn(() => Promise.resolve(registro)),
    },
  });
}

let recargar: ReturnType<typeof vi.fn>;
const locationOriginal = window.location;

beforeEach(() => {
  recargar = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...locationOriginal, reload: recargar },
  });
});
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: locationOriginal });
  // @ts-expect-error — se retira el simulacro para el resto de tests
  delete navigator.serviceWorker;
  vi.useRealTimers();
});

describe('usePWA — versión nueva', () => {
  it('sin worker en espera no avisa', async () => {
    const reg = registroSimulado();
    instalarServiceWorker(reg);
    const { result } = renderHook(() => usePWA());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.swUpdateReady).toBe(false);
  });

  it('avisa al arrancar si ya hay un worker EN ESPERA, sin activarlo', async () => {
    const reg = registroSimulado({ waiting: true });
    instalarServiceWorker(reg);
    const { result } = renderHook(() => usePWA());
    await waitFor(() => expect(result.current.swUpdateReady).toBe(true));
    expect(reg.waiting!.postMessage).not.toHaveBeenCalled();
    expect(recargar).not.toHaveBeenCalled();
  });

  it('avisa cuando un worker nuevo termina de instalarse habiendo ya un controlador', async () => {
    const reg = registroSimulado();
    instalarServiceWorker(reg, {});
    const { result } = renderHook(() => usePWA());
    await act(async () => { await Promise.resolve(); });

    const cambios: Oyente[] = [];
    const nuevo = { state: 'installing', addEventListener: (_t: string, cb: Oyente) => { cambios.push(cb); } };
    reg.installing = nuevo;
    act(() => reg.emitir('updatefound'));
    expect(result.current.swUpdateReady).toBe(false);

    nuevo.state = 'installed';
    act(() => cambios.forEach((cb) => cb()));
    expect(result.current.swUpdateReady).toBe(true);
  });

  it('la primera instalación (sin controlador) NO se anuncia como actualización', async () => {
    const reg = registroSimulado();
    instalarServiceWorker(reg, null);
    const { result } = renderHook(() => usePWA());
    await act(async () => { await Promise.resolve(); });

    const cambios: Oyente[] = [];
    const nuevo = { state: 'installed', addEventListener: (_t: string, cb: Oyente) => { cambios.push(cb); } };
    reg.installing = nuevo;
    act(() => reg.emitir('updatefound'));
    act(() => cambios.forEach((cb) => cb()));
    expect(result.current.swUpdateReady).toBe(false);
  });

  it('handleUpdate manda SKIP_WAITING al worker en espera y recarga como red tras 2 s', async () => {
    const reg = registroSimulado({ waiting: true });
    instalarServiceWorker(reg);
    const { result } = renderHook(() => usePWA());
    await waitFor(() => expect(result.current.swUpdateReady).toBe(true));

    vi.useFakeTimers();
    await act(async () => { await result.current.handleUpdate(); });
    expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(recargar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('handleUpdate sin worker en espera recarga directamente', async () => {
    instalarServiceWorker(registroSimulado());
    const { result } = renderHook(() => usePWA());
    await act(async () => { await result.current.handleUpdate(); });
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('handleUpdate sin soporte de service worker recarga', async () => {
    const { result } = renderHook(() => usePWA());
    expect(result.current.swUpdateReady).toBe(false);
    await act(async () => { await result.current.handleUpdate(); });
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('si getRegistration falla, recarga', async () => {
    const reg = registroSimulado();
    instalarServiceWorker(reg);
    (navigator.serviceWorker.getRegistration as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => usePWA());
    await act(async () => { await result.current.handleUpdate(); });
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});

describe('usePWA — instalación', () => {
  function eventoInstalacion(resultado: 'accepted' | 'dismissed') {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: string }>;
    };
    e.prompt = vi.fn(() => Promise.resolve());
    e.userChoice = Promise.resolve({ outcome: resultado });
    return e;
  }

  it('muestra el banner al llegar beforeinstallprompt y evita el aviso nativo', () => {
    const { result } = renderHook(() => usePWA());
    expect(result.current.showInstallBanner).toBe(false);
    const e = eventoInstalacion('accepted');
    act(() => { window.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.showInstallBanner).toBe(true);
  });

  it('aceptar la instalación oculta el banner', async () => {
    const { result } = renderHook(() => usePWA());
    const e = eventoInstalacion('accepted');
    act(() => { window.dispatchEvent(e); });
    await act(async () => { await result.current.handleInstall(); });
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.showInstallBanner).toBe(false);
  });

  it('rechazarla deja el banner visible, pero consume el evento (no se puede reutilizar)', async () => {
    const { result } = renderHook(() => usePWA());
    const e = eventoInstalacion('dismissed');
    act(() => { window.dispatchEvent(e); });
    await act(async () => { await result.current.handleInstall(); });
    expect(result.current.showInstallBanner).toBe(true);
    await act(async () => { await result.current.handleInstall(); });
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it('dismissInstallBanner oculta el banner y handleInstall sin evento no hace nada', async () => {
    const { result } = renderHook(() => usePWA());
    act(() => { window.dispatchEvent(eventoInstalacion('accepted')); });
    act(() => result.current.dismissInstallBanner());
    expect(result.current.showInstallBanner).toBe(false);
    const solo = renderHook(() => usePWA());
    await act(async () => { await solo.result.current.handleInstall(); });
    expect(solo.result.current.showInstallBanner).toBe(false);
  });
});
