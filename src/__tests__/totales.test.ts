// ================================================================
// TESTS — src/lib/totales.ts (ingresos, gastos y saldo de una lista)
// ================================================================

import { describe, it, expect } from 'vitest';
import { totalesDe } from '@/lib/totales';
import type { Transaction } from '@/types';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'a',
    type: 'expense',
    amount: 100,
    concept: 'Compra',
    date: '2026-08-15',
    category: 'comida',
    method: 'cash',
    businessType: 'personal',
    created_at: '2026-08-15T10:00:00.000Z',
    updated_at: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('totalesDe', () => {
  it('lista vacía: todo en cero', () => {
    expect(totalesDe([])).toEqual({ ingresos: 0, gastos: 0, saldo: 0 });
  });

  it('suma ingresos y gastos y calcula el saldo', () => {
    const r = totalesDe([
      tx({ id: '1', type: 'income', amount: 500 }),
      tx({ id: '2', type: 'expense', amount: 120 }),
      tx({ id: '3', type: 'expense', amount: 30 }),
    ]);
    expect(r).toEqual({ ingresos: 500, gastos: 150, saldo: 350 });
  });

  it('un pago de deuda y una transferencia no cuentan como gasto', () => {
    const r = totalesDe([
      tx({ id: '1', type: 'expense', amount: 80 }),
      tx({ id: '2', type: 'expense', amount: 999, debtId: 'd1' }),
      tx({ id: '3', type: 'transfer', amount: 400 }),
    ]);
    expect(r.gastos).toBe(80);
    expect(r.ingresos).toBe(0);
  });

  it('redondea a centavos sin arrastrar error de coma flotante', () => {
    const r = totalesDe([
      tx({ id: '1', type: 'income', amount: 0.1 }),
      tx({ id: '2', type: 'income', amount: 0.2 }),
    ]);
    expect(r.ingresos).toBe(0.3);
  });

  it('el saldo puede ser negativo', () => {
    expect(totalesDe([tx({ amount: 50 })]).saldo).toBe(-50);
  });
});
