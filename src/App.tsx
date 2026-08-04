// ================================================================
// App.tsx — Componente raíz: autenticación, routing por tabs, layout SaaS
// ================================================================

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { MovementsPage } from '@/pages/MovementsPage';
import { StatsPage } from '@/pages/StatsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { AppLayout } from '@/components/layout/AppLayout';
import { TransactionModal } from '@/components/features/movements/TransactionModal';
import { ReportModal } from '@/components/features/report/ReportModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export function App() {
  const { user, isLoading, saveDataImmediate } = useAuth();
  const activeTab = useUiStore((s) => s.activeTab);
  const isModalOpen = useUiStore((s) => s.isModalOpen);
  const isReportModalOpen = useUiStore((s) => s.isReportModalOpen);
  const isDark = useUiStore((s) => s.isDark);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);

  // Restaurar preferencia de dark mode al montar
  useEffect(() => {
    const saved = localStorage.getItem('foresight-dark-mode');
    if (saved === 'true' && !isDark) toggleDarkMode();
    else if (saved === 'false' && isDark) toggleDarkMode();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Aplicar clase 'dark' al <html> cuando cambia isDark
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('foresight-dark-mode', String(isDark));
  }, [isDark]);

  if (isLoading) {
    return <LoadingSpinner text="Cargando tu cuenta..." />;
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'home':      return <HomePage />;
      case 'movements': return <MovementsPage />;
      case 'stats':     return <StatsPage />;
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
