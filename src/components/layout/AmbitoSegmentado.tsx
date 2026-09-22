// ================================================================
// AmbitoSegmentado — Todo / Personal / Negocio, el segmentado global de la
// cabecera (como el `.segmented` de Balance Dual). Filtra Resumen,
// Presupuestos, Deudas y Metas; Cuentas, Patrimonio y Ajustes no lo usan.
// ================================================================

import { useFinanceStore } from '@/stores/financeStore';
import { AMBITOS } from '@/lib/ambito';

export function AmbitoSegmentado({ className = '' }: { className?: string }) {
  const ambito = useFinanceStore((s) => s.ambito);
  const setAmbito = useFinanceStore((s) => s.setAmbito);

  return (
    <div
      role="group"
      aria-label="Ámbito"
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${className}`}
    >
      {AMBITOS.map((a) => {
        const activo = a.id === ambito;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => setAmbito(a.id)}
            aria-pressed={activo}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              activo
                ? a.id === 'business'
                  ? 'bg-business-600 text-white shadow-sm'
                  : 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
            }`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
