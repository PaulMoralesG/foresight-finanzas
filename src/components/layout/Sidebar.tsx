// ================================================================
// Sidebar.tsx — Navegación lateral (solo escritorio lg+)
// En móvil se usa TabBar (barra flotante inferior)
//
// Tipografía, medidas y color calcados de `.sidebar` de la referencia
// Balance Dual: 212px de ancho, fondo del propio plano (no una superficie
// aparte), una sola línea —la del borde derecho— y nada de plegado: el menú
// está siempre a la vista.
// ================================================================

import { TrendingUp } from '@/components/ui/icons.generated';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { userInitials } from '@/lib/utils';
import { SECCIONES, VIEWS } from '@/config/views';

export function Sidebar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const user = useAuthStore((s) => s.user);

  const initials = userInitials(user);

  return (
    <aside
      className="
        hidden lg:flex fixed top-0 left-0 z-nav h-full w-[212px]
        bg-slate-50 dark:bg-slate-950
        border-r border-slate-200 dark:border-slate-800
        flex-col gap-[18px] px-3.5 py-5
      "
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
    >
      {/* Marca: el nombre en la serif de títulos y una línea de apoyo debajo,
          como el bloque `.brand` de la referencia. */}
      <div className="flex items-center gap-2.5 px-1.5">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white flex-shrink-0">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[1.15rem] font-semibold leading-tight text-slate-900 dark:text-white">
            Foresight
          </p>
          <p className="text-[0.7rem] text-slate-400 dark:text-slate-500 truncate">
            Personal y negocio
          </p>
        </div>
      </div>

      {/* Dos secciones con cabecera, como Balance Dual: "Día a día" es lo que
          se abre cada día; "Patrimonio", lo que se revisa cada tanto. */}
      <nav className="flex flex-col gap-0.5" aria-label="Secciones">
        {SECCIONES.map((seccion) => (
          <div key={seccion.id} className="flex flex-col gap-0.5">
            <p className="px-2 pt-2.5 pb-0.5 first:pt-0 text-[0.66rem] font-semibold uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500">
              {seccion.label}
            </p>
            {VIEWS.filter((v) => v.seccion === seccion.id).map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                    w-full flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left
                    text-[0.88rem] transition-colors duration-150
                    ${isActive
                      ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }
                  `}
                >
                  <Icon className={`text-base flex-shrink-0 ${isActive ? '' : 'opacity-85'}`} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Pie: quién está dentro. Sin línea de separación — lo separa el hueco,
          igual que `.side-foot` en la referencia. */}
      {user && (
        <div className="mt-auto flex items-center gap-2.5 px-1.5">
          <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-2xs font-bold flex-shrink-0">
            {initials}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {user.firstName} {user.lastName}
          </p>
        </div>
      )}
    </aside>
  );
}
