// ================================================================
// TESTS — imprimirPatrimonio (window.print de la evolución del patrimonio)
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { imprimirPatrimonio } from '@/lib/print-networth';
import { CLASE_HOST } from '@/lib/print';
import type { NetWorthSnapshot } from '@/types';

const host = () => document.querySelector(`.${CLASE_HOST}`);

describe('imprimirPatrimonio', () => {
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

  it('monta la tabla de cierres mensuales y llama a window.print', () => {
    const history: NetWorthSnapshot[] = [
      { month: '2026-01', assets: 1000, liabilities: 200, net: 800, updated_at: '' },
      { month: '2026-02', assets: 1200, liabilities: 200, net: 1000, updated_at: '' },
    ];

    act(() => {
      imprimirPatrimonio(history);
    });

    const h = host();
    expect(h).not.toBeNull();
    expect(h!.textContent).toContain('Patrimonio');
    expect(h!.textContent).toContain('$1,000.00'); // neto del último cierre
    expect(document.title).toBe('foresight-patrimonio');
    expect(print).toHaveBeenCalledTimes(1);
  });
});
