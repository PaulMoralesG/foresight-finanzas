// ================================================================
// useDebouncedCallback — Debounce para callbacks asíncronos
// Evita múltiples llamadas en ráfaga (ej: saveData al escribir)
// ================================================================

import { useRef, useCallback } from 'react';

/**
 * Debouncea un callback asíncrono.
 * Solo la última invocación dentro de `delay` ms se ejecuta realmente.
 */
export function useDebouncedCallback<T extends (...args: any[]) => Promise<any>>(
  callback: T,
  delay = 500,
): (...args: Parameters<T>) => ReturnType<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    (...args: Parameters<T>): ReturnType<T> => {
      return new Promise((resolve, reject) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(async () => {
          timerRef.current = null;
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
