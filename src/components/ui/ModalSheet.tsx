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
// ================================================================

import type { ReactNode, CSSProperties } from 'react';
import { X } from 'lucide-react';
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

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-overlay animate-fade-in" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="fixed inset-0 z-modal bg-white dark:bg-slate-950 md:rounded-2xl shadow-2xl flex flex-col w-full max-w-full md:max-w-md mx-auto overflow-hidden animate-scale-in md:inset-y-6 md:mx-auto pt-safe"
        style={style}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
          <h2 id={id} className="font-bold text-sm text-slate-900 dark:text-white">
            {titulo}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {children}
      </div>
    </>
  );
}
