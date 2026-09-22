// ================================================================
// ModalSheet — Hoja a pantalla completa en móvil, tarjeta centrada en escritorio
//
// El modal de transacción y el de metas de ahorro tenían este armazón escrito
// dos veces, carácter por carácter: overlay, panel, cabecera con título y
// botón de cerrar. Solo cambiaban el id, el texto y el manejador.
//
// La trampa de foco vive aquí dentro a propósito. Los dos diálogos declaraban
// `aria-modal` sin retenerla —con Tab te salías al contenido de fondo, que
// seguía siendo operable bajo el overlay— y hubo que arreglarlo por separado
// en cada uno. Metiéndola en el armazón, el próximo modal no puede olvidarla.
//
// `createPortal` a `document.body` por la misma razón: sin portal, el overlay
// y el panel —dos hermanos sueltos de un Fragment— quedan como hijos directos
// de la página que abrió el modal. Si esa página usa `space-y-*` (la mayoría),
// esa clase le mete `margin-top` a cualquier hijo que no sea el primero, y el
// Fragment no protege de eso: el modal entero aparecía corrido ~16px hacia
// abajo, dejando el header de la página asomado sin cubrir por encima. Con el
// portal, el overlay y el panel cuelgan de `<body>` y ninguna clase de la
// página los toca.
// ================================================================

import type { ReactNode, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/ui/icons.generated';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ModalSheetProps {
  /** Identificador del título, para enlazarlo con aria-labelledby. */
  id: string;
  titulo: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /**
   * Retener el foco. Se desactiva cuando hay otro diálogo por encima —el de
   * confirmar borrado, por ejemplo—, que pasa a ser quien lo retiene.
   */
  trapActivo?: boolean;
  /** Selector del elemento a enfocar al abrir; suele ser el primer campo. */
  focoInicial?: string;
  style?: CSSProperties;
}

export function ModalSheet({
  id,
  titulo,
  onClose,
  children,
  trapActivo = true,
  focoInicial,
  style,
}: ModalSheetProps) {
  const panelRef = useFocusTrap<HTMLDivElement>(trapActivo, focoInicial);

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-overlay animate-fade-in" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="fixed inset-0 z-modal bg-white dark:bg-slate-950 md:rounded-2xl shadow-2xl flex flex-col w-full max-w-full md:max-w-md mx-auto overflow-hidden animate-scale-in md:my-auto md:h-fit md:max-h-[calc(100vh-3rem)] pt-safe"
        style={style}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
          <h2 id={id} className="font-bold text-sm text-slate-900 dark:text-white">
            {titulo}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {children}
      </div>
    </>,
    document.body,
  );
}
