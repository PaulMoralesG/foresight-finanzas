// ================================================================
// App.tsx — Componente raíz: autenticación, routing por tabs, layout SaaS
// ================================================================

import { useEffect, lazy, Suspense } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePWA } from '@/hooks/usePWA';
import { useUiStore } from '@/stores/uiStore';
import { HomePage } from '@/pages/HomePage';
import { MovementsPage } from '@/pages/MovementsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { AppLayout } from '@/components/layout/AppLayout';
import { TransactionModal } from '@/components/features/movements/TransactionModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppLoadingSkeleton, PageSkeleton } from '@/components/ui/Skeleton';

// Lazy-load: páginas pesadas que no se necesitan en la carga inicial
const StatsPage = lazy(() => import('@/pages/StatsPage').then(m => ({ default: m.StatsPage })));
const SavingsPage = lazy(() => import('@/pages/SavingsPage').then(m => ({ default: m.SavingsPage })));
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));
// Lazy: jspdf + html2canvas (~400 KB) solo se descargan al abrir el reporte
const ReportModal = lazy(() => import('@/components/features/report/ReportModal').then(m => ({ default: m.ReportModal })));

export function App() {
  const { user, isLoading, saveData } = useAuth();
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
      case 'stats':     return <Suspense fallback={<PageSkeleton />}><StatsPage /></Suspense>;
      case 'savings':   return <Suspense fallback={<PageSkeleton />}><SavingsPage /></Suspense>;
      case 'profile':   return <ProfilePage />;
      default:          return <HomePage />;
    }
  };

  return (
    <ErrorBoundary>
      {/* ── PWA Install Banner ── */}
      {showInstallBanner && (
        <div className="fixed bottom-20 left-4 right-4 z-[250] sm:left-auto sm:right-4 sm:bottom-20 sm:w-80 animate-slide-up">
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
              <button onClick={dismissInstallBanner} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Worker Update Banner ── */}
      {swUpdateReady && (
        <div className="fixed top-16 left-4 right-4 z-[250] sm:left-auto sm:right-4 sm:w-80 animate-slide-up">
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
