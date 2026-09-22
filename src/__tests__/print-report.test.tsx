// ================================================================
// TESTS — imprimirReporte (window.print en lugar de jsPDF)
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { imprimirReporte } from '@/lib/print-report';
import { CLASE_HOST } from '@/lib/print';
import type { Transaction } from '@/types';

const movimientos: Transaction[] = [
  {
    id: 'a', type: 'income', amount: 5000, concept: 'Nómina', date: '2026-08-01',
    category: 'salario', method: 'transfer', businessType: 'personal', updated_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'b', type: 'expense', amount: 1200.5, concept: 'Renta', date: '2026-08-03',
    category: 'vivienda', method: 'card', businessType: 'business', updated_at: '2026-08-03T00:00:00.000Z',
  },
];

const agosto = new Date(2026, 7, 1);
const host = () => document.querySelector(`.${CLASE_HOST}`);

describe('imprimirReporte', () => {
  let print: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    print = vi.fn();
    window.print = print as unknown as typeof window.print;
    document.title = 'Foresight';
  });

  afterEach(() => {
    // Simula el cierre del diálogo por si algún test no lo hizo.
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('monta el reporte fuera de #root con título, totales y filas, y llama a window.print', () => {
    act(() => {
      imprimirReporte(movimientos, agosto, 'Completo - Agosto 2026');
    });

    const h = host();
    expect(h).not.toBeNull();
    expect(h!.parentElement).toBe(document.body);
    expect(h!.textContent).toContain('Reporte Completo - Agosto 2026');
    expect(h!.textContent).toContain('$3,799.50'); // saldo
    expect(h!.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(h!.textContent).toContain('Nómina');
    expect(h!.textContent).toContain('Negocio');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('el DOM ya está pintado cuando se llama a print (render síncrono)', () => {
    print.mockImplementation(() => {
      expect(host()!.querySelectorAll('tbody tr')).toHaveLength(2);
    });
    act(() => {
      imprimirReporte(movimientos, agosto);
    });
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('usa el nombre de archivo como título de la pestaña y lo restaura al cerrar el diálogo', () => {
    act(() => {
      imprimirReporte(movimientos, agosto, 'Personal - Agosto 2026');
    });
    expect(document.title).toBe('foresight-reporte-2026-08-personal___agosto_2026');

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(document.title).toBe('Foresight');
    expect(host()).toBeNull();
  });

  it('si afterprint nunca llega, limpia por tiempo', () => {
    act(() => {
      imprimirReporte(movimientos, agosto);
    });
    expect(host()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    });
    expect(host()).toBeNull();
    expect(document.title).toBe('Foresight');
  });

  it('si window.print lanza, limpia y propaga el error', () => {
    print.mockImplementation(() => {
      throw new Error('sin impresión');
    });
    expect(() =>
      act(() => {
        imprimirReporte(movimientos, agosto);
      })
    ).toThrow('sin impresión');
    expect(host()).toBeNull();
    expect(document.title).toBe('Foresight');
  });

  it('sin movimientos imprime el aviso en lugar de la tabla', () => {
    act(() => {
      imprimirReporte([], agosto);
    });
    expect(host()!.textContent).toContain('No hay movimientos registrados');
    expect(host()!.querySelector('table')).toBeNull();
  });
});
