// ================================================================
// useFocusTrap — retiene el foco dentro de un diálogo modal
// ================================================================

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Implementa la promesa que hace `aria-modal="true"`: mientras el diálogo está
 * abierto, el foco no puede salir de él.
 *
 * Sin esto, pulsar Tab desde el último control del modal llevaba el foco al
 * contenido de fondo, que seguía siendo operable con teclado aunque estuviera
 * visualmente tapado por el overlay.
 *
 * Al cerrar, devuelve el foco al elemento que abrió el diálogo.
 *
 * @param active  si el diálogo está abierto
 * @param initialFocus selector opcional del control a enfocar al abrir
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, initialFocus?: string) {
  const containerRef = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    // Se copia a una const local para que TypeScript conserve el estrechado
    // de tipo dentro del listener (el `.current` de la ref puede volverse null).
    const container: T = containerRef.current!;
    if (!containerRef.current) return;

    // Recordar quién tenía el foco para devolvérselo al cerrar
    restoreRef.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Foco inicial: el control indicado, o el primero disponible
    const target = initialFocus
      ? container.querySelector<HTMLElement>(initialFocus)
      : null;
    (target ?? focusables()[0])?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      // Ciclar: del último al primero hacia delante, y al revés con Shift
      if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (current && !container.contains(current)) {
        // El foco escapó (p. ej. tras un cambio de DOM): traerlo de vuelta
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [active, initialFocus]);

  return containerRef;
}
