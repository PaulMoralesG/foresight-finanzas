// ================================================================
// TESTS — ErrorBoundary y Toast (render)
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const reporter = vi.hoisted(() => ({ reportarError: vi.fn() }));
vi.mock('@/lib/error-reporter', () => ({ reportarError: reporter.reportarError }));

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toast } from '@/components/ui/Toast';
import { useUiStore } from '@/stores/uiStore';

afterEach(() => cleanup());

describe('ErrorBoundary', () => {
  let consola: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    reporter.reportarError.mockClear();
    // React y el propio boundary escriben el error en consola: se silencia.
    consola = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consola.mockRestore());

  let debeFallar = true;
  function Bomba() {
    if (debeFallar) throw new Error('boom de render');
    return <p>contenido sano</p>;
  }

  it('sin error renderiza los hijos', () => {
    debeFallar = false;
    render(<ErrorBoundary><Bomba /></ErrorBoundary>);
    expect(screen.getByText('contenido sano')).toBeInTheDocument();
    expect(reporter.reportarError).not.toHaveBeenCalled();
  });

  it('captura el error, lo reporta con tag render y muestra la UI de recuperación', () => {
    debeFallar = true;
    render(<ErrorBoundary><Bomba /></ErrorBoundary>);

    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
    expect(screen.getByText('boom de render')).toBeInTheDocument();
    expect(reporter.reportarError).toHaveBeenCalledTimes(1);
    const [err, ctx] = reporter.reportarError.mock.calls[0];
    expect((err as Error).message).toBe('boom de render');
    expect(ctx).toMatchObject({ tag: 'render' });
    expect(typeof ctx.componentStack).toBe('string');
  });

  it('«Reintentar» vuelve a renderizar los hijos cuando el fallo ya pasó', async () => {
    debeFallar = true;
    render(<ErrorBoundary><Bomba /></ErrorBoundary>);
    debeFallar = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('contenido sano')).toBeInTheDocument();
    expect(screen.queryByText('Algo salió mal')).toBeNull();
  });

  it('usa el fallback propio si se pasa', () => {
    debeFallar = true;
    render(<ErrorBoundary fallback={<p>plan B</p>}><Bomba /></ErrorBoundary>);
    expect(screen.getByText('plan B')).toBeInTheDocument();
    expect(screen.queryByText('Algo salió mal')).toBeNull();
    expect(reporter.reportarError).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiStore.setState({ toasts: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    useUiStore.setState({ toasts: [] });
  });

  it('no renderiza nada sin avisos', () => {
    const { container } = render(<Toast />);
    expect(container).toBeEmptyDOMElement();
  });

  it('los errores van a la región assertive (role alert) y el resto a polite (role status)', () => {
    render(<Toast />);
    act(() => {
      useUiStore.getState().addToast('Algo falló', 'error');
      useUiStore.getState().addToast('Guardado', 'success');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByRole('status')).toHaveTextContent('Guardado');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('el botón cerrar quita el aviso', () => {
    render(<Toast />);
    act(() => { useUiStore.getState().addToast('Hola', 'info'); });
    act(() => { screen.getByRole('button', { name: 'Cerrar aviso' }).click(); });
    expect(screen.queryByText('Hola')).toBeNull();
  });

  it('«Deshacer» ejecuta el callback y retira el aviso', () => {
    const onUndo = vi.fn();
    render(<Toast />);
    act(() => { useUiStore.getState().addToast('Borrado', 'success', onUndo); });
    act(() => { screen.getByRole('button', { name: 'Deshacer' }).click(); });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Borrado')).toBeNull();
  });

  it('caduca solo: 5 s los normales, 8 s los errores', () => {
    render(<Toast />);
    act(() => {
      useUiStore.getState().addToast('normal', 'info');
      useUiStore.getState().addToast('de error', 'error');
    });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText('normal')).toBeNull();
    expect(screen.getByText('de error')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('de error')).toBeNull();
  });
});
