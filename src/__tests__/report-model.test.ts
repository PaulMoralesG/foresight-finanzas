// ================================================================
// TESTS — Modelo del reporte imprimible (lo que antes armaba jsPDF)
// ================================================================

import { describe, it, expect } from 'vitest';
import { construirReporte } from '@/lib/report-model';
import type { Transaction } from '@/types';

let n = 0;
function tx(overrides: Partial<Transaction> = {}): Transaction {
  n += 1;
  return {
    id: `t${n}`,
    type: 'expense',
    amount: 100,
    concept: `Mov ${n}`,
    date: '2026-08-15',
    category: 'comida',
    method: 'cash',
    businessType: 'personal',
    updated_at: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

const agosto = new Date(2026, 7, 1);

describe('construirReporte', () => {
  it('ordena las filas cronológicamente aunque lleguen desordenadas', () => {
    const r = construirReporte(
      [tx({ date: '2026-08-20' }), tx({ date: '2026-08-02' }), tx({ date: '2026-08-11' })],
      agosto,
    );
    expect(r.filas.map((f) => f.fecha)).toEqual(['2/8/2026', '11/8/2026', '20/8/2026']);
  });

  it('calcula ingresos, gastos y saldo redondeados a centavos', () => {
    const r = construirReporte(
      [
        tx({ type: 'income', amount: 1000.005 }),
        tx({ type: 'expense', amount: 0.1 }),
        tx({ type: 'expense', amount: 0.2 }),
      ],
      agosto,
    );
    expect(r.totales.ingresos).toBe(1000.01);
    expect(r.totales.gastos).toBe(0.3);
    expect(r.totales.saldo).toBe(999.71);
  });

  it('describe cada fila con tipo y ámbito legibles y el monto formateado', () => {
    const r = construirReporte(
      [tx({ type: 'income', amount: 2500, businessType: 'business', concept: 'Factura 12' })],
      agosto,
    );
    expect(r.filas[0]).toEqual({
      fecha: '15/8/2026',
      tipo: 'Ingreso',
      ambito: 'Negocio',
      monto: '$2,500.00',
      concepto: 'Factura 12',
    });
  });

  it('con etiqueta: título "Reporte <etiqueta>" y nombre de archivo derivado', () => {
    const r = construirReporte([tx()], agosto, 'Personal - Agosto 2026');
    expect(r.titulo).toBe('Reporte Personal - Agosto 2026');
    expect(r.archivo).toBe('foresight-reporte-2026-08-personal___agosto_2026');
  });

  it('sin etiqueta: título genérico con mes/año', () => {
    const r = construirReporte([tx()], agosto);
    expect(r.titulo).toBe('Reporte Financiero - 08/2026');
    expect(r.archivo).toBe('foresight-reporte-2026-08');
  });

  it('sin movimientos deja filas vacías y totales en cero', () => {
    const r = construirReporte([], agosto);
    expect(r.filas).toEqual([]);
    expect(r.totales).toEqual({ ingresos: 0, gastos: 0, saldo: 0 });
  });
});

describe('construirReporte — pagos de deuda', () => {
  const movs = () => [
    tx({ type: 'income', amount: 1000, date: '2026-08-01' }),
    tx({ amount: 100, date: '2026-08-02' }),
    tx({ amount: 200, date: '2026-08-03', category: 'pago-tarjetas', debtId: 'd1' }),
    tx({ type: 'transfer', amount: 300, date: '2026-08-04', category: 'transferencia', debtId: 'd1', accountId: 'a1', toAccountId: null }),
  ];

  it('no suma los pagos de deuda a los gastos ni al saldo', () => {
    const r = construirReporte(movs(), agosto);
    expect(r.totales).toEqual({ ingresos: 1000, gastos: 100, saldo: 900 });
  });

  it('los lista con el tipo «Pago de deuda» (sea expense o transfer)', () => {
    const r = construirReporte(movs(), agosto);
    expect(r.filas.map((f) => f.tipo)).toEqual(['Ingreso', 'Gasto', 'Pago de deuda', 'Pago de deuda']);
  });
});
