// ================================================================
// TESTS — Reportador de errores propio (sustituto de Sentry)
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type FilaInsertada = Record<string, unknown>;
type SesionMock = { data: { session: { user: { id: string } } | null }; error: null };

const mocks = vi.hoisted(() => {
  const insert = vi.fn((_fila: Record<string, unknown>) =>
    Promise.resolve({ data: null, error: null })
  );
  const from = vi.fn((_tabla: string) => ({ insert }));
  const getSession = vi.fn(
    (): Promise<SesionMock> =>
      Promise.resolve({ data: { session: { user: { id: 'user-123' } } }, error: null })
  );
  return {
    insert,
    from,
    getSession,
    supabase: { from, auth: { getSession } } as unknown,
  };
});

/** Fila que recibió el insert número `i` (0-based). */
const filaInsertada = (i = 0): FilaInsertada => mocks.insert.mock.calls[i][0];

vi.mock('@/config/supabase', () => ({
  get supabase() {
    return mocks.supabase;
  },
  supabaseAvailable: true,
}));

import { reportarError, initErrorReporter, __resetErrorReporterForTests } from '@/lib/error-reporter';

/** Espera a que se vacíen las microtareas encadenadas (getSession → insert). */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('reportarError', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true);
    mocks.supabase = { from: mocks.from, auth: { getSession: mocks.getSession } };
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    __resetErrorReporterForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('no envía nada fuera de producción', async () => {
    vi.stubEnv('PROD', false);
    reportarError(new Error('boom'));
    await flush();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('no envía nada si Supabase no está configurado', async () => {
    mocks.supabase = null;
    reportarError(new Error('boom'));
    await flush();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('no envía nada sin sesión (RLS solo permite insert autenticado)', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    reportarError(new Error('boom'));
    await flush();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('inserta la fila completa en error_log con la sesión activa', async () => {
    const err = new Error('Falló el push');
    reportarError(err, { tag: 'reintentos-agotados', componentStack: '\n  at App' });
    await flush();

    expect(mocks.from).toHaveBeenCalledWith('error_log');
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const fila = filaInsertada();
    expect(fila.user_id).toBe('user-123');
    expect(fila.message).toBe('Falló el push');
    expect(typeof fila.stack).toBe('string');
    expect(fila.tag).toBe('reintentos-agotados');
    expect(fila.url).toBe(window.location.href);
    expect(fila.user_agent).toBe(navigator.userAgent);
    expect(fila.app_version).toBe(__APP_VERSION__);
    expect(fila.context).toEqual({ componentStack: '\n  at App' });
  });

  it('acepta valores que no son Error (strings, objetos)', async () => {
    reportarError('texto suelto');
    reportarError({ code: 'PGRST205' });
    await flush();

    expect(mocks.insert).toHaveBeenCalledTimes(2);
    const [fila1, fila2] = [filaInsertada(0), filaInsertada(1)];
    expect(fila1.message).toBe('texto suelto');
    expect(fila1.stack).toBeNull();
    expect(fila2.message).toContain('PGRST205');
  });

  it('recorta mensaje y stack a los límites del CHECK de la tabla', async () => {
    const err = new Error('x'.repeat(5000));
    err.stack = 'y'.repeat(20000);
    reportarError(err);
    await flush();

    const fila = filaInsertada();
    expect((fila.message as string).length).toBe(1000);
    expect((fila.stack as string).length).toBe(8000);
  });

  it('no repite el mismo error en la misma sesión', async () => {
    reportarError(new Error('repetido'), { tag: 'render' });
    reportarError(new Error('repetido'), { tag: 'render' });
    await flush();
    expect(mocks.insert).toHaveBeenCalledTimes(1);

    // Mismo mensaje con otro tag sí es otro evento.
    reportarError(new Error('repetido'), { tag: 'attach-fallo' });
    await flush();
    expect(mocks.insert).toHaveBeenCalledTimes(2);
  });

  it('deja de enviar tras el cupo por sesión', async () => {
    for (let i = 0; i < 30; i++) reportarError(new Error(`e${i}`));
    await flush();
    expect(mocks.insert).toHaveBeenCalledTimes(20);
  });

  it('nunca lanza aunque falle el insert o la sesión', async () => {
    mocks.insert.mockRejectedValueOnce(new Error('red caída'));
    expect(() => reportarError(new Error('a'))).not.toThrow();
    await flush();

    mocks.getSession.mockRejectedValueOnce(new Error('auth lock'));
    expect(() => reportarError(new Error('b'))).not.toThrow();
    await flush();
  });
});

describe('initErrorReporter', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true);
    mocks.supabase = { from: mocks.from, auth: { getSession: mocks.getSession } };
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    __resetErrorReporterForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('captura errores globales y promesas rechazadas sin manejar', async () => {
    initErrorReporter();

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('global'), message: 'global' }));
    await flush();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(filaInsertada(0).tag).toBe('window.error');

    // jsdom no expone PromiseRejectionEvent: se simula con un Event con `reason`.
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    ev.reason = new Error('sin catch');
    window.dispatchEvent(ev);
    await flush();
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(filaInsertada(1).tag).toBe('unhandledrejection');
  });

  it('es idempotente: llamarlo dos veces no duplica listeners', () => {
    // El dedupe de reportarError enmascararía un listener duplicado, así que
    // se cuenta directamente cuántas veces se registra cada evento.
    const spy = vi.spyOn(window, 'addEventListener');
    initErrorReporter();
    initErrorReporter();
    const registrados = spy.mock.calls.map((c) => c[0]);
    expect(registrados.filter((e) => e === 'error')).toHaveLength(1);
    expect(registrados.filter((e) => e === 'unhandledrejection')).toHaveLength(1);
  });
});
