// ================================================================
// TESTS — src/pages/ProfilePage.tsx
// Fija los hallazgos de la revisión heurística: gating offline, autofoco al
// abrir un acordeón, aviso de correo pendiente y feedback de contraseñas.
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { ProfilePage } from '@/pages/ProfilePage';
import type { User } from '@/types';

// `supabaseAvailable` se expone como getter: cada lectura reevalúa
// mockSupabase.available, así que no hace falta vi.resetModules() ni
// reimportar el módulo entre tests —eso rompería la instancia compartida de
// useAuthStore/useFinanceStore/useUiStore, que son singletons de módulo—.
const mockSupabase = vi.hoisted(() => ({ available: true }));
vi.mock('@/config/supabase', () => ({
  supabase: null,
  get supabaseAvailable() {
    return mockSupabase.available;
  },
}));

const usuario: User = { id: 'u1', email: 'ana@ejemplo.com', firstName: 'Ana', lastName: 'Pérez' };

function montar() {
  return render(<ProfilePage />);
}

beforeEach(() => {
  cleanup();
  mockSupabase.available = true;
  useAuthStore.setState({ user: usuario, isLoading: false });
  useFinanceStore.setState({ customExpenseCategories: [], customIncomeCategories: [] });
  useUiStore.setState({ isDark: false, toasts: [] });
});

describe('ProfilePage — modo offline (sin Supabase)', () => {
  beforeEach(() => {
    mockSupabase.available = false;
  });

  it('deshabilita Cambiar correo y Cambiar contraseña, con el motivo visible', async () => {
    montar();
    expect(screen.getByRole('button', { name: /Cambiar correo electrónico/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cambiar contraseña/ })).toBeDisabled();
    expect(screen.getAllByText('Requiere conexión a internet')).toHaveLength(2);
  });

  it('pulsar la fila deshabilitada no abre el formulario', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument();
  });

  it('Editar perfil sigue disponible: offline solo bloquea correo y contraseña', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Editar perfil' }));
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });
});

describe('ProfilePage — con Supabase disponible', () => {
  it('las secciones de correo y contraseña se abren normalmente', async () => {
    const user = userEvent.setup();
    montar();

    const btn = screen.getByRole('button', { name: /Cambiar correo electrónico/ });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(screen.getByLabelText('Nuevo correo electrónico')).toBeInTheDocument();
  });

  it('abrir "Cambiar correo electrónico" enfoca el campo de correo', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /Cambiar correo electrónico/ }));
    expect(screen.getByLabelText('Nuevo correo electrónico')).toHaveFocus();
  });

  it('abrir "Cambiar contraseña" enfoca el campo de contraseña actual', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(screen.getByLabelText('Contraseña actual')).toHaveFocus();
  });

  it('abrir "Editar perfil" enfoca el campo de nombre', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Editar perfil' }));
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
  });
});

describe('ProfilePage — correo pendiente de verificación', () => {
  it('sin cambio pendiente, no muestra ningún aviso', async () => {
    montar();
    expect(screen.queryByText(/Verificación pendiente/)).not.toBeInTheDocument();
  });

  it('con un cambio pendiente, lo muestra de forma persistente en la tarjeta de perfil', async () => {
    useAuthStore.setState({ user: { ...usuario, pendingEmail: 'nueva@ejemplo.com' } });
    montar();
    expect(screen.getByText(/Verificación pendiente/)).toBeInTheDocument();
    expect(screen.getByText('nueva@ejemplo.com')).toBeInTheDocument();
  });
});

describe('ProfilePage — cambiar contraseña', () => {
  it('confirmar coincide con la nueva contraseña muestra el check en vivo', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));

    await user.type(screen.getByLabelText('Nueva contraseña'), 'Abc12345!');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Abc12345!');

    expect(screen.getByText('✓ Coinciden')).toBeInTheDocument();
  });

  it('confirmar distinto de la nueva contraseña lo marca antes de enviar', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));

    await user.type(screen.getByLabelText('Nueva contraseña'), 'Abc12345!');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Otra123!');

    expect(screen.getByText('✗ No coinciden')).toBeInTheDocument();
  });

  it('los tres campos de contraseña tienen botón de mostrar/ocultar', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));

    expect(screen.getAllByRole('button', { name: 'Mostrar contraseña' })).toHaveLength(3);
  });
});

describe('ProfilePage — color de Apariencia', () => {
  it('el glifo sí cambia con isDark, pero el color del tile ya no', () => {
    useUiStore.setState({ isDark: true });
    montar();

    // Confirma primero que isDark realmente llegó al componente (si no,
    // "no contiene amber" pasaría igual sin que el fix se haya ejercitado).
    expect(screen.getByText('Tema oscuro')).toBeInTheDocument();

    const filaApariencia = screen.getByText('Apariencia').closest('div')!.parentElement!;
    const tileApariencia = filaApariencia.querySelector('svg')!.parentElement!;
    expect(tileApariencia.className).not.toMatch(/amber/);
  });

  it('en modo claro tampoco lleva ámbar (nunca lo lleva)', () => {
    useUiStore.setState({ isDark: false });
    montar();

    expect(screen.getByText('Tema claro')).toBeInTheDocument();
    const filaApariencia = screen.getByText('Apariencia').closest('div')!.parentElement!;
    const tileApariencia = filaApariencia.querySelector('svg')!.parentElement!;
    expect(tileApariencia.className).not.toMatch(/amber/);
  });
});
