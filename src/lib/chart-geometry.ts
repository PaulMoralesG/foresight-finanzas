// ================================================================
// GEOMETRÍA DE GRÁFICOS — aritmética pura para los SVG dibujados a mano
//
// Antes esto lo hacía Recharts (111 KB gzip para un gráfico de líneas).
// Aquí solo está lo que ese gráfico necesitaba: una escala con ticks
// redondos, el formato abreviado del eje de dinero y el trazado de una
// polilínea. Sin DOM, para poder probarlo en aislamiento.
// ================================================================

export interface EscalaY {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Escala "bonita" para el eje Y: el dominio se ensancha hasta múltiplos de
 * un paso 1-2-5 × 10^n de modo que los ticks sean cifras redondas, como
 * hace Recharts con su `domain` automático. El cero siempre entra: sin él,
 * un mes con balance negativo no tendría referencia de dónde está el suelo.
 */
export function escalaBonita(minDato: number, maxDato: number, ticksObjetivo = 5): EscalaY {
  const lo = Math.min(0, minDato);
  let hi = Math.max(0, maxDato);
  if (hi - lo === 0) {
    // Todo en cero (o un único valor): un dominio de 0..1 evita dividir
    // entre cero y deja un gráfico plano pero dibujable.
    hi = lo + 1;
  }

  const bruto = (hi - lo) / Math.max(1, ticksObjetivo - 1);
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const residuo = bruto / magnitud;
  // Umbrales de Heckbert ("nice numbers for graph labels"): redondean al
  // paso 1-2-5 más cercano en escala logarítmica, no al inmediato superior.
  const factor = residuo < 1.5 ? 1 : residuo < 3 ? 2 : residuo < 7 ? 5 : 10;
  const paso = factor * magnitud;

  const min = Math.floor(lo / paso) * paso;
  const max = Math.ceil(hi / paso) * paso;

  const ticks: number[] = [];
  // Se cuenta en enteros y se multiplica al final: sumar `paso` en coma
  // flotante acumula error (0.1 + 0.2…) y los ticks dejarían de ser redondos.
  const n = Math.round((max - min) / paso);
  for (let i = 0; i <= n; i++) {
    ticks.push(min + i * paso);
  }
  return { min, max, ticks };
}

/** `$12k`, `$1.5M`, `-$2k`: el mismo formato que usaba el tickFormatter. */
export function formatoTickDinero(v: number): string {
  const signo = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${signo}$${Math.round(abs / 1000)}k`;
  return `${signo}$${abs}`;
}

/** Path SVG (`M x y L x y …`) a partir de puntos [x, y], con una decimal. */
export function trazarLinea(puntos: ReadonlyArray<readonly [number, number]>): string {
  return puntos
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}
