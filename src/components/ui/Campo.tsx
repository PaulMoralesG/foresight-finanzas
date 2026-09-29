import type { ReactNode } from 'react';

/** Campo de formulario: etiqueta en mayúsculas pequeñas sobre el control. */
export function Campo({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">{label}</label>
      {children}
    </div>
  );
}
