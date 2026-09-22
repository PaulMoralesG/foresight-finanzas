// ================================================================
// TESTS — imprimirPresupuesto (window.print del resumen de presupuesto)
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { imprimirPresupuesto } from '@/lib/print-budgets';
import { groupSummary } from '@/lib/budget-lines';
import { CLASE_HOST } from '@/lib/print';
import type { BudgetLine, Transaction } from '@/types';

const host = () => document.querySelector(`.${CLASE_HOST}`);

describe('imprimirPresupuesto', () => {
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

  it('monta la tabla presupuestado vs. real y llama a window.print', () => {
    const lines: BudgetLine[] = [
      { id: 'l1', tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 200, plan: {}, updated_at: '' },
    ];
    const expenses: Transaction[] = [
      { id: 't1', type: 'expense', amount: 150, concept: '', date: '2026-01-10', category: 'comida', method: 'card', businessType: 'personal', updated_at: '' },
    ];
    const resumen = groupSummary(lines, expenses, '2026-01', []);

    act(() => {
      imprimirPresupuesto(resumen, 'Enero 2026', '2026-01');
    });

    const h = host();
    expect(h).not.toBeNull();
    expect(h!.textContent).toContain('Presupuestado vs. real');
    expect(h!.textContent).toContain('Alimentación');
    expect(document.title).toBe('foresight-presupuesto-2026-01');
    expect(print).toHaveBeenCalledTimes(1);
  });
});
