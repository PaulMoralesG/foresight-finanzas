import { describe, it, expect } from 'vitest';
import { sortByDateAsc, toCsv } from '@/lib/utils';
import type { Transaction } from '@/types';

const tx = (id: string, date: string, created_at?: string): Transaction => ({
  id,
  date,
  created_at,
  updated_at: created_at ?? '2026-01-01T00:00:00.000Z',
  type: 'expense',
  amount: 10,
  concept: id,
  category: 'food',
  method: 'cash',
  businessType: 'personal',
});

describe('orden de los reportes', () => {
  it('ordena cronológicamente movimientos de meses distintos', () => {
    // Este es el estado real del store: el pull del sync trae las filas con
    // `order by updated_at`, así que quedan por última edición y no por fecha.
    const desordenado = [
      tx('c', '2026-08-15'),
      tx('a', '2026-06-02'),
      tx('d', '2026-09-01'),
      tx('b', '2026-06-30'),
    ];

    expect(sortByDateAsc(desordenado).map((t) => t.date)).toEqual([
      '2026-06-02',
      '2026-06-30',
      '2026-08-15',
      '2026-09-01',
    ]);
  });

  it('ordena días dentro del mismo mes', () => {
    const items = [tx('x', '2026-07-28'), tx('y', '2026-07-03'), tx('z', '2026-07-15')];
    expect(sortByDateAsc(items).map((t) => t.date)).toEqual([
      '2026-07-03',
      '2026-07-15',
      '2026-07-28',
    ]);
  });

  it('cruza el cambio de año correctamente', () => {
    const items = [tx('a', '2027-01-05'), tx('b', '2026-12-20'), tx('c', '2027-02-01')];
    expect(sortByDateAsc(items).map((t) => t.date)).toEqual([
      '2026-12-20',
      '2027-01-05',
      '2027-02-01',
    ]);
  });

  it('en el mismo día respeta el orden de registro', () => {
    const items = [
      tx('segundo', '2026-07-10', '2026-07-10T15:00:00.000Z'),
      tx('primero', '2026-07-10', '2026-07-10T09:00:00.000Z'),
    ];
    expect(sortByDateAsc(items).map((t) => t.id)).toEqual(['primero', 'segundo']);
  });

  it('es determinista aunque falte created_at', () => {
    const items = [tx('b', '2026-07-10'), tx('a', '2026-07-10')];
    expect(sortByDateAsc(items).map((t) => t.id)).toEqual(['a', 'b']);
    // Dos pasadas dan lo mismo: nada de orden dependiente de la entrada
    expect(sortByDateAsc(items.slice().reverse()).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('acepta fechas ISO completas, no solo YYYY-MM-DD', () => {
    const items = [tx('b', '2026-08-20T17:00:00.000Z'), tx('a', '2026-08-02T03:00:00.000Z')];
    expect(sortByDateAsc(items).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('no muta el array original', () => {
    const items = [tx('b', '2026-08-15'), tx('a', '2026-06-02')];
    const copia = [...items];
    sortByDateAsc(items);
    expect(items).toEqual(copia);
  });

  it('el CSV sale con las filas en orden cronológico', async () => {
    const items = sortByDateAsc([
      tx('c', '2026-08-15'),
      tx('a', '2026-06-02'),
      tx('b', '2026-06-30'),
    ]);
    const csv = await toCsv(['Fecha'], items.map((t) => [t.date])).text();
    const fechas = csv.split('\r\n').slice(1);
    expect(fechas).toEqual(['"2026-06-02"', '"2026-06-30"', '"2026-08-15"']);
  });
});
