// ================================================================
// TESTS — lib/print.ts: imprimirVista, el mecanismo genérico detrás de
// imprimirReporte, imprimirPresupuesto, imprimirDeudas e imprimirPatrimonio
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { imprimirVista, CLASE_HOST } from '@/lib/print';

const host = () => document.querySelector(`.${CLASE_HOST}`);

describe('imprimirVista', () => {
  let print: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    print = vi.fn();
    window.print = print as unknown as typeof window.print;
    document.title = 'Foresight';
  });

  afterEach(() => {
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('monta la vista fuera de #root, pone el título del archivo y llama a window.print', () => {
    act(() => {
      imprimirVista(<p>Contenido de prueba</p>, 'foresight-prueba');
    });

    const h = host();
    expect(h).not.toBeNull();
    expect(h!.parentElement).toBe(document.body);
    expect(h!.textContent).toBe('Contenido de prueba');
    expect(document.title).toBe('foresight-prueba');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('restaura el título y desmonta al recibir afterprint', () => {
    act(() => {
      imprimirVista(<p>Otra vista</p>, 'foresight-otra');
    });
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(document.title).toBe('Foresight');
    expect(host()).toBeNull();
  });

  it('si window.print lanza, limpia y propaga el error', () => {
    print.mockImplementation(() => {
      throw new Error('sin impresión');
    });
    expect(() =>
      act(() => {
        imprimirVista(<p>Falla</p>, 'foresight-falla');
      })
    ).toThrow('sin impresión');
    expect(host()).toBeNull();
    expect(document.title).toBe('Foresight');
  });
});
