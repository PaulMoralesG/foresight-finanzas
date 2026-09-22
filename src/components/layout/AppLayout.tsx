// ================================================================
// AppLayout.tsx — Layout SaaS responsivo
//   Desktop (lg+): Sidebar lateral + contenido con offset
//   Mobile  (<lg): TabBar inferior flotante + contenido completo
// ================================================================

import { type ReactNode, type CSSProperties, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TabBar } from './TabBar';
import { Toast } from '@/components/ui/Toast';
import { useUiStore } from '@/stores/uiStore';
import { useFinanceStore } from '@/stores/financeStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const activeTab = useUiStore((s) => s.activeTab);
  const ensureCurrentMonth = useFinanceStore((s) => s.ensureCurrentMonth);
  const materializarRecurrencias = useFinanceStore((s) => s.materializarRecurrencias);

  // Mismo criterio que el TabBar: el FAB solo se muestra donde registrar un
  // movimiento es la acción esperada.
  const showFab = activeTab === 'home' || activeTab === 'movements';

  // Atajos de teclado: Ctrl+N nueva transacción, Ctrl+K buscar
  useKeyboardShortcuts();

  // Al montar, y al volver a la pestaña: avanzar al mes actual y registrar lo
  // que las recurrencias deban haber creado.
  //
  // Va aquí, en un efecto sin dependencias (y en un listener), y NO en un
  // efecto que dependa de `recurrences` o `expenses`: materializar escribe en
  // esos mismos campos, así que esa dependencia sería un bucle de render.
  // La función es idempotente, de modo que llamarla de más no duplica nada.
  useEffect(() => {
    let corriendo = false;
    const alDia = () => {
      if (corriendo) return;
      corriendo = true;
      ensureCurrentMonth();
      void materializarRecurrencias().finally(() => { corriendo = false; });
    };
    alDia();
    const alVolver = () => { if (document.visibilityState === 'visible') alDia(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="flex flex-col min-h-dvh bg-slate-50 dark:bg-slate-950"
      style={{ minHeight: '-webkit-fill-available' }}
    >
      {/* Desktop: sidebar visible; Mobile: sidebar hidden (TabBar handles nav) */}
      <Sidebar />

      {/* Main area — el hueco de la izquierda es el ancho fijo del sidebar */}
      <div className="flex-1 flex flex-col lg:pl-[212px]">
        <Header />
        {/* Sin `pt-safe`: el Header ya aplica env(safe-area-inset-top) y está
            encima. Tenerlo en ambos sitios metía ~47px de vacío entre la
            cabecera y el contenido en cada pantalla de un iPhone con muesca
            (en Android y escritorio el inset es 0, por eso no se notaba).

            --fab-clearance: el FAB flota sobre la barra en Inicio y
            Movimientos; sin este hueco tapaba el final del contenido. Las
            demás pestañas no lo muestran y no pagan el espacio. */}
        <main
          className="flex-1 p-4 md:p-5 lg:p-6 w-full lg:pb-6 bg-slate-50 dark:bg-slate-950"
          style={{ '--fab-clearance': showFab ? '4.5rem' : '0px' } as CSSProperties}
        >
          {/* 1440px de tope: en un monitor de 1920 las tablas se abrían hasta
              400px entre columnas y la mitad del tablero quedaba vacía. Los
              modales van en `fixed` y no les afecta. */}
          <div className="max-w-[1440px] mx-auto">{children}</div>
        </main>
      </div>

      {/* Mobile: fixed bottom TabBar (fintech-style, full-width) */}
      <div className="lg:hidden">
        <TabBar />
      </div>

      <Toast />
    </div>
  );
}
