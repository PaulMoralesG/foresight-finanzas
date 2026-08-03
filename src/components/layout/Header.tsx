// ================================================================
// Header — Barra superior SaaS: título de página + acciones globales
// ================================================================

import { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Settings, LogOut } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import type { TabId } from '@/types';

const PAGE_TITLES: Record<TabId, string> = {
  home: 'Dashboard',
  movements: 'Movimientos',
  stats: 'Estadísticas',
  profile: 'Perfil',
};

export function Header() {
  const activeTab = useUiStore((s) => s.activeTab);
  const isDark = useUiStore((s) => s.isDark);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const user = useAuthStore((s) => s.user);
  const { signOut } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  return (
    <header
      className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between h-12 px-4 md:px-6">
        {/* Left: Page title only */}
        <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">
          {PAGE_TITLES[activeTab]}
        </h1>

        {/* Right: Global actions only */}
        <div className="flex items-center gap-2">
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
                    onClick={() => handleDropdownAction(signOut)}
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
  );
}
