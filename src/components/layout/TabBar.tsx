// ================================================================
// TabBar — Navegación inferior fija (estilo fintech) + píldora animada
//   Desktop: oculto (usa Sidebar). Mobile: full-width anclado al bottom.
// ================================================================

import { useRef, useEffect, useLayoutEffect } from 'react';
import { Home, ArrowLeftRight, BarChart3, User, PiggyBank, Plus } from '@/components/ui/icons.generated';
import { useUiStore } from '@/stores/uiStore';
import type { TabId } from '@/types';

const TABS: { id: TabId; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Inicio' },
  { id: 'movements', icon: ArrowLeftRight, label: 'Movimientos' },
  { id: 'stats', icon: BarChart3, label: 'Estadísticas' },
  { id: 'savings', icon: PiggyBank, label: 'Planes' },
  { id: 'profile', icon: User, label: 'Perfil' },
];

export function TabBar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const openModal = useUiStore((s) => s.openModal);

  // Refs para la píldora deslizante animada
  const navRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pillInitialized = useRef(false);

  // Posiciona la píldora en el tab activo.
  // Primer render: sin transición (instantáneo, evita flash).
  // Cambios posteriores: animación elástica (bounce).
  useLayoutEffect(() => {
    const btn = btnRefs.current.get(activeTab);
    const pill = pillRef.current;
    const nav = navRef.current;
    if (!btn || !pill || !nav) return;

    const btnRect = btn.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();

    const left = btnRect.left - navRect.left;
    const width = btnRect.width;
    const height = btnRect.height;

    // La curva de rebote es un desplazamiento elástico: se omite si el sistema
    // pide movimiento reducido (WCAG 2.3.3). El CSS no puede cubrir esto
    // porque la transición se asigna aquí, en línea.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!pillInitialized.current || reducedMotion) {
      pill.style.transition = 'none';
      pillInitialized.current = true;
    } else {
      pill.style.transition =
        'left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), ' +
        'width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    }

    pill.style.left = `${left}px`;
    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
    pill.style.opacity = '1';
  }, [activeTab]);

  // Recalcular en resize (sin animación — es resize, no navegación)
  useEffect(() => {
    const handleResize = () => {
      const btn = btnRefs.current.get(activeTab);
      const pill = pillRef.current;
      const nav = navRef.current;
      if (!btn || !pill || !nav) return;

      pill.style.transition = 'none';
      const btnRect = btn.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      pill.style.left = `${btnRect.left - navRect.left}px`;
      pill.style.width = `${btnRect.width}px`;
      pill.style.height = `${btnRect.height}px`;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

  const renderTab = (tab: typeof TABS[0]) => {
    const isActive = activeTab === tab.id;
    const Icon = tab.icon;
    return (
      <button
        key={tab.id}
        type="button"
        ref={(el) => { if (el) btnRefs.current.set(tab.id, el); }}
        onClick={() => setActiveTab(tab.id)}
        title={tab.label}
        aria-label={tab.label}
        aria-current={isActive ? 'page' : undefined}
        className="relative flex-1 flex flex-col items-center justify-center rounded-xl z-10 min-h-[44px]"
      >
        <Icon
          className={`size-6 transition-colors duration-300 ${
            isActive
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        />
        <span
          className={`text-2xs font-semibold mt-0.5 transition-colors duration-300 ${
            isActive
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    /* ── Contenedor fixed ÚNICO (TabBar + FAB juntos).
       Solo UN position:fixed en toda la pantalla → iOS PWA no recalcula viewport.
       El FAB es absolute dentro de este contenedor, flotando sobre el borde superior. ── */
    <div className="fixed bottom-0 left-0 right-0 z-sticky">
      {/* FAB flotante — centrado horizontalmente SOBRE el TabBar, sin tocarlo.
          absolute dentro del contenedor fixed para evitar recálculo de viewport en iOS PWA.
          Solo visible en Inicio y Movimientos (donde el contexto es "añadir transacción").
          Responsive: 56px default, 64px en sm+.

          ⚠️ Antes iba centrado en top:-28px, lo que dejaba su mitad inferior
          superpuesta sobre la barra — justo encima del tercero de los cinco
          tabs, "Estadísticas", tapándole el ícono.

          Se probó despegarlo hacia arriba manteniéndolo centrado, pero un botón
          flotante en el centro se come el texto de las tarjetas al hacer
          scroll: se cambió un solape por otro peor. Ahora va abajo a la
          derecha —la posición canónica de un FAB—, donde nunca toca la barra y
          apenas invade el contenido.

          (Para el look "notch" del patrón fintech —el FAB encajado en un hueco
          de la barra— haría falta un número PAR de tabs: centrar un hueco entre
          cinco elementos es geométricamente imposible.) */}
      <button
        onClick={() => openModal()}
        className="absolute z-nav bottom-full mb-3 right-4
          w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[18px]
          bg-brand-600 hover:bg-brand-700
          text-white
          shadow-lg shadow-brand-600/30
          active:scale-90
          flex items-center justify-center
          transition-all duration-200
          ring-2 ring-white dark:ring-slate-900"
        style={{
          // FAB global: registrar un movimiento es LA acción principal de la app.
          // Visible en Inicio (donde empieza la sesión) y Movimientos.
          // Estadísticas/Planes/Perfil son vistas de lectura/configuración.
          opacity: activeTab === 'movements' || activeTab === 'home' ? 1 : 0,
          pointerEvents: activeTab === 'movements' || activeTab === 'home' ? 'auto' : 'none',
        }}
        aria-label="Agregar transacción"
        tabIndex={activeTab === 'movements' || activeTab === 'home' ? 0 : -1}
      >
        <Plus className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
      </button>

      {/* Capa 1: Tabs — padding solo arriba/abajo natural, sin safe-area */}
      <div
        ref={navRef}
        className="relative flex items-center
          px-2 pt-1.5 pb-1.5
          w-full
          bg-white dark:bg-slate-900
          border-t border-slate-200 dark:border-slate-800"
      >
        {/* Píldora deslizante — fondo sutil detrás del tab activo.
            top-1.5 + bottom-1.5: ocupa todo el alto disponible (padding interior).
            Las dimensiones exactas se ajustan vía JS en useLayoutEffect. */}
        <div
          ref={pillRef}
          className="absolute top-1.5 bottom-1.5 rounded-xl z-0 opacity-0
            bg-brand-50 dark:bg-brand-950
            ring-1 ring-brand-200/50 dark:ring-brand-800/30"
        />

        {/* Todos los tabs distribuidos uniformemente */}
        {TABS.map(renderTab)}
      </div>

      {/* Capa 2: Extensión cromática pura para el home indicator.
          Solo visible en iPhones con notch (X, 11, 12, 13, 14, 15, 16 Pro...)
          En iPhones sin notch (SE, 8) esto mide 0px. */}
      <div
        className="bg-white dark:bg-slate-900"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
    </div>
  );
}
