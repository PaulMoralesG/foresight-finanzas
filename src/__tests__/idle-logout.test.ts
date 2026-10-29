import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdleLogout, IDLE_MINUTES, IDLE_WARN_SECONDS } from '@/hooks/useIdleLogout';

const MIN = 60_000;

describe('useIdleLogout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('cierra la sesión tras el periodo de inactividad', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout({ enabled: true, onTimeout }));

    act(() => { vi.advanceTimersByTime(IDLE_MINUTES * MIN - 1000); });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('avisa antes de cerrar, no de golpe', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleLogout({ enabled: true, onTimeout }));

    expect(result.current.avisando).toBe(false);

    // Justo dentro de la ventana de aviso
    act(() => { vi.advanceTimersByTime(IDLE_MINUTES * MIN - (IDLE_WARN_SECONDS - 5) * 1000); });
    expect(result.current.avisando).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.segundosRestantes).toBeLessThanOrEqual(IDLE_WARN_SECONDS);
  });

  it('la actividad del usuario reinicia el contador', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout({ enabled: true, onTimeout }));

    // Casi al límite...
    act(() => { vi.advanceTimersByTime(IDLE_MINUTES * MIN - 5000); });
    // ...el usuario toca una tecla
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });
    // y pasa otro tanto: sin el reinicio ya habría cerrado dos veces
    act(() => { vi.advanceTimersByTime(IDLE_MINUTES * MIN - 5000); });

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('no cierra dos veces aunque siga corriendo el reloj', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout({ enabled: true, onTimeout }));

    act(() => { vi.advanceTimersByTime(IDLE_MINUTES * MIN + 60_000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('desactivado (modo offline) no cierra nunca', () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleLogout({ enabled: false, onTimeout }));

    act(() => { vi.advanceTimersByTime(IDLE_MINUTES * MIN * 3); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('limpia sus listeners y su intervalo al desmontar', () => {
    const onTimeout = vi.fn();
    const quitar = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useIdleLogout({ enabled: true, onTimeout }));

    unmount();
    expect(quitar).toHaveBeenCalled();

    // Sin fugas: tras desmontar, avanzar el reloj no dispara nada
    act(() => { vi.advanceTimersByTime(IDLE_MINUTES * MIN * 2); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  describe('al volver a la pestaña', () => {
    const fijarVisibilidad = (estado: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    afterEach(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    });

    it('cierra si estuvo oculta (timers congelados) más del límite de inactividad', () => {
      const onTimeout = vi.fn();
      renderHook(() => useIdleLogout({ enabled: true, onTimeout }));

      // Pestaña oculta: el navegador congela el intervalo, pero el reloj avanza.
      act(() => { fijarVisibilidad('hidden'); });
      vi.setSystemTime(Date.now() + (IDLE_MINUTES + 1) * MIN);
      act(() => { fijarVisibilidad('visible'); });

      expect(onTimeout).toHaveBeenCalledTimes(1);

      // Y no vuelve a cerrar en el siguiente tic.
      act(() => { vi.advanceTimersByTime(5000); });
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('no cierra si la ausencia fue corta, y cuenta como actividad', () => {
      const onTimeout = vi.fn();
      renderHook(() => useIdleLogout({ enabled: true, onTimeout }));

      act(() => { fijarVisibilidad('hidden'); });
      vi.setSystemTime(Date.now() + 5 * MIN);
      act(() => { fijarVisibilidad('visible'); });
      expect(onTimeout).not.toHaveBeenCalled();

      // El reloj se reinició al volver: otros 29 minutos no cierran.
      act(() => { vi.advanceTimersByTime((IDLE_MINUTES - 1) * MIN); });
      expect(onTimeout).not.toHaveBeenCalled();
    });
  });
});
