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
//
// En móvil (< md) es una HOJA INFERIOR: alto según su contenido, con tope en
// la parte visible de la pantalla, esquinas superiores redondeadas y las
// zonas seguras respetadas (Dynamic Island/notch arriba, indicador de inicio
// abajo). `useVisualViewport` la mantiene sobre el teclado, así que la
// cabecera con «Cerrar» nunca sale de la pantalla. En escritorio sigue siendo
// una tarjeta centrada.
//
// En pantallas táctiles no se enfoca ningún campo al abrir: el teclado
// aparecía sin que nadie lo pidiera, tapaba medio formulario y el navegador
// desplazaba la hoja. El foco va al panel (los lectores de pantalla siguen
// entrando al diálogo) y el teclado sale cuando la persona toca un campo.
// ================================================================

import { useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/ui/icons.generated';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { esPunteroTactil, useVisualViewport } from '@/hooks/useVisualViewport';

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
  /** Selector del elemento a enfocar al abrir con teclado/ratón; en táctil se ignora. */
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
  // Se decide una vez al montar: el tipo de puntero no cambia con el modal abierto.
  const [tactil] = useState(esPunteroTactil);
  const panelRef = useFocusTrap<HTMLDivElement>(
    trapActivo,
    tactil ? '[data-modal-panel]' : focoInicial,
  );
  useVisualViewport(panelRef);

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-overlay animate-fade-in" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        data-modal-panel
        className="modal-sheet z-modal bg-white dark:bg-slate-950 shadow-2xl flex flex-col overflow-hidden outline-none animate-slide-up md:animate-scale-in"
        style={style}
      >
        {/* Asa: indica en móvil que es una hoja que sube desde abajo. */}
        <div className="md:hidden flex justify-center pt-2 pb-0.5 flex-shrink-0" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        <div className="flex items-center justify-between gap-3 pl-4 pr-2 py-1.5 md:pl-3 md:py-2 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <h2 id={id} className="font-semibold text-base md:text-sm text-slate-900 dark:text-white min-w-0 truncate">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center rounded-full text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 md:bg-transparent md:dark:bg-transparent hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
          >
            <X className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        </div>

        {children}
      </div>
    </>,
    document.body,
  );
}
