// ================================================================
// LoadingSpinner - Indicador de carga
// ================================================================

export function LoadingSpinner({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950">
      <div className="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-brand-600 animate-spin mb-4" />
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}
