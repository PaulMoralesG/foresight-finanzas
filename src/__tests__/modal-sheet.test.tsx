// ================================================================
// TESTS — ModalSheet en móvil: foco inicial y anclaje al visual viewport
//
// Regresión del iPhone 14 Pro: al abrir un modal se enfocaba un campo, salía
// el teclado y el navegador desplazaba la hoja hasta sacar de la pantalla la
// cabecera con el botón de cerrar.
// ================================================================

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ModalSheet } from '@/components/ui/ModalSheet';

const originalMatchMedia = window.matchMedia;

function simularPuntero(tactil: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: tactil && query.includes('pointer: coarse'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function Hoja() {
  return (
    <ModalSheet id="t" titulo="Nueva deuda" onClose={() => {}} focoInicial="#nombre">
      <form>
        <input id="nombre" aria-label="Nombre" />
      </form>
    </ModalSheet>
  );
}

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
});

describe('ModalSheet', () => {
  it('en pantalla táctil enfoca el panel, no el campo (no abre el teclado solo)', () => {
    simularPuntero(true);
    render(<Hoja />);
    const dialogo = screen.getByRole('dialog', { name: 'Nueva deuda' });
    expect(document.activeElement).toBe(dialogo);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Nombre'));
  });

  it('con ratón y teclado sigue enfocando el campo indicado', () => {
    simularPuntero(false);
    render(<Hoja />);
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'));
  });

  it('el botón de cerrar está fuera del contenido desplazable', () => {
    simularPuntero(true);
    render(<Hoja />);
    const cerrar = screen.getByRole('button', { name: 'Cerrar' });
    expect(cerrar.closest('form')).toBeNull();
  });

  it('publica el alto visible y el hueco del teclado como variables CSS', () => {
    simularPuntero(true);
    const listeners: Record<string, () => void> = {};
    const vv = {
      height: 852,
      offsetTop: 0,
      addEventListener: (tipo: string, fn: () => void) => { listeners[tipo] = fn; },
      removeEventListener: () => {},
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 852 });

    render(<Hoja />);
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.style.getPropertyValue('--vv-height')).toBe('852px');
    expect(dialogo.style.getPropertyValue('--vv-bottom')).toBe('0px');

    // Sale el teclado: el visual viewport pierde 336px por abajo.
    vv.height = 516;
    act(() => listeners.resize());
    expect(dialogo.style.getPropertyValue('--vv-height')).toBe('516px');
    expect(dialogo.style.getPropertyValue('--vv-bottom')).toBe('336px');
  });
});
