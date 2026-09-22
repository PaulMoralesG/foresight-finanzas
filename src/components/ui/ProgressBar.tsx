// ================================================================
// ProgressBar — La barra de avance de presupuestos, metas y patrimonio
//
// Estaba copiada cinco veces (dos en el Resumen, una en Presupuestos, otra en
// Metas y otra en Patrimonio) con el mismo par de divs y sin ningún rol: un
// lector de pantalla no anunciaba el avance, solo leía la cifra de al lado.
// Aquí va una sola vez y con `role="progressbar"`.
// ================================================================

interface ProgressBarProps {
  /** Avance en porcentaje; se recorta a 0–100 para el ancho pintado. */
  pct: number;
  /** Clases del relleno, p. ej. `bg-income-500`. */
  color?: string;
  /** Qué mide la barra, para quien la oye en vez de verla. */
  label: string;
}

export function ProgressBar({ pct, color = 'bg-brand-500 dark:bg-brand-400', label }: ProgressBarProps) {
  const ancho = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} />
    </div>
  );
}
