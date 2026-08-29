// ================================================================
// useKeyboardShortcuts — Atajos de teclado globales
// ================================================================

import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';

/**
 * ¿El foco está en algo donde el usuario está escribiendo?
 *
 * Los atajos se disparaban también dentro de un campo de texto. Ctrl+K borra
 * hasta el final de la línea en los campos de texto de macOS y en cualquier
 * consola con edición estilo Emacs, así que el atajo global le robaba una
 * pulsación de edición legítima al usuario y encima lo sacaba de la pantalla.
 */
function editandoTexto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

/** El buscador visible: hay uno para escritorio y otro para móvil, y solo uno
 *  está montado a la vez según el breakpoint. Antes se cogía el primero del
 *  DOM, que en móvil es el oculto — y enfocar un elemento oculto no hace nada. */
function buscadorVisible(): HTMLInputElement | null {
  const candidatos = document.querySelectorAll<HTMLInputElement>('[data-search-input]');
  for (const input of candidatos) {
    if (input.offsetParent !== null) return input;
  }
  return null;
}

/**
 * Registra atajos de teclado globales:
 * - Ctrl+N / Cmd+N: abrir modal de nueva transacción
 * - Ctrl+K / Cmd+K: ir a búsqueda (enfocar campo de búsqueda en Movements)
 *
 * Ninguno se dispara mientras se escribe en un campo.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (editandoTexto(e.target)) return;

      const key = e.key.toLowerCase();

      // Ctrl+N / Cmd+N: nueva transacción
      if (key === 'n') {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (!ui.isModalOpen) {
          ui.setActiveTab('movements');
          ui.openModal();
        }
      }

      // Ctrl+K / Cmd+K: buscar (navega a movements y enfoca búsqueda)
      if (key === 'k') {
        e.preventDefault();
        useUiStore.getState().setActiveTab('movements');
        // Dos frames: uno para que React pinte la pestaña nueva y otro por si
        // el layout aún no ha resuelto cuál de los dos buscadores es visible.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => buscadorVisible()?.focus());
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
