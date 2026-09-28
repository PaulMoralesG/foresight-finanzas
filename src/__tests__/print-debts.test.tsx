// ================================================================
// TESTS — imprimirDeudas (window.print de la lista de deudas)
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { imprimirDeudas } from '@/lib/print-debts';
import { CLASE_HOST } from '@/lib/print';
import type { Debt } from '@/types';

const host = () => document.querySelector(`.${CLASE_HOST}`);

const deuda = (overrides: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  name: 'Tarjeta Banco',
  tag: 'personal',
  kind: 'Tarjeta de crédito',
  balance: 500,
  annualRate: 22,
  minPayment: 50,
  payDay: 15,
  updated_at: '',
  ...overrides,
});

describe('imprimirDeudas', () => {
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

  it('monta la tabla de deudas con el saldo total y llama a window.print', () => {
    act(() => {
      imprimirDeudas([deuda(), deuda({ id: 'd2', name: 'Préstamo auto', balance: 1000 })]);
    });

    const h = host();
    expect(h).not.toBeNull();
    expect(h!.textContent).toContain('Tarjeta Banco');
    expect(h!.textContent).toContain('Préstamo auto');
    expect(h!.textContent).toContain('$1,500.00'); // saldo total
    expect(document.title).toBe('foresight-deudas');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('un pago mínimo de 0 se imprime como «Variable», no como $0.00', () => {
    act(() => {
      imprimirDeudas([deuda({ minPayment: 0 })]);
    });

    const celdas = Array.from(host()!.querySelectorAll('tbody td')).map((td) => td.textContent);
    expect(celdas).toContain('Variable');
    expect(celdas).not.toContain('$0.00');
  });
});
