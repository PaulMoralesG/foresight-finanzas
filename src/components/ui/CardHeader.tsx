// ================================================================
// CardHeader — Cabecera de tarjeta: título, línea de apoyo y acción
//
// Antes cada tarjeta escribía su propio encabezado a mano (18 copias de la
// misma tupla de clases) y los espaciados habían ido divergiendo: unas dejaban
// `mb-2`, otras `mb-3` y otras nada. Aquí vive una sola versión.
//
// Medidas tomadas de `.card h3` / `.card .sub` de la referencia Balance Dual:
// título a 0.95rem y apoyo a 0.75rem, no a 11px — `text-2xs` es para rótulos
// en mayúsculas, no para contenido.
//
// El peso es `font-semibold` y no `font-bold` a propósito: de Fraunces solo se
// carga la 600 (ver los @import de index.css), así que un 700 lo sintetiza el
// navegador y engorda los trazos de forma desigual.
// ================================================================

import type { ComponentType, ReactNode } from 'react';

interface CardHeaderProps {
  titulo: ReactNode;
  /** Línea de apoyo bajo el título. */
  sub?: ReactNode;
  /** Icono a la izquierda del título. */
  icono?: ComponentType<{ className?: string }>;
  /** Botón o enlace alineado a la derecha. */
  accion?: ReactNode;
  /** Margen inferior; por defecto `mb-3`. */
  className?: string;
}

export function CardHeader({ titulo, sub, icono: Icono, accion, className = 'mb-3' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[0.95rem] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          {Icono && <Icono className="w-4 h-4 text-brand-500 flex-shrink-0" />}
          {titulo}
        </h2>
        {sub && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {accion}
    </div>
  );
}
