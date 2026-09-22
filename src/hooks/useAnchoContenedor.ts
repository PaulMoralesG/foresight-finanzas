// ================================================================
// useAnchoContenedor — ancho real (px) de un contenedor, siguiendo sus
// cambios de tamaño. Es lo que hacía ResponsiveContainer de Recharts: un
// SVG con viewBox fijo escala entero al ancho disponible y en un móvil
// estrecho el texto de los ejes se hace ilegible; con el ancho medido se
// dibuja a escala 1:1 y las etiquetas conservan sus 10-11px.
// ================================================================

import { useLayoutEffect, useRef, useState } from 'react';

/** Ancho de respaldo antes de medir (y en jsdom, que no mide nada). */
export const ANCHO_INICIAL = 520;

export function useAnchoContenedor<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(ANCHO_INICIAL);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;
      if (w > 0) setAncho(w);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ancho };
}
