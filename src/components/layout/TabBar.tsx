// ================================================================
// TabBar — Navegación inferior fija (estilo fintech) + píldora animada
//   Desktop: oculto (usa Sidebar). Mobile: full-width anclado al bottom.
//
//   Ocho vistas no caben en 390 px: van cuatro en la barra (MOBILE_TABS) y
//   las otras cuatro en "Más", una hoja pequeña anclada sobre la barra.
// ================================================================

import { useRef, useEffect, useLayoutEffect, useState, useId } from 'react';
import { Ellipsis, Plus } from '@/components/ui/icons.generated';
import { useUiStore } from '@/stores/uiStore';
import { MOBILE_TABS, VIEWS, vistaPorId, type Vista } from '@/config/views';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { TabId } from '@/types';

const TABS: Vista[] = MOBILE_TABS.map(vistaPorId);
const MAS: Vista[] = VIEWS.filter((v) => !MOBILE_TABS.includes(v.id));
/** Id de la pseudo-pestaña "Más" en el mapa de refs de la píldora. */
const ID_MAS = '__mas__';

export function TabBar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const openModal = useUiStore((s) => s.openModal);
  const isModalOpen = useUiStore((s) => s.isModalOpen);
  // En Movimientos, desde tablet ya está el botón "Nueva transacción" en la
  // cabecera de la página: dos accesos a lo mismo en la misma pantalla sobran.
  const fabVisible = (activeTab === 'home' || activeTab === 'movements') && !isModalOpen;

  const [masAbierto, setMasAbierto] = useState(false);
  const masId = useId();
  const hojaRef = useFocusTrap<HTMLDivElement>(masAbierto);
  useEscapeKey(() => setMasAbierto(false), masAbierto);

  // La píldora se posa sobre "Más" cuando la vista activa vive ahí dentro.
  const enMas = MAS.some((v) => v.id === activeTab);
  const pillTarget = enMas ? ID_MAS : activeTab;

  const irA = (id: TabId) => {
    setMasAbierto(false);
    setActiveTab(id);
  };

  // Refs para la píldora deslizante animada
  const navRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pillInitialized = useRef(false);

  // Posiciona la píldora en el tab activo.
  // Primer render: sin transición (instantáneo, evita flash).
  // Cambios posteriores: animación elástica (bounce).
  useLayoutEffect(() => {
    const btn = btnRefs.current.get(pillTarget);
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
  }, [pillTarget]);

  // Recalcular en resize (sin animación — es resize, no navegación)
  useEffect(() => {
    const handleResize = () => {
      const btn = btnRefs.current.get(pillTarget);
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
  }, [pillTarget]);

  const renderTab = (tab: Vista) => {
    const isActive = activeTab === tab.id;
    const Icon = tab.icon;
    return (
      <button
        key={tab.id}
        type="button"
        ref={(el) => { if (el) btnRefs.current.set(tab.id, el); }}
        onClick={() => irA(tab.id)}
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

  const colorMas = enMas || masAbierto ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400';

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
        className={`absolute z-nav bottom-full mb-3 right-4 ${activeTab === 'movements' ? 'md:hidden' : ''}
          w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[18px]
          bg-brand-600 hover:bg-brand-700
          text-white
          shadow-lg shadow-brand-600/30
          active:scale-90
          flex items-center justify-center
          transition-all duration-200
          ring-2 ring-white dark:ring-slate-900`}
        style={{
          // FAB global: registrar un movimiento es LA acción principal de la app.
          // Visible en Resumen (donde empieza la sesión) y Movimientos; el
          // resto son vistas de lectura o de configuración. Con un modal
          // abierto se esconde: no compite con el formulario.
          opacity: fabVisible ? 1 : 0,
          pointerEvents: fabVisible ? 'auto' : 'none',
        }}
        aria-label="Agregar transacción"
        tabIndex={fabVisible ? 0 : -1}
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

        {/* Cuatro tabs + "Más", distribuidos uniformemente */}
        {TABS.map(renderTab)}
        <button
          type="button"
          ref={(el) => { if (el) btnRefs.current.set(ID_MAS, el); }}
          onClick={() => setMasAbierto((v) => !v)}
          title="Más secciones"
          aria-label="Más secciones"
          aria-haspopup="dialog"
          aria-expanded={masAbierto}
          aria-controls={masId}
          className="relative flex-1 flex flex-col items-center justify-center rounded-xl z-10 min-h-[44px]"
        >
          <Ellipsis className={`size-6 transition-colors duration-300 ${colorMas}`} />
          <span className={`text-2xs font-semibold mt-0.5 transition-colors duration-300 ${colorMas}`}>
            {enMas ? vistaPorId(activeTab).label : 'Más'}
          </span>
        </button>
      </div>

      {/* Hoja "Más": las cuatro vistas que no caben en la barra. Anclada sobre
          la barra (no a pantalla completa como ModalSheet): son cuatro
          entradas, no un formulario. */}
      {masAbierto && (
        <>
          <div
            className="fixed inset-0 z-overlay bg-black/40 animate-fade-in"
            onClick={() => setMasAbierto(false)}
            aria-hidden
          />
          <div
            ref={hojaRef}
            id={masId}
            role="dialog"
            aria-modal="true"
            aria-label="Más secciones"
            className="absolute bottom-full left-0 right-0 z-modal mx-2 mb-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 grid grid-cols-4 gap-1 animate-slide-up"
          >
            {MAS.map((v) => {
              const Icon = v.icon;
              const isActive = activeTab === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => irA(v.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-3 min-h-[44px] text-2xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-400'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="size-6" />
                  {v.label}
                </button>
              );
            })}
          </div>
        </>
      )}

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
