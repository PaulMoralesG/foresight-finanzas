// ================================================================
// Header — Barra superior SaaS: título de página + acciones globales
// ================================================================

import { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Settings, LogOut, Wifi, WifiOff, Loader2, CloudOff } from '@/components/ui/icons.generated';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { supabaseAvailable } from '@/config/supabase';
import { userInitials } from '@/lib/utils';
import { vistaPorId } from '@/config/views';
import { AmbitoSegmentado } from '@/components/layout/AmbitoSegmentado';

/** Vistas sin ámbito: cuentas y patrimonio no se etiquetan; ajustes es global. */
const SIN_AMBITO = new Set(['accounts', 'networth', 'settings']);

export function Header() {
  const activeTab = useUiStore((s) => s.activeTab);
  const isDark = useUiStore((s) => s.isDark);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  // isOnline = conectividad de red (navigator.onLine).
  // syncState = resultado REAL del último push a Supabase (lo controla
  // syncService, no este componente). Antes el indicador solo miraba
  // navigator.onLine, así que un usuario "en línea" con el sync fallando
  // en silencio tras agotar los reintentos veía un ícono verde igual.
  const isOnline = useUiStore((s) => s.isOnline);
  const setOnline = useUiStore((s) => s.setOnline);
  const syncState = useUiStore((s) => s.syncState);
  const user = useAuthStore((s) => s.user);
  const { signOut } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const vista = vistaPorId(activeTab);
  const conAmbito = !SIN_AMBITO.has(activeTab);

  // Detectar cambios de conectividad de red (independiente del estado de sync)
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    updateOnline();
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [setOnline]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const handleDropdownAction = (action: () => void) => {
    setIsDropdownOpen(false);
    action();
  };

  const handleSignOut = () => {
    setIsDropdownOpen(false);
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = () => {
    setShowSignOutConfirm(false);
    signOut();
  };

  return (
    <>
      <header
        /* Sin línea inferior ni superficie propia: el mismo plano que el
           resto de la página, como el `.topline` de la referencia. El fondo
           va opaco (no translúcido) porque, sin borde, el contenido que pasa
           por debajo al desplazarse se transparentaría sobre el título. */
        className="sticky top-0 z-sticky bg-slate-50 dark:bg-slate-950"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between h-14 md:h-16 px-4 md:px-6 gap-3">
          {/* Left: título de la vista + una línea que dice qué es (view-sub).
              El título va a 1.25/1.5rem como `.view-title` de la referencia:
              con 16px no había salto de jerarquía con los títulos de tarjeta y
              ninguna pantalla tenía un ancla visual al entrar. */}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white truncate leading-tight">
              {vista.label}
            </h1>
            <p className="hidden md:block text-xs text-slate-600 dark:text-slate-400 truncate">{vista.descripcion}</p>
          </div>

          {/* Right: ámbito + estado de sync + acciones globales */}
          <div className="flex items-center gap-2">
            {conAmbito && <AmbitoSegmentado className="hidden sm:inline-flex" />}

            {/* Sync status indicator — combina red real + resultado real del push */}
            {/* Región viva: el estado solo se comunicaba por `title`, que la
                mayoría de lectores de pantalla no anuncia, así que pasar a
                "error de sincronización" era invisible sin ratón. */}
            {supabaseAvailable && (
              <div role="status" aria-live="polite" className="flex items-center">
                {!isOnline ? (
                  <span className="flex items-center gap-1 text-2xs text-slate-600 dark:text-slate-400" title="Sin conexión">
                    <WifiOff className="w-3 h-3" />
                    <span className="sr-only">Sin conexión</span>
                  </span>
                ) : syncState === 'syncing' ? (
                  /* amber-600 en claro: amber-500 sobre la cabecera blanca daba
                     2.15:1, por debajo del mínimo de 3:1 que WCAG 1.4.11 pide a
                     un icono (el texto de este indicador es sr-only). */
                  <span className="flex items-center gap-1 text-2xs text-amber-600 dark:text-amber-500" title="Sincronizando...">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="sr-only">Sincronizando</span>
                  </span>
                ) : syncState === 'error' ? (
                  <span
                    className="flex items-center gap-1 text-2xs text-expense-600 dark:text-expense-400"
                    title="No se pudo sincronizar con la nube. Tus cambios están guardados solo en este dispositivo."
                  >
                    <CloudOff className="w-3 h-3" />
                    <span className="sr-only">
                      No se pudo sincronizar con la nube. Tus cambios están guardados solo en este dispositivo.
                    </span>
                  </span>
                ) : syncState === 'local-only' ? (
                  <span
                    className="flex items-center gap-1 text-2xs text-amber-600 dark:text-amber-500"
                    title="Sincronización desactivada (falta migrar el esquema de Supabase)"
                  >
                    <CloudOff className="w-3 h-3" />
                    <span className="sr-only">Sincronización desactivada. Los cambios se guardan solo en este dispositivo.</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-2xs text-income-600 dark:text-income-400" title="Sincronizado">
                    <Wifi className="w-3 h-3" />
                    <span className="sr-only">Sincronizado</span>
                  </span>
                )}
              </div>
            )}

            {/* Dark mode toggle pill */}
            <button
              onClick={toggleDarkMode}
              className="dark-mode-pill"
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              <span className={`dark-mode-pill-option ${!isDark ? 'active' : ''}`}>
                <Sun className="w-3.5 h-3.5" />
              </span>
              <span className={`dark-mode-pill-option ${isDark ? 'active' : ''}`}>
                <Moon className="w-3.5 h-3.5" />
              </span>
            </button>

            {/* User avatar */}
            {user && (
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`saas-hit w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold ring-2 transition-all ${
                    isDropdownOpen
                      ? 'ring-brand-500 dark:ring-brand-400'
                      : 'ring-transparent hover:ring-brand-200 dark:hover:ring-brand-800'
                  }`}
                  aria-label="Menú de usuario"
                  aria-expanded={isDropdownOpen}
                >
                  {userInitials(user)}
                </button>

                {/* Dropdown */}
                {isDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 saas-card p-1.5 z-popover animate-scale-in origin-top-right shadow-lg">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {user.firstName} {user.lastName}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDropdownAction(() => useUiStore.getState().setActiveTab('settings'))}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Configuración
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-expense-600 dark:text-expense-400 hover:bg-expense-50 dark:hover:bg-expense-950 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* En móvil el segmentado no cabe junto al título: segunda fila */}
        {conAmbito && (
          <div className="sm:hidden px-4 pb-2 -mt-1">
            <AmbitoSegmentado />
          </div>
        )}
      </header>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="Cerrar sesión"
        message="¿Estás seguro? Los datos no sincronizados se guardarán localmente y se enviarán cuando vuelvas a iniciar sesión."
        confirmLabel="Cerrar sesión"
        onConfirm={confirmSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </>
  );
}
