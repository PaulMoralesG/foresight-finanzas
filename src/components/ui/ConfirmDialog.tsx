// ================================================================
// ConfirmDialog — Diálogo de confirmación modal (móvil + desktop)
//
// Se monta con `createPortal` a `document.body`, igual que ModalSheet: si se
// renderizara en su sitio dentro de una página con `space-y-*`, esa clase le
// metería `margin-top` al `fixed inset-0` de aquí abajo y lo correría hacia
// abajo, dejando el header de la página asomado por encima del overlay.
// ================================================================

import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from '@/components/ui/icons.generated';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEscapeKey(onCancel, open);

  // Retener el foco: `aria-modal` lo promete, pero sin trampa el fondo seguía
  // siendo alcanzable con Tab. Enfoca "Cancelar", la salida segura.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, '[data-confirm-cancel]');

  // Ids únicos por instancia: la app puede montar más de un ConfirmDialog
  // (ProfilePage renderiza dos), y unos ids fijos los harían ambiguos.
  const titleId = useId();
  const messageId = useId();

  // Bloquear scroll cuando está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  const confirmColors = variant === 'danger'
    ? 'bg-expense-600 hover:bg-expense-700 text-white'
    // amber-700 y no amber-500: el texto blanco sobre amber-500 daba 2.2:1.
    : 'bg-amber-700 hover:bg-amber-800 text-white';

  return createPortal(
    <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        /* El margen inferior en móvil tiene que salvar el TabBar fijo (~56px
           + safe-area): con `mb-4` los botones Cancelar/Eliminar quedaban
           medio tapados por la barra, justo los controles que hay que pulsar.
           A partir de sm el diálogo va centrado y no necesita el hueco. */
        className="relative w-full sm:max-w-sm mx-4 mb-[calc(var(--bottom-clearance)+1rem)] sm:mb-0 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 animate-scale-in z-10"
      >
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            variant === 'danger' ? 'bg-expense-100 dark:bg-expense-950 text-expense-600 dark:text-expense-400' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-slate-900 dark:text-white mb-1">
              {title}
            </h3>
            <p id={messageId} className="text-sm text-slate-600 dark:text-slate-400">
              {message}
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            data-confirm-cancel
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${confirmColors}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
