// ================================================================
// useDebouncedCallback — Debounce para callbacks asíncronos
// Evita múltiples llamadas en ráfaga (ej: saveData al escribir)
// ================================================================

import { useRef, useCallback } from 'react';

/** Error lanzado cuando una llamada debounced es cancelada por una nueva */
export class DebounceCancelledError extends Error {
  constructor() {
    super('Debounced call cancelled by a newer invocation');
    this.name = 'DebounceCancelledError';
  }
}

/**
 * Debouncea un callback asíncrono.
 * Solo la última invocación dentro de `delay` ms se ejecuta realmente.
 * Las llamadas previas son canceladas y su Promise se rechaza con DebounceCancelledError.
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => Promise<unknown>>(
  callback: T,
  delay = 500,
): (...args: Parameters<T>) => ReturnType<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejectRef = useRef<((reason: Error) => void) | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    (...args: Parameters<T>): ReturnType<T> => {
      return new Promise((resolve, reject) => {
        // Cancelar llamada previa pendiente
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          rejectRef.current?.(new DebounceCancelledError());
        }
        rejectRef.current = reject;

        timerRef.current = setTimeout(async () => {
          timerRef.current = null;
          rejectRef.current = null;
          try {
            const result = await callbackRef.current(...args);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        }, delay);
      }) as ReturnType<T>;
    },
    [delay],
  );
}
