import type { BusinessType } from '@/types';

const AMBITOS: BusinessType[] = ['personal', 'business'];

/** Selector Personal / Negocio de los formularios en modal. */
export function AmbitoField({ value, onChange }: { value: BusinessType; onChange: (t: BusinessType) => void }) {
  return (
    <div>
      <span className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Ámbito</span>
      <div className="flex gap-1" role="group" aria-label="Ámbito">
        {AMBITOS.map((t) => (
          <button key={t} type="button" onClick={() => onChange(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${value === t ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
            {t === 'personal' ? 'Personal' : 'Negocio'}
          </button>
        ))}
      </div>
    </div>
  );
}
