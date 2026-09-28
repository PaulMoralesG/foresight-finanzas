// ================================================================
// TESTS — etiquetas y piezas de tipo de movimiento con pagos de deuda
// ================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { typeLabel, typePillClasses } from '@/lib/transaction-labels';
import { TransactionAmount, TypePill } from '@/components/ui/TransactionBits';

afterEach(cleanup);

describe('typeLabel / typePillClasses', () => {
  it('siguen aceptando solo el tipo', () => {
    expect(typeLabel('income')).toBe('Ingreso');
    expect(typeLabel('expense')).toBe('Gasto');
    expect(typeLabel('transfer')).toBe('Transferencia');
  });

  it('un movimiento con debtId es «Pago de deuda», sea expense o transfer', () => {
    expect(typeLabel({ type: 'expense', debtId: 'd1' })).toBe('Pago de deuda');
    expect(typeLabel({ type: 'transfer', debtId: 'd1' })).toBe('Pago de deuda');
    expect(typeLabel({ type: 'expense', debtId: null })).toBe('Gasto');
    expect(typeLabel({ type: 'expense' })).toBe('Gasto');
  });

  it('el pago va en neutro, no en el rojo de gasto', () => {
    expect(typePillClasses({ type: 'expense', debtId: 'd1' })).toBe(typePillClasses('transfer'));
    expect(typePillClasses({ type: 'expense', debtId: 'd1' })).not.toContain('expense');
    expect(typePillClasses({ type: 'expense' })).toContain('expense');
  });
});

describe('TransactionBits con pagos de deuda', () => {
  it('TransactionAmount: salida con signo pero en tinta neutra (no color de gasto)', () => {
    render(<TransactionAmount type="transfer" amount={200} debtId="d1" />);
    const el = screen.getByText(/200/);
    expect(el.textContent).toBe('−$200.00');
    expect(el.className).not.toContain('expense');
  });

  it('TransactionAmount: sin debtId no cambia (gasto rojo, transferencia sin signo)', () => {
    render(
      <>
        <TransactionAmount type="expense" amount={10} />
        <TransactionAmount type="transfer" amount={20} />
      </>,
    );
    expect(screen.getByText('−$10.00').className).toContain('expense');
    expect(screen.getByText('$20.00').textContent).toBe('$20.00');
  });

  it('TypePill: etiqueta «Pago de deuda»', () => {
    render(<TypePill type="expense" debtId="d1" />);
    expect(screen.getByText('Pago de deuda')).toBeInTheDocument();
  });
});
