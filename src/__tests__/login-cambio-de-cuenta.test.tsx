// ================================================================
// TESTS — aviso antes de que OTRA cuenta descarte cambios sin subir
//
// Si la cuenta anterior cerró conservando datos (`conservarDatos`: cierre por
// inactividad o sesión caída con cambios sin subir) y entra una cuenta
// distinta, cargarPerfil reinicia el store y esos cambios se pierden en este
// dispositivo. El formulario de login lo avisa ANTES de llamar a Supabase:
// cancelar no inicia sesión ni toca nada; confirmar sigue con el login.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/sync', () => ({
  syncService: {
    attach: vi.fn(), detach: vi.fn(), disable: vi.fn(), schedule: vi.fn(),
    adjuntado: vi.fn(() => false), flush: vi.fn(() => Promise.resolve(true)),
    hayCambiosSinSubir: vi.fn(() => false),
  },
  isSchemaError: () => false,
  isTransientSchemaError: () => false,
  borrarMarcaDeAgua: vi.fn(),
}));

const h = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  exportar: vi.fn(),
}));

vi.mock('@/config/supabase', () => ({
  supabase: { auth: { signInWithPassword: h.signInWithPassword } },
  supabaseAvailable: true,
  olvidarSesionGuardada: vi.fn(),
}));

vi.mock('@/lib/exportar-respaldo', () => ({
  exportarRespaldoLocal: h.exportar,
}));

import { LoginForm } from '@/components/features/auth/LoginForm';
import { guardarDuenoDatos, leerDuenoDatos, datosSinSubirDeOtraCuenta } from '@/lib/dueno-datos';
import { useFinanceStore } from '@/stores/financeStore';

function conGastoSinSubir() {
  useFinanceStore.getState().reset();
  useFinanceStore.getState().addTransaction({
    type: 'expense', amount: 42, concept: 'Sin subir', date: '2026-10-01',
    category: 'comida', method: 'cash', businessType: 'personal',
  });
}

async function entrar(email: string) {
  const user = userEvent.setup();
  render(<LoginForm onSwitchToSignUp={vi.fn()} onForgotPassword={vi.fn()} />);
  await user.type(screen.getByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
  await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
  return user;
}

beforeEach(() => {
  localStorage.clear();
  h.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  h.exportar.mockReset().mockResolvedValue('downloaded');
  conGastoSinSubir();
});
afterEach(() => cleanup());

describe('datosSinSubirDeOtraCuenta', () => {
  it('sin dueño o sin conservarDatos: null', () => {
    expect(datosSinSubirDeOtraCuenta('beto@example.com')).toBeNull();
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com' });
    expect(datosSinSubirDeOtraCuenta('beto@example.com')).toBeNull();
  });

  it('misma cuenta (sin distinguir mayúsculas ni espacios): null', () => {
    guardarDuenoDatos({ id: 'uA', email: 'Ana@Example.com', conservarDatos: true });
    expect(datosSinSubirDeOtraCuenta('  ana@example.COM ')).toBeNull();
  });

  it('otra cuenta con datos conservados: devuelve el dueño anterior', () => {
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com', conservarDatos: true });
    expect(datosSinSubirDeOtraCuenta('beto@example.com')).toMatchObject({ id: 'uA', email: 'ana@example.com' });
  });
});

describe('LoginForm · cambio de cuenta con cambios sin subir', () => {
  it('otra cuenta: avisa antes de iniciar sesión y no llama a Supabase', async () => {
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com', conservarDatos: true });
    await entrar('beto@example.com');

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('ana@example.com');
    expect(dialogo).toHaveTextContent(/se perderán/i);
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });

  it('cancelar: no inicia sesión ni toca los datos locales ni el dueño', async () => {
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com', conservarDatos: true });
    const user = await entrar('beto@example.com');

    await user.click(await screen.findByRole('button', { name: /cancelar/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.signInWithPassword).not.toHaveBeenCalled();
    expect(useFinanceStore.getState().expenses).toHaveLength(1);
    expect(leerDuenoDatos()).toMatchObject({ id: 'uA', conservarDatos: true });
  });

  it('confirmar: sigue con el inicio de sesión de la cuenta nueva', async () => {
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com', conservarDatos: true });
    const user = await entrar('beto@example.com');

    await user.click(await screen.findByRole('button', { name: /entrar y descartarlos/i }));

    await waitFor(() =>
      expect(h.signInWithPassword).toHaveBeenCalledWith({ email: 'beto@example.com', password: 'secreta123' }),
    );
  });

  it('ofrece exportar un respaldo de los datos locales sin cerrar el aviso', async () => {
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com', conservarDatos: true });
    const user = await entrar('beto@example.com');

    await user.click(await screen.findByRole('button', { name: /exportar respaldo/i }));

    expect(h.exportar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });

  it('la misma cuenta: entra directo, sin aviso', async () => {
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com', conservarDatos: true });
    await entrar('ANA@example.com');

    await waitFor(() => expect(h.signInWithPassword).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('otra cuenta sin cambios pendientes de la anterior: entra directo, sin aviso', async () => {
    guardarDuenoDatos({ id: 'uA', email: 'ana@example.com' });
    await entrar('beto@example.com');

    await waitFor(() => expect(h.signInWithPassword).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
