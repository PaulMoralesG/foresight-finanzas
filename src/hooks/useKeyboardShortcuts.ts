// ================================================================
// useKeyboardShortcuts — Atajos de teclado globales
// ================================================================

import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';

/**
 * Registra atajos de teclado globales:
 * - Ctrl+N / Cmd+N: abrir modal de nueva transacción
 * - Ctrl+K / Cmd+K: ir a búsqueda (enfocar campo de búsqueda en Movements)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl+N / Cmd+N: nueva transacción
      if (mod && e.key === 'n') {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (!ui.isModalOpen) {
          ui.setActiveTab('movements');
          ui.openModal();
        }
      }

      // Ctrl+K / Cmd+K: buscar (navega a movements y enfoca búsqueda)
      if (mod && e.key === 'k') {
        e.preventDefault();
        const ui = useUiStore.getState();
        ui.setActiveTab('movements');
        // Enfocar input de búsqueda después de navegar
        setTimeout(() => {
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[placeholder="Buscar..."]'
          );
          searchInput?.focus();
        }, 100);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
