// ================================================================
// TESTS — acciones de cuenta de useAuth: updateProfile, updateEmail,
// updatePassword y resetPassword. Éxito, error de servidor y fallo de red.
//
// Contrato unificado: las cuatro acciones devuelven { success, message } y
// nunca lanzan, ni ante { error } del SDK ni ante un `reject` de su promesa
// (red caída). El fallo de red lleva un mensaje genérico.
// ================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/sync', () => ({
  syncService: {
    attach: vi.fn(),
    detach: vi.fn(),
    disable: vi.fn(),
    schedule: vi.fn(),
    adjuntado: vi.fn(() => false),
    flush: vi.fn(() => Promise.resolve(true)),
    hayCambiosSinSubir: vi.fn(() => false),
  },
  isSchemaError: () => false,
  isTransientSchemaError: () => false,
  borrarMarcaDeAgua: vi.fn(),
}));

const h = vi.hoisted(() => ({
  cliente: null as unknown,
  updateUser: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/config/supabase', () => ({
  get supabase() {
    return h.cliente;
  },
  get supabaseAvailable() {
    return h.cliente !== null;
  },
  olvidarSesionGuardada: vi.fn(),
}));

import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

const MSG_RED = 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.';
const USUARIO = { id: 'u1', email: 'ana@example.com', firstName: 'Ana', lastName: 'Pérez' };

function montarCliente() {
  h.update.mockImplementation(() => ({ eq: h.eq }));
  h.cliente = {
    auth: {
      updateUser: h.updateUser,
      signInWithPassword: h.signInWithPassword,
      resetPasswordForEmail: h.resetPasswordForEmail,
    },
    from: vi.fn(() => ({ update: h.update })),
  };
}

beforeEach(() => {
  h.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  h.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  h.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
  h.eq.mockReset().mockResolvedValue({ error: null });
  h.update.mockReset();
  montarCliente();
  useAuthStore.setState({ user: { ...USUARIO }, isLoading: false });
});

describe('useAuth.updateProfile', () => {
  it('éxito: actualiza metadata (first_name/last_name), la tabla profiles y el store', async () => {
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateProfile('Luis', 'Gómez')).resolves.toMatchObject({ success: true });

    expect(h.updateUser).toHaveBeenCalledWith({ data: { first_name: 'Luis', last_name: 'Gómez' } });
    expect(h.update).toHaveBeenCalledWith({ first_name: 'Luis', last_name: 'Gómez' });
    expect(h.eq).toHaveBeenCalledWith('id', 'u1');
    expect(useAuthStore.getState().user).toMatchObject({ firstName: 'Luis', lastName: 'Gómez' });
  });

  it('sin sesión devuelve false y no toca el servidor', async () => {
    useAuthStore.setState({ user: null });
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateProfile('X', 'Y')).resolves.toMatchObject({ success: false });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('modo offline: solo actualiza el store local', async () => {
    h.cliente = null;
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateProfile('Luis', 'Gómez')).resolves.toMatchObject({ success: true });
    expect(useAuthStore.getState().user).toMatchObject({ firstName: 'Luis', lastName: 'Gómez' });
  });

  it('error de servidor en auth: success false y NO modifica el store ni la tabla', async () => {
    h.updateUser.mockResolvedValue({ data: null, error: new Error('auth caído') });
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateProfile('Luis', 'Gómez')).resolves.toEqual({ success: false, message: 'auth caído' });
    expect(h.update).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.firstName).toBe('Ana');
  });

  it('error de servidor en profiles: success false y NO modifica el store', async () => {
    h.eq.mockResolvedValue({ error: new Error('RLS') });
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateProfile('Luis', 'Gómez')).resolves.toEqual({ success: false, message: 'RLS' });
    expect(useAuthStore.getState().user?.firstName).toBe('Ana');
  });

  it('fallo de red (la promesa rechaza): success false con mensaje de red y el store intacto', async () => {
    h.updateUser.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateProfile('Luis', 'Gómez')).resolves.toEqual({ success: false, message: MSG_RED });
    expect(useAuthStore.getState().user?.firstName).toBe('Ana');
  });
});

describe('useAuth.updateEmail', () => {
  it('éxito: pide la verificación del nuevo correo y avisa que queda pendiente', async () => {
    const { result } = renderHook(() => useAuth());
    const r = await result.current.updateEmail('nuevo@example.com');

    expect(r.success).toBe(true);
    expect(r.message).toMatch(/confirmar el cambio/);
    expect(h.updateUser).toHaveBeenCalledWith(
      { email: 'nuevo@example.com' },
      { emailRedirectTo: `${window.location.origin}/profile` },
    );
    // El email efectivo no cambia hasta verificar: el store sigue con el actual.
    expect(useAuthStore.getState().user?.email).toBe('ana@example.com');
  });

  it('error de servidor: success false con el mensaje del servidor', async () => {
    h.updateUser.mockResolvedValue({ data: null, error: { message: 'Email already in use' } });
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateEmail('x@example.com')).resolves.toEqual({
      success: false,
      message: 'Email already in use',
    });
  });

  it('error devuelto por fallo de red: success false', async () => {
    h.updateUser.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const { result } = renderHook(() => useAuth());
    const r = await result.current.updateEmail('x@example.com');
    expect(r.success).toBe(false);
    expect(r.message).toBe('Failed to fetch');
  });

  it('promesa rechazada por la red: success false con mensaje de red', async () => {
    h.updateUser.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updateEmail('x@example.com')).resolves.toEqual({ success: false, message: MSG_RED });
  });

  it('sin sesión y en modo offline no llama al servidor', async () => {
    useAuthStore.setState({ user: null });
    const { result, rerender } = renderHook(() => useAuth());
    expect(await result.current.updateEmail('x@example.com')).toEqual({ success: false, message: 'No hay sesión activa' });

    useAuthStore.setState({ user: { ...USUARIO } });
    h.cliente = null;
    rerender();
    expect(await result.current.updateEmail('x@example.com')).toEqual({ success: false, message: 'No disponible en modo offline' });
    expect(h.updateUser).not.toHaveBeenCalled();
  });
});

