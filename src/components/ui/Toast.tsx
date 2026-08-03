// ================================================================
// Toast - Notificación flotante
// ================================================================

import { AlertCircle, CheckCircle, X } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';

export function Toast() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-4 left-4 sm:left-auto sm:right-6 z-[9999] flex flex-col gap-2 sm:w-[380px] sm:max-w-[calc(100%-2rem)]"
      style={{ bottom: `calc(80px + env(safe-area-inset-bottom, 0px))` }}
    >
      {toasts.map((toast) => {
        const IconComponent = toast.type === 'error' ? AlertCircle : CheckCircle;
        const iconColor = toast.type === 'error'
          ? 'text-red-500'
          : toast.type === 'success'
            ? 'text-emerald-500'
            : 'text-brand-500';

        const borderColor =
          toast.type === 'error'
            ? 'border-l-red-500'
            : toast.type === 'success'
              ? 'border-l-emerald-500'
              : 'border-l-brand-500';

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 ${borderColor} rounded-lg shadow-lg animate-slide-up`}
          >
            <IconComponent className={`text-lg flex-shrink-0 mt-0.5 ${iconColor}`} />
            <span className="text-sm font-medium text-slate-800 dark:text-white leading-snug flex-1">
              {toast.message}
            </span>
            {toast.onUndo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.onUndo?.();
                  removeToast(toast.id);
                }}
                className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap flex-shrink-0"
              >
                Deshacer
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0"
              aria-label="Cerrar"
            >
              <X className="text-xs" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
