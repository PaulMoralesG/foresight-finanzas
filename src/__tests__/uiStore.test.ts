// ================================================================
// TESTS — src/stores/uiStore.ts
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUiStore } from '@/stores/uiStore';

function resetUiStore() {
  useUiStore.setState({
    sidebarCollapsed: false,
    isDark: false,
    activeTab: 'home',
    pendingFilter: null,
    isModalOpen: false,
    editingId: null,
    isDeleteModalOpen: false,
    deletingId: null,
    toasts: [],
    isReportModalOpen: false,
    statsMode: 'month',
    statsMonth: new Date().getMonth(),
    statsYear: new Date().getFullYear(),
    statsFromDate: null,
    statsToDate: null,
  });
  localStorage.clear();
  // Quitar clase dark del DOM
  document.documentElement.classList.remove('dark');
}

describe('uiStore', () => {
  beforeEach(() => {
    resetUiStore();
  });

  // ─── Sidebar ──────────────────────────────────────────────────

  it('toggleSidebar alterna el colapso del sidebar', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it('toggleSidebar persiste en localStorage', () => {
    useUiStore.getState().toggleSidebar();
    expect(localStorage.getItem('saas-sidebar-collapsed')).toBe('true');
  });

  // ─── Tema ─────────────────────────────────────────────────────

  it('toggleDarkMode alterna el tema oscuro', () => {
    expect(useUiStore.getState().isDark).toBe(false);
    useUiStore.getState().toggleDarkMode();
    expect(useUiStore.getState().isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('foresight-dark-mode')).toBe('true');
  });

  it('toggleDarkMode vuelve a claro desde oscuro', () => {
    useUiStore.getState().toggleDarkMode(); // oscuro
    useUiStore.getState().toggleDarkMode(); // claro
    expect(useUiStore.getState().isDark).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  // ─── Tabs ─────────────────────────────────────────────────────

  it('setActiveTab cambia la pestaña activa', () => {
    useUiStore.getState().setActiveTab('stats');
    expect(useUiStore.getState().activeTab).toBe('stats');
    expect(localStorage.getItem('foresight-active-tab')).toBe('stats');
  });

  it('navigateTo con filtro guarda pendingFilter', () => {
    useUiStore.getState().navigateTo('movements', 'income');
    expect(useUiStore.getState().activeTab).toBe('movements');
    expect(useUiStore.getState().pendingFilter).toBe('income');
  });

  it('navigateTo sin filtro limpia pendingFilter', () => {
    useUiStore.getState().navigateTo('movements', 'income');
    useUiStore.getState().navigateTo('home');
    expect(useUiStore.getState().pendingFilter).toBeNull();
  });

  // ─── Modal de transacción ─────────────────────────────────────

  it('openModal abre el modal sin editingId', () => {
    useUiStore.getState().openModal();
    expect(useUiStore.getState().isModalOpen).toBe(true);
    expect(useUiStore.getState().editingId).toBeNull();
  });

  it('openModal con id abre en modo edición', () => {
    useUiStore.getState().openModal(42);
    expect(useUiStore.getState().isModalOpen).toBe(true);
    expect(useUiStore.getState().editingId).toBe(42);
  });

  it('closeModal cierra el modal y limpia editingId', () => {
    useUiStore.getState().openModal(42);
    useUiStore.getState().closeModal();
    expect(useUiStore.getState().isModalOpen).toBe(false);
    expect(useUiStore.getState().editingId).toBeNull();
  });

  // ─── Modal de confirmación de borrado ─────────────────────────

  it('openDeleteModal/closeDeleteModal funcionan', () => {
    useUiStore.getState().openDeleteModal(99);
    expect(useUiStore.getState().isDeleteModalOpen).toBe(true);
    expect(useUiStore.getState().deletingId).toBe(99);

    useUiStore.getState().closeDeleteModal();
    expect(useUiStore.getState().isDeleteModalOpen).toBe(false);
    expect(useUiStore.getState().deletingId).toBeNull();
  });

  // ─── Toasts ───────────────────────────────────────────────────

  it('addToast agrega un toast y removeToast lo elimina', () => {
    useUiStore.getState().addToast('Hola mundo');
    const toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Hola mundo');
    expect(toasts[0].type).toBe('info'); // default

    useUiStore.getState().removeToast(toasts[0].id);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('addToast con tipo error/success', () => {
    useUiStore.getState().addToast('Error crítico', 'error');
    expect(useUiStore.getState().toasts[0].type).toBe('error');

    useUiStore.getState().addToast('Éxito', 'success');
    expect(useUiStore.getState().toasts[1].type).toBe('success');
  });

  it('addToast acepta callback onUndo', () => {
    const undoFn = vi.fn();
    useUiStore.getState().addToast('Deshacer', 'info', undoFn);
    expect(useUiStore.getState().toasts[0].onUndo).toBe(undoFn);
  });

  it('removeToast no rompe con id inexistente', () => {
    useUiStore.getState().removeToast(999);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  // ─── Report Modal ─────────────────────────────────────────────

  it('openReportModal/closeReportModal funcionan', () => {
    useUiStore.getState().openReportModal();
    expect(useUiStore.getState().isReportModalOpen).toBe(true);

    useUiStore.getState().closeReportModal();
    expect(useUiStore.getState().isReportModalOpen).toBe(false);
  });

  // ─── Estadísticas ─────────────────────────────────────────────

  it('setStatsMode cambia el modo de estadísticas', () => {
    useUiStore.getState().setStatsMode('range');
    expect(useUiStore.getState().statsMode).toBe('range');
  });

  it('setStatsMonth/setStatsYear actualizan mes y año', () => {
    useUiStore.getState().setStatsMonth(5);
    useUiStore.getState().setStatsYear(2025);
    expect(useUiStore.getState().statsMonth).toBe(5);
    expect(useUiStore.getState().statsYear).toBe(2025);
  });

  it('setStatsRange actualiza rango de fechas', () => {
    useUiStore.getState().setStatsRange('2026-01-01', '2026-01-31');
    expect(useUiStore.getState().statsFromDate).toBe('2026-01-01');
    expect(useUiStore.getState().statsToDate).toBe('2026-01-31');
  });
});