describe('useAuth.updatePassword', () => {
  it('éxito: reautentica con la contraseña actual y después cambia la nueva', async () => {
    const orden: string[] = [];
    h.signInWithPassword.mockImplementation(async () => { orden.push('reauth'); return { data: {}, error: null }; });
    h.updateUser.mockImplementation(async () => { orden.push('update'); return { data: {}, error: null }; });
    const { result } = renderHook(() => useAuth());

    const r = await result.current.updatePassword('actual-123', 'nueva-456');

    expect(r).toEqual({ success: true, message: 'Contraseña actualizada correctamente' });
    expect(orden).toEqual(['reauth', 'update']);
    expect(h.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'actual-123' });
    expect(h.updateUser).toHaveBeenCalledWith({ password: 'nueva-456' });
  });

  it('reautenticación fallida: NO cambia la contraseña', async () => {
    h.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    const { result } = renderHook(() => useAuth());

    const r = await result.current.updatePassword('mala', 'nueva-456');

    expect(r).toEqual({ success: false, message: 'La contraseña actual no es correcta' });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('rechaza contraseña actual vacía o igual a la nueva sin tocar el servidor', async () => {
    const { result } = renderHook(() => useAuth());
    expect((await result.current.updatePassword('', 'nueva')).message).toBe('Ingresa tu contraseña actual');
    expect((await result.current.updatePassword('igual', 'igual')).message).toMatch(/distinta/);
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });

  it('error de servidor al aplicar el cambio: success false con su mensaje', async () => {
    h.updateUser.mockResolvedValue({ data: null, error: { message: 'Password is too weak' } });
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updatePassword('actual', 'nueva')).resolves.toEqual({
      success: false,
      message: 'Password is too weak',
    });
  });

  it('credenciales inválidas por código (invalid_credentials / 400): contraseña incorrecta', async () => {
    h.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'x', status: 400, code: 'invalid_credentials' } });
    const { result } = renderHook(() => useAuth());
    const r = await result.current.updatePassword('actual', 'nueva');
    expect(r).toEqual({ success: false, message: 'La contraseña actual no es correcta' });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('fallo de red devuelto en la reautenticación: NO dice contraseña incorrecta y no se cambia nada', async () => {
    h.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const { result } = renderHook(() => useAuth());
    const r = await result.current.updatePassword('actual', 'nueva');
    expect(r).toEqual({ success: false, message: MSG_RED });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('promesa rechazada por la red: success false con mensaje de red y no se cambia la contraseña', async () => {
    h.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAuth());
    await expect(result.current.updatePassword('actual', 'nueva')).resolves.toEqual({ success: false, message: MSG_RED });
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('sin sesión y en modo offline no llama al servidor', async () => {
    useAuthStore.setState({ user: null });
    const { result, rerender } = renderHook(() => useAuth());
    expect((await result.current.updatePassword('a', 'b')).message).toBe('No hay sesión activa');

    useAuthStore.setState({ user: { ...USUARIO } });
    h.cliente = null;
    rerender();
    expect((await result.current.updatePassword('a', 'b')).message).toBe('No disponible en modo offline');
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('useAuth.resetPassword', () => {
  it('éxito: pide el enlace con redirectTo a /login', async () => {
    const { result } = renderHook(() => useAuth());
    const r = await result.current.resetPassword('ana@example.com');
    expect(r.success).toBe(true);
    expect(r.message).toMatch(/Revisa tu correo/);
    expect(h.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', {
      redirectTo: `${window.location.origin}/login`,
    });
  });

  it('error de servidor: success false con su mensaje', async () => {
    h.resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'Email rate limit exceeded' } });
    const { result } = renderHook(() => useAuth());
    await expect(result.current.resetPassword('ana@example.com')).resolves.toEqual({
      success: false,
      message: 'Email rate limit exceeded',
    });
  });

  it('promesa rechazada por la red: success false con mensaje de red', async () => {
    h.resetPasswordForEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAuth());
    await expect(result.current.resetPassword('ana@example.com')).resolves.toEqual({ success: false, message: MSG_RED });
  });

  it('modo offline: no disponible', async () => {
    h.cliente = null;
    const { result } = renderHook(() => useAuth());
    await expect(result.current.resetPassword('a@b.co')).resolves.toEqual({
      success: false,
      message: 'No disponible en modo offline',
    });
  });
});
