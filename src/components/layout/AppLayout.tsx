// ================================================================
// AppLayout.tsx — Layout SaaS responsivo
//   Desktop (lg+): Sidebar lateral + contenido con offset
//   Mobile  (<lg): TabBar inferior flotante + contenido completo
// ================================================================

import { type ReactNode, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TabBar } from './TabBar';
import { Toast } from '@/components/ui/Toast';
import { useUiStore } from '@/stores/uiStore';
import { useFinanceStore } from '@/stores/financeStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const ensureCurrentMonth = useFinanceStore((s) => s.ensureCurrentMonth);

  // Al montar: avanzar al mes actual si la fecha guardada es antigua
  useEffect(() => {
    ensureCurrentMonth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="flex flex-col min-h-dvh bg-slate-50 dark:bg-slate-950"
      style={{ minHeight: '-webkit-fill-available' }}
    >
      {/* Desktop: sidebar visible; Mobile: sidebar hidden (TabBar handles nav) */}
      <Sidebar />

      {/* Main area — offset matches sidebar width dynamically (desktop only), grows to fill viewport */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'lg:pl-[68px]' : 'lg:pl-[240px]'
        }`}
      >
        <Header />
        <main
          className="flex-1 p-4 md:p-5 lg:p-6 w-full lg:pb-6 pt-safe bg-slate-50 dark:bg-slate-950"
        >
          {children}
        </main>
      </div>

      {/* Mobile: fixed bottom TabBar (fintech-style, full-width) */}
      <div className="lg:hidden">
        <TabBar />
      </div>

      <Toast />
    </div>
  );
}
