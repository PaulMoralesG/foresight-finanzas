// ================================================================
// UI STORE - Zustand (tema, tabs, modales, toast)
// ================================================================

import { create } from 'zustand';
import type { TabId } from '@/types';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  onUndo?: () => void;
}

interface UiState {
  // --- Sidebar ---
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // --- Tema ---
  isDark: boolean;
  toggleDarkMode: () => void;

  // --- Tabs ---
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // --- Navegación desde dashboard con filtro ---
  pendingFilter: string | null;
  navigateTo: (tab: TabId, filter?: string) => void;

  // --- Modal de transacción ---
  isModalOpen: boolean;
  editingId: number | null;
  openModal: (id?: number) => void;
  closeModal: () => void;

  // --- Modal de confirmación de borrado ---
  isDeleteModalOpen: boolean;
  deletingId: number | null;
  openDeleteModal: (id: number) => void;
  closeDeleteModal: () => void;

  // --- Toast notifications ---
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], onUndo?: () => void) => void;
  removeToast: (id: number) => void;

  // --- Modal de reporte ---
  isReportModalOpen: boolean;
  openReportModal: () => void;
  closeReportModal: () => void;

  // --- Filtros de estadísticas ---
  statsMode: 'month' | 'range';
  statsMonth: number;
  statsYear: number;
  statsFromDate: string | null;
  statsToDate: string | null;
  setStatsMode: (mode: 'month' | 'range') => void;
  setStatsMonth: (month: number) => void;
  setStatsYear: (year: number) => void;
  setStatsRange: (from: string | null, to: string | null) => void;
}

let toastId = 0;

const savedCollapsed = localStorage.getItem('saas-sidebar-collapsed');

export const useUiStore = create<UiState>((set) => ({
  // Sidebar
  sidebarCollapsed: savedCollapsed === 'true',
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      localStorage.setItem('saas-sidebar-collapsed', String(next));
      return { sidebarCollapsed: next };
    }),

  // Tema — mismo orden de prioridad que el script inline en index.html
  // (evita flicker y toggles innecesarios al montar React)
  isDark: (() => {
    const saved = localStorage.getItem('foresight-dark-mode');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  })(),
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.isDark;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('foresight-dark-mode', String(next));
      return { isDark: next };
    }),

  // Tabs — persisted on refresh (F5) so user stays on current section
  activeTab: ((localStorage.getItem('foresight-active-tab') || 'home') as TabId),
  setActiveTab: (tab) => {
    localStorage.setItem('foresight-active-tab', tab);
    // Limpiar pendingFilter si no vamos a Movements (donde se consume)
    set({ activeTab: tab, pendingFilter: tab === 'movements' ? undefined : null });
  },

  // Dashboard → sección con filtro pre-aplicado
  pendingFilter: null,
  navigateTo: (tab, filter) => {
    localStorage.setItem('foresight-active-tab', tab);
    set({ activeTab: tab, pendingFilter: filter || null });
  },

  // Modal transacción
  isModalOpen: false,
  editingId: null as number | null,
  openModal: (id?: number) => set({ isModalOpen: true, editingId: id ?? null }),
  closeModal: () => set({ isModalOpen: false, editingId: null }),

  // Modal confirmación de borrado
  isDeleteModalOpen: false,
  deletingId: null,
  openDeleteModal: (id) => set({ isDeleteModalOpen: true, deletingId: id }),
  closeDeleteModal: () => set({ isDeleteModalOpen: false, deletingId: null }),

  // Toasts
  toasts: [],
  addToast: (message, type = 'info', onUndo) => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { id, message, type, onUndo }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  // Report modal
  isReportModalOpen: false,
  openReportModal: () => set({ isReportModalOpen: true }),
  closeReportModal: () => set({ isReportModalOpen: false }),

  // Stats filters
  statsMode: 'month',
  statsMonth: new Date().getMonth(),
  statsYear: new Date().getFullYear(),
  statsFromDate: null,
  statsToDate: null,
  setStatsMode: (mode) => set({ statsMode: mode }),
  setStatsMonth: (month) => set({ statsMonth: month }),
  setStatsYear: (year) => set({ statsYear: year }),
  setStatsRange: (from, to) => set({ statsFromDate: from, statsToDate: to }),
}));
