// ================================================================
// Sidebar.tsx — Navegación lateral SaaS (solo desktop lg+)
// En móvil se usa TabBar (barra flotante inferior)
// ================================================================

import { LayoutGrid, ArrowLeftRight, BarChart3, User, TrendingUp, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import type { TabId } from '@/types';

const NAV_ITEMS: { id: TabId; icon: typeof LayoutGrid; label: string }[] = [
  { id: 'home', icon: LayoutGrid, label: 'Dashboard' },
  { id: 'movements', icon: ArrowLeftRight, label: 'Movimientos' },
  { id: 'stats', icon: BarChart3, label: 'Estadísticas' },
  { id: 'profile', icon: User, label: 'Perfil' },
];

export function Sidebar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);

  const initials = user
    ? ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || user.email[0].toUpperCase()
    : '?';

  return (
    <aside
      className={`
        hidden lg:flex fixed top-0 left-0 z-40 h-full
        bg-white dark:bg-slate-900
        border-r border-slate-200 dark:border-slate-800
        flex-col transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[68px]' : 'w-[240px]'}
      `}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
        {/* Brand */}
        <div className={`flex items-center h-12 px-4 border-b border-slate-200 dark:border-slate-800 ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white flex-shrink-0">
            <TrendingUp className="text-sm" />
          </div>
          {!collapsed && (
            <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap text-sm">
              Foresight
            </span>
          )}
        </div>

        {/* Navigation — overflow-visible so tooltips render outside */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                className={`
                  w-full flex items-center rounded-lg transition-all duration-150 relative
                  ${collapsed ? 'justify-center px-0 py-2.5 group' : 'px-3 py-2.5 gap-3'}
                  ${isActive
                    ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                  }
                `}
              >
                <Icon className={`text-base flex-shrink-0 ${isActive ? 'text-brand-600 dark:text-brand-400' : ''}`} />
                {!collapsed && <span className="text-sm whitespace-nowrap">{item.label}</span>}
                {isActive && !collapsed && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-600 dark:bg-brand-400 flex-shrink-0" />
                )}
                {/* Tooltip cuando está colapsado */}
                {collapsed && (
                  <span className="
                    absolute left-full ml-2 top-1/2 -translate-y-1/2
                    px-2.5 py-1.5 rounded-lg text-xs font-medium
                    bg-slate-800 dark:bg-slate-700 text-white
                    whitespace-nowrap z-50 pointer-events-none
                    opacity-0 group-hover:opacity-100
                    transition-opacity duration-150
                    shadow-lg
                  ">
                    {item.label}
                    <span className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[5px] border-r-slate-800 dark:border-r-slate-700" />
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className={`border-t border-slate-200 dark:border-slate-800 p-3 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
          {collapsed && user && (
            <div className="relative group">
              <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              {/* Tooltip con nombre al hover */}
              <span className="
                absolute left-full ml-2 top-1/2 -translate-y-1/2
                px-2.5 py-1.5 rounded-lg text-xs font-medium
                bg-slate-800 dark:bg-slate-700 text-white
                whitespace-nowrap z-50 pointer-events-none
                opacity-0 group-hover:opacity-100
                transition-opacity duration-150
                shadow-lg
              ">
                {user.firstName} {user.lastName}
                <span className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[5px] border-r-slate-800 dark:border-r-slate-700" />
              </span>
            </div>
          )}
          {!collapsed && user && (
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {user.firstName} {user.lastName}
                </p>
              </div>
            </div>
          )}

          {/* Collapse toggle (desktop) */}
          <button
            onClick={toggleSidebar}
            className="hidden lg:flex w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronsRight className="text-xs" /> : <ChevronsLeft className="text-xs" />}
          </button>
        </div>
      </aside>
  );
}
