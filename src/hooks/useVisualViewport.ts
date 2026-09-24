// ================================================================
// useVisualViewport — ata un panel fijo a la parte VISIBLE de la pantalla
//
// En iOS y en Chrome para Android, abrir el teclado no encoge el viewport
// de diseño: encoge solo el *visual viewport* y desplaza la página para
// mostrar el campo enfocado. Un panel `position: fixed` anclado al viewport
// de diseño se queda donde estaba, así que el teclado le tapa la mitad
// inferior y el desplazamiento se lleva su cabecera —con el botón de cerrar—
// fuera de la pantalla. Era el fallo reportado en un iPhone 14 Pro.
//
// Este hook publica, como variables CSS del propio elemento:
//   --vv-height  alto visible (sin teclado ni barras del navegador)
//   --vv-bottom  cuánto sobresale el viewport de diseño por debajo del visible
//                (el alto del teclado, en la práctica)
// y el CSS del panel se ancla con ellas. Sin `visualViewport` (navegadores
// antiguos) no publica nada y el CSS cae a sus valores por defecto.
// ================================================================

import { useEffect, type RefObject } from 'react';

export function useVisualViewport<T extends HTMLElement>(ref: RefObject<T | null>, active = true) {
  useEffect(() => {
    const el = ref.current;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !el || !vv) return;

    const actualizar = () => {
      const bottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      el.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
      el.style.setProperty('--vv-bottom', `${Math.round(bottom)}px`);
    };

    actualizar();
    vv.addEventListener('resize', actualizar);
    vv.addEventListener('scroll', actualizar);
    return () => {
      vv.removeEventListener('resize', actualizar);
      vv.removeEventListener('scroll', actualizar);
    };
  }, [ref, active]);
}

/** Pantalla táctil (dedo, no ratón): donde abrir el teclado sin que se pida estorba. */
export function esPunteroTactil(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}
