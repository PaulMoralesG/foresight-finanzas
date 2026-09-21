// ================================================================
// Icon — un <svg><use/> contra el sprite inline de icons.generated.tsx
//
// Sustituye a lucide-react: cada icono de lucide era un componente con
// forwardRef, contexto y merge de clases; aquí los 65 iconos comparten un
// solo componente y sus trazos viven en <symbol>s montados una vez.
// Los atributos del <svg> son los mismos que ponía lucide (fill none,
// stroke currentColor, grosor 2, extremos redondeados), así que las
// clases que ya usaba la app (w-3 h-3, text-slate-500, animate-spin…)
// siguen funcionando sin cambios.
// ================================================================

import type { ComponentType, SVGProps } from 'react';
import type { IconName } from './icons.generated';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
}

/** Tipo de un icono ya nombrado (`Home`, `Plus`…), para props tipo `icon`. */
export type IconComponent = ComponentType<Omit<IconProps, 'name'>>;

export function Icon({ name, className, ...rest }: IconProps) {
  // Como lucide: decorativo salvo que quien lo usa le dé un rol accesible.
  const decorativo = !('aria-label' in rest) && !('aria-labelledby' in rest) && !('role' in rest);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(decorativo ? { 'aria-hidden': true } : {})}
      {...rest}
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}
