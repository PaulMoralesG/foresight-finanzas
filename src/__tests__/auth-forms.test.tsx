// ================================================================
// TESTS — LoginForm y SignUpForm: validación, error de servidor y modo sin
// Supabase (signIn/signUp lanzan "Supabase no disponible (modo offline)").
// Se usa el useAuth real sobre un cliente Supabase simulado.
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

// Sin red real: la comprobación de contraseñas filtradas no debe salir a internet.
const pwned = vi.hoisted(() => ({ cuenta: vi.fn(() => Promise.resolve(0)) }));
vi.mock('@/lib/password', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/password')>();
  return { ...real, leakedPasswordCount: pwned.cuenta };
});

const h = vi.hoisted(() => ({
  cliente: null as unknown,
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/config/supabase', () => ({
  get supabase() { return h.cliente; },
  get supabaseAvailable() { return h.cliente !== null; },
  olvidarSesionGuardada: vi.fn(),
}));

import { LoginForm } from '@/components/features/auth/LoginForm';
import { SignUpForm } from '@/components/features/auth/SignUpForm';

function conSupabase() {
  h.cliente = {
    auth: { signInWithPassword: h.signInWithPassword, signUp: h.signUp },
    from: vi.fn(() => ({ upsert: h.upsert })),
  };
}

beforeEach(() => {
  h.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  h.signUp.mockReset().mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
  h.upsert.mockReset().mockResolvedValue({ error: null });
  pwned.cuenta.mockReset().mockResolvedValue(0);
  conSupabase();
});
afterEach(() => cleanup());

describe('LoginForm', () => {
  function montar() {
    const props = { onSwitchToSignUp: vi.fn(), onForgotPassword: vi.fn() };
    render(<LoginForm {...props} />);
    return props;
  }

  it('valida correo y contraseña vacíos sin llamar al servidor', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu correo electrónico');

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu contraseña');
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });

  it('inicio correcto: llama a Supabase con el correo recortado y no muestra error', async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText('Correo electrónico'), '  ana@example.com ');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await waitFor(() =>
      expect(h.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secreta123' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('error de servidor: traduce «Invalid login credentials»', async () => {
    h.signInWithPassword.mockResolvedValue({ data: null, error: new Error('Invalid login credentials') });
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'mala');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });

  it('error desconocido: muestra el mensaje del servidor tal cual', async () => {
    h.signInWithPassword.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'x');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
  });

  it('modo sin Supabase: el intento falla con el aviso de modo offline', async () => {
    h.cliente = null;
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Supabase no disponible (modo offline)');
  });

  it('escribir limpia el error y los enlaces disparan sus callbacks', async () => {
    const user = userEvent.setup();
    const props = montar();
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo electrónico'), 'a');
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(screen.getByRole('button', { name: /olvidaste/i }));
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(props.onForgotPassword).toHaveBeenCalledTimes(1);
    expect(props.onSwitchToSignUp).toHaveBeenCalledTimes(1);
  });

  it('el botón del ojo alterna la visibilidad de la contraseña', async () => {
    const user = userEvent.setup();
    montar();
    const campo = screen.getByLabelText('Contraseña');
    expect(campo).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(campo).toHaveAttribute('type', 'text');
  });
});

describe('SignUpForm', () => {
  function montar() {
    const props = { onSwitchToLogin: vi.fn(), onSuccess: vi.fn() };
    render(<SignUpForm {...props} />);
    return props;
  }

  async function rellenar(user: ReturnType<typeof userEvent.setup>, pw = 'clave-segura-91') {
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Apellido'), 'Pérez');
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.type(screen.getByLabelText('Contraseña'), pw);
  }

  it('campos vacíos: no llama al servidor y muestra un error', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(screen.getAllByText(/al menos 8 caracteres/).length).toBeGreaterThan(0);
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it('al enviar vacío, acumula los errores de los tres campos', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    // «Requerido» en nombre y en correo, más el error de la contraseña.
    expect(screen.getAllByText('Requerido')).toHaveLength(2);
    expect(screen.getAllByText(/al menos 8 caracteres/).length).toBeGreaterThan(0);
  });

  it('contraseña corta: muestra el error de longitud mínima', async () => {
    const user = userEvent.setup();
    montar();
    await rellenar(user, 'corta');
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect((await screen.findAllByText(/al menos 8 caracteres/)).length).toBeGreaterThan(0);
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it('correo inválido: lo señala al salir del campo', async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-correo');
    await user.tab();
    expect(await screen.findByText('Correo no válido')).toBeInTheDocument();
  });

  it('contraseña filtrada (HIBP): bloquea el registro sin llamar a Supabase', async () => {
    pwned.cuenta.mockResolvedValue(1234);
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByText(/filtraciones|filtrad/i)).toBeInTheDocument();
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it('registro con verificación de correo: muestra el aviso y bloquea el botón', async () => {
    const user = userEvent.setup();
    const props = montar();
    await rellenar(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByText('¡Correo enviado!')).toBeInTheDocument();
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
    expect(h.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@example.com',
      password: 'clave-segura-91',
      options: expect.objectContaining({ data: { first_name: 'Ana', last_name: 'Pérez' } }),
    }));
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeDisabled();
  });

  it('registro con sesión inmediata: crea el perfil y llama a onSuccess', async () => {
    h.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null });
    const user = userEvent.setup();
    const props = montar();
    await rellenar(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledTimes(1));
    expect(h.upsert).toHaveBeenCalledWith(
      { id: 'u1', email: 'ana@example.com', first_name: 'Ana', last_name: 'Pérez' },
      { onConflict: 'id' },
    );
  });

  it('error de servidor: traduce «User already registered»', async () => {
    h.signUp.mockResolvedValue({ data: null, error: new Error('User already registered') });
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByText('Ya existe una cuenta con ese correo')).toBeInTheDocument();
    expect(screen.queryByText('¡Correo enviado!')).toBeNull();
  });

  it('respuesta sin usuario ni sesión: error genérico', async () => {
    h.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByText('No se pudo crear la cuenta. Intenta de nuevo.')).toBeInTheDocument();
  });

  it('modo sin Supabase: informa que no está disponible', async () => {
    h.cliente = null;
    const user = userEvent.setup();
    montar();
    await rellenar(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByText('Supabase no disponible (modo offline)')).toBeInTheDocument();
  });

  it('«Iniciar sesión» dispara onSwitchToLogin', async () => {
    const user = userEvent.setup();
    const props = montar();
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(props.onSwitchToLogin).toHaveBeenCalledTimes(1);
  });
});
