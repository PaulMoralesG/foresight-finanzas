// ================================================================
// Header — Barra superior SaaS: título de página + acciones globales
// ================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { Sun, Moon, Settings, LogOut, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { supabaseAvailable } from '@/config/supabase';
import type { TabId } from '@/types';

const PAGE_TITLES: Record<TabId, string> = {
  home: 'Dashboard',
  movements: 'Movimientos',
  stats: 'Estadísticas',
  profile: 'Perfil',
};

type SyncStatus = 'online' | 'syncing' | 'offline';

export function Header() {
  const activeTab = useUiStore((s) => s.activeTab);
  const isDark = useUiStore((s) => s.isDark);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const user = useAuthStore((s) => s.user);
  const { signOut } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    supabaseAvailable ? 'online' : 'offline'
  );

  // Detectar cambios de conectividad
  useEffect(() => {
    if (!supabaseAvailable) {
      setSyncStatus('offline');
      return;
    }
    const updateStatus = () => {
      setSyncStatus(navigator.onLine ? 'online' : 'offline');
    };
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  // Exponer setSyncStatus para que saveDataImmediate pueda llamarlo
  const setSyncing = useCallback(() => {
    setSyncStatus('syncing');
    setTimeout(() => {
      setSyncStatus(navigator.onLine ? 'online' : 'offline');
    }, 1500);
  }, []);

  // Guardar en window para acceso desde saveDataImmediate
  useEffect(() => {
    (window as any).__setSyncStatus = setSyncing;
    return () => { delete (window as any).__setSyncStatus; };
  }, [setSyncing]);

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
        className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between h-12 px-4 md:px-6">
          {/* Left: Page title */}
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {PAGE_TITLES[activeTab]}
            </h1>
          </div>

          {/* Right: Sync status + Global actions */}
          <div className="flex items-center gap-2">
            {/* Sync status indicator */}
            {syncStatus === 'syncing' && (
              <span className="flex items-center gap-1 text-[11px] text-amber-500" title="Sincronizando...">
                <Loader2 className="w-3 h-3 animate-spin" />
              </span>
            )}
            {syncStatus === 'online' && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-500" title="Conectado">
                <Wifi className="w-3 h-3" />
              </span>
            )}
            {syncStatus === 'offline' && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400" title="Sin conexión">
                <WifiOff className="w-3 h-3" />
              </span>
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
                  className={`w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold ring-2 transition-all ${
                    isDropdownOpen
                      ? 'ring-brand-500 dark:ring-brand-400'
                      : 'ring-transparent hover:ring-brand-200 dark:hover:ring-brand-800'
                  }`}
                  aria-label="Menú de usuario"
                  aria-expanded={isDropdownOpen}
                >
                  {((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || user.email[0].toUpperCase()}
                </button>

                {/* Dropdown */}
                {isDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 saas-card p-1.5 z-50 animate-scale-in origin-top-right shadow-lg">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {user.firstName} {user.lastName}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDropdownAction(() => useUiStore.getState().setActiveTab('profile'))}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Settings className="text-xs w-4" />
                      Configuración
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                    >
                      <LogOut className="text-xs w-4" />
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
