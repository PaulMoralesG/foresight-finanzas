// ================================================================
// COLORES DE GRÁFICA — los hex que los SVG necesitan resueltos
//
// Los atributos fill/stroke de un SVG no entienden clases de Tailwind, así
// que cada gráfica los resolvía a mano contra el tema: los mismos valores
// estaban copiados en la tendencia del Resumen, en la curva de Deudas y en la
// de Patrimonio, y ya habían empezado a divergir en los nombres.
//
// Los tonos son los de la paleta de `tailwind.config.js` (slate 700/200 para
// la rejilla, 400/600 para los rótulos) y los de ingreso/gasto de la
// referencia Balance Dual.
// ================================================================

export interface ColoresGrafica {
  /** Rótulos de los ejes. */
  tick: string;
  /** Líneas de rejilla. */
  grid: string;
  /** Fondo, texto y etiqueta del tooltip. */
  tipBg: string;
  tipFg: string;
  tipLabel: string;
  /** Series. */
  income: string;
  expense: string;
  balance: string;
}

export function coloresGrafica(isDark: boolean): ColoresGrafica {
  return {
    tick: isDark ? '#a3a099' : '#5f5e58',
    grid: isDark ? '#4a4944' : '#e6e4dd',
    tipBg: isDark ? '#232320' : '#ffffff',
    tipFg: isDark ? '#f3f2ee' : '#1a1a19',
    tipLabel: isDark ? '#cfccc2' : '#4a4944',
    // En claro, income-600: el income-500 (#1baf7a) sobre blanco daba 2.8:1,
    // por debajo del 3:1 que pide una línea que carga significado (WCAG 1.4.11).
    income: isDark ? '#1baf7a' : '#0f7a54',
    expense: '#e34948',
    balance: isDark ? '#cfccc2' : '#4a4944',
  };
}
