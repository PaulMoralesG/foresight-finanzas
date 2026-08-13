// ================================================================
// TESTS — src/lib/savings.ts
// ================================================================

import { describe, it, expect } from 'vitest';
import { computeSavingsByConcept, savingsForGoal } from '@/lib/savings';
import type { Transaction } from '@/types';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'uuid-1',
    type: 'expense',
    amount: 100,
    concept: 'Casa',
    date: '2026-07-15',
    category: 'ahorro',
    method: 'cash',
    businessType: 'personal',
    updated_at: '2026-07-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('computeSavingsByConcept', () => {
  it('agrupa solo gastos con categoría ahorro del mes indicado', () => {
    const expenses = [
      tx({ id: 'a', amount: 500, concept: 'Casa', date: '2026-07-10' }),
      tx({ id: 'b', amount: 200, concept: 'Casa', date: '2026-07-20' }),
      tx({ id: 'c', amount: 999, concept: 'Casa', date: '2026-08-01' }), // otro mes
      tx({ id: 'd', amount: 50, concept: 'Vacaciones', category: 'viajes' }), // no ahorro
      tx({ id: 'e', amount: 75, concept: 'Vacaciones', type: 'income' }), // ingreso
    ];

    const byConcept = computeSavingsByConcept(expenses, { year: 2026, month: 6 }); // julio = 6
    expect(byConcept.get('Casa')).toBe(700);
    expect(byConcept.has('Vacaciones')).toBe(false);
  });

  it('sin month suma todo el histórico', () => {
    const expenses = [
      tx({ id: 'a', amount: 500, concept: 'Casa', date: '2026-07-10' }),
      tx({ id: 'b', amount: 200, concept: 'Casa', date: '2025-01-01' }),
    ];
    const byConcept = computeSavingsByConcept(expenses);
    expect(byConcept.get('Casa')).toBe(700);
  });

  it('concepto vacío o solo espacios → "Sin concepto"', () => {
    const expenses = [
      tx({ id: 'a', amount: 100, concept: '' }),
      tx({ id: 'b', amount: 50, concept: '   ' }),
    ];
    const byConcept = computeSavingsByConcept(expenses);
    expect(byConcept.get('Sin concepto')).toBe(150);
  });

  it('devuelve un mapa vacío sin gastos de ahorro', () => {
    const byConcept = computeSavingsByConcept([tx({ id: 'a', category: 'comida' })]);
    expect(byConcept.size).toBe(0);
  });
});

describe('savingsForGoal', () => {
  const byConcept = computeSavingsByConcept([
    tx({ id: 'a', amount: 500, concept: 'Casa' }),
    tx({ id: 'b', amount: 200, concept: 'casa' }), // distinta capitalización
    tx({ id: 'c', amount: 300, concept: 'Auto' }),
  ]);

  it('hace match case-insensitive con el concepto de la meta', () => {
    expect(savingsForGoal(byConcept, 'Casa')).toBe(700);
    expect(savingsForGoal(byConcept, 'CASA')).toBe(700);
    expect(savingsForGoal(byConcept, 'Auto')).toBe(300);
  });

  it('devuelve 0 si ninguna meta coincide', () => {
    expect(savingsForGoal(byConcept, 'Barco')).toBe(0);
  });
});
