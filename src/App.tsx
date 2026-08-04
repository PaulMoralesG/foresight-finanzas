// ================================================================
// App.tsx — Componente raíz: autenticación, routing por tabs, layout SaaS
// ================================================================

import { useEffect, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { HomePage } from '@/pages/HomePage';
import { MovementsPage } from '@/pages/MovementsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { AppLayout } from '@/components/layout/AppLayout';
import { TransactionModal } from '@/components/features/movements/TransactionModal';
import { ReportModal } from '@/components/features/report/ReportModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppLoadingSkeleton, PageSkeleton } from '@/components/ui/Skeleton';

// Lazy-load: páginas pesadas que no se necesitan en la carga inicial
const StatsPage = lazy(() => import('@/pages/StatsPage').then(m => ({ default: m.StatsPage })));
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));

export function App() {
  const { user, isLoading, saveDataImmediate } = useAuth();
  const activeTab = useUiStore((s) => s.activeTab);
  const isModalOpen = useUiStore((s) => s.isModalOpen);
  const isReportModalOpen = useUiStore((s) => s.isReportModalOpen);

  const isDark = useUiStore((s) => s.isDark);

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
      case 'profile':   return <ProfilePage />;
      default:          return <HomePage />;
    }
  };

  return (
    <ErrorBoundary>
      <AppLayout>
        {renderPage()}
        {isModalOpen && <TransactionModal onSave={saveDataImmediate} />}
        {isReportModalOpen && <ReportModal />}
      </AppLayout>
    </ErrorBoundary>
  );
}
