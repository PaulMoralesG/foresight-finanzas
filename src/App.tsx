// ================================================================
// App.tsx — Componente raíz: autenticación, routing por tabs, layout SaaS
// ================================================================

import { useEffect, Suspense } from 'react';
import { Download, RefreshCw, X } from '@/components/ui/icons.generated';
import { useAuth, useAuthSession } from '@/hooks/useAuth';
import { lazyConRecuperacion } from '@/lib/lazy-recovery';
import { usePWA } from '@/hooks/usePWA';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { useNetWorthSnapshot } from '@/hooks/useNetWorthSnapshot';
import { supabaseAvailable } from '@/config/supabase';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUiStore } from '@/stores/uiStore';
import { HomePage } from '@/pages/HomePage';
import { MovementsPage } from '@/pages/MovementsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { DebtsPage } from '@/pages/DebtsPage';
import { GoalsPage } from '@/pages/GoalsPage';
import { NetWorthPage } from '@/pages/NetWorthPage';
import { AccountsPage } from '@/pages/AccountsPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { TransactionModal } from '@/components/features/movements/TransactionModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppLoadingSkeleton } from '@/components/ui/Skeleton';

// Lazy-load: lo que no se necesita en la carga inicial (el login y el reporte;
// las ocho vistas van estáticas para que cambiar de pestaña sea instantáneo).
//
// Van con `lazyConRecuperacion` y no con `lazy` a secas: al publicar una
// versión, los chunks cambian de hash y los viejos desaparecen del servidor.
// Un shell servido desde el precache del worker anterior pide el chunk que ya
// no existe, el import falla y la pantalla entera cae al ErrorBoundary. El
// envoltorio activa el worker en espera y recarga. Ver src/lib/lazy-recovery.ts.
const LoginPage = lazyConRecuperacion(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));
// Lazy: el modal y la vista imprimible del reporte (compartida con StatsPage)
// solo hacen falta al exportar; fuera de la carga inicial aunque pesen poco.
const ReportModal = lazyConRecuperacion(() => import('@/components/features/report/ReportModal').then(m => ({ default: m.ReportModal })));

export function App() {
  // Único punto de arranque de la sesión en toda la app. El resto de los
  // componentes usa useAuth(), que no tiene efectos.
  useAuthSession();
  // Cierre mensual del patrimonio: se arma solo cuando cambian los datos.
  useNetWorthSnapshot();

  const { user, isLoading, saveData, signOut } = useAuth();
  const activeTab = useUiStore((s) => s.activeTab);
  const isModalOpen = useUiStore((s) => s.isModalOpen);
  const isReportModalOpen = useUiStore((s) => s.isReportModalOpen);
  const isDark = useUiStore((s) => s.isDark);

  // PWA
  const { showInstallBanner, handleInstall, swUpdateReady, handleUpdate, dismissInstallBanner } = usePWA();

  // Restaurar preferencia de dark mode al montar
  useEffect(() => {
    const saved = localStorage.getItem('foresight-dark-mode');
    const state = useUiStore.getState();
    if (saved === 'true' && !state.isDark) state.toggleDarkMode();
    else if (saved === 'false' && state.isDark) state.toggleDarkMode();
  }, []);

  // Aplicar clase 'dark' al <html> cuando cambia isDark
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('foresight-dark-mode', String(isDark));
  }, [isDark]);

  // Cierre por inactividad. Solo con sesión real: en modo offline no hay nada
  // que cerrar y desloguear solo estorbaría. signOut() ya hace flush del sync
  // antes de invalidar el token, así que no se pierde ningún cambio pendiente.
  const { avisando, segundosRestantes } = useIdleLogout({
    enabled: supabaseAvailable && !!user,
    onTimeout: signOut,
  });

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }

  if (!user) {
    return (
      <Suspense fallback={<AppLoadingSkeleton />}>
        <LoginPage />
      </Suspense>
    );
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'home':      return <HomePage />;
      case 'movements': return <MovementsPage />;
      case 'budgets':   return <BudgetsPage />;
      case 'debts':     return <DebtsPage />;
      case 'goals':     return <GoalsPage />;
      case 'networth':  return <NetWorthPage />;
      case 'accounts':  return <AccountsPage />;
      case 'settings':  return <SettingsPage />;
      default:          return <HomePage />;
    }
  };

  return (
    <ErrorBoundary>
      {/* ── PWA Install Banner ── */}
      {showInstallBanner && (
        <div className="fixed bottom-20 left-4 right-4 z-banner sm:left-auto sm:right-4 sm:bottom-20 sm:w-80 animate-slide-up">
          <div className="saas-card p-4 shadow-2xl border-brand-500/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center flex-shrink-0">
                <Download className="text-brand-600 dark:text-brand-400 w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Instalar aplicación</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Accede rápido desde tu pantalla de inicio</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleInstall} className="saas-btn-primary saas-btn-sm text-xs">Instalar</button>
                  <button onClick={dismissInstallBanner} className="saas-btn-ghost saas-btn-sm text-xs">Ahora no</button>
                </div>
              </div>
              <button onClick={dismissInstallBanner} aria-label="Cerrar" className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Worker Update Banner ── */}
      {swUpdateReady && (
        <div className="fixed top-16 left-4 right-4 z-banner sm:left-auto sm:right-4 sm:w-80 animate-slide-up">
          <div className="saas-card p-4 shadow-2xl border-amber-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="text-amber-600 dark:text-amber-400 w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Nueva versión disponible</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Actualiza para ver las últimas mejoras</p>
                <button onClick={handleUpdate} className="saas-btn-primary saas-btn-sm text-xs mt-3">Actualizar ahora</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aviso antes de cerrar por inactividad. Cualquier interacción con el
          diálogo cuenta como actividad y reinicia el contador, así que basta
          con pulsar "Seguir conectado". */}
      <ConfirmDialog
        open={avisando}
        variant="warning"
        title="¿Sigues ahí?"
        message={`Por seguridad cerraremos tu sesión en ${segundosRestantes} segundo${segundosRestantes === 1 ? '' : 's'} por inactividad. Tus datos ya están guardados.`}
        confirmLabel="Seguir conectado"
        cancelLabel="Cerrar sesión"
        onConfirm={() => { /* el propio clic reinicia el contador */ }}
        onCancel={signOut}
      />

      <AppLayout>
        {renderPage()}
        {isModalOpen && <TransactionModal onSave={saveData} />}
        {isReportModalOpen && (
          <Suspense fallback={null}>
            <ReportModal />
          </Suspense>
        )}
      </AppLayout>
    </ErrorBoundary>
  );
}
