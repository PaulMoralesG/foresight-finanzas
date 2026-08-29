// ================================================================
// TESTS — src/lib/movements-csv.ts (formato único de exportación)
// ================================================================

import { describe, it, expect } from 'vitest';
import { movementsToRows, movementsToCsv, CSV_HEADERS } from '@/lib/movements-csv';
import type { Category, Transaction } from '@/types';

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

async function leer(blob: Blob): Promise<string> {
  return await blob.text();
}

describe('movementsToRows', () => {
  it('emite las columnas en el orden de CSV_HEADERS', () => {
    const [fila] = movementsToRows([tx({ concept: 'Pan' })], []);
    expect(fila).toHaveLength(CSV_HEADERS.length);
    expect(fila).toEqual(['2026-08-15', 'Gasto', 'Personal', 'Comida', 'Pan', 'Efectivo', '-100.00']);
  });

  it('firma el importe: los ingresos en positivo, los gastos en negativo', () => {
    const filas = movementsToRows(
      [
        tx({ id: 'a', type: 'income', amount: 1200, date: '2026-08-01' }),
        tx({ id: 'b', type: 'expense', amount: 300, date: '2026-08-02' }),
      ],
      [],
    );
    // La columna de monto es la última, para poder sumarla en la hoja de cálculo
    expect(filas.map((f) => f[f.length - 1])).toEqual(['1200.00', '-300.00']);
  });

  it('redondea el importe a dos decimales', () => {
    const [fila] = movementsToRows([tx({ amount: 0.1 + 0.2 })], []);
    expect(fila[fila.length - 1]).toBe('-0.30');
  });

  it('ordena cronológicamente aunque el store venga por última edición', () => {
    const filas = movementsToRows(
      [
        tx({ id: 'c', date: '2026-08-15' }),
        tx({ id: 'a', date: '2026-06-02' }),
        tx({ id: 'b', date: '2026-09-01' }),
      ],
      [],
    );
    expect(filas.map((f) => f[0])).toEqual(['2026-06-02', '2026-08-15', '2026-09-01']);
  });

  it('usa la fecha ISO, no una localizada', () => {
    // dd/mm/yyyy se confunde con mm/dd en una hoja de cálculo con otro locale
    const [fila] = movementsToRows([tx({ date: '2026-03-04' })], []);
    expect(fila[0]).toBe('2026-03-04');
  });

  it('trata un ámbito ausente como Negocio, igual que el resto de la app', () => {
    const [fila] = movementsToRows(
      [tx({ businessType: undefined as unknown as Transaction['businessType'] })],
      [],
    );
    expect(fila[2]).toBe('Negocio');
  });

  it('traduce los tres métodos de pago', () => {
    const filas = movementsToRows(
      [
        tx({ id: 'a', method: 'cash', date: '2026-08-01' }),
        tx({ id: 'b', method: 'card', date: '2026-08-02' }),
        tx({ id: 'c', method: 'transfer', date: '2026-08-03' }),
      ],
      [],
    );
    expect(filas.map((f) => f[5])).toEqual(['Efectivo', 'Tarjeta', 'Transferencia']);
  });

  it('resuelve la etiqueta de una categoría personalizada', () => {
    const custom: Category[] = [
      { id: 'custom_x', label: 'Insumos', icon: '📦', color: 'bg-slate-100' },
    ];
    const [fila] = movementsToRows([tx({ category: 'custom_x' })], custom);
    expect(fila[3]).toBe('Insumos');
  });

  it('escribe "Sin categoría" cuando el id ya no existe', () => {
    // getCategoryById trae su propio fallback en vez de devolver undefined,
    // así que en el archivo nunca aparece un slug crudo.
    const [fila] = movementsToRows([tx({ category: 'borrada' })], []);
    expect(fila[3]).toBe('Sin categoría');
  });
});

describe('movementsToCsv', () => {
  it('escribe la cabecera y escapa todas las celdas', async () => {
    const custom: Category[] = [
      { id: 'custom_c', label: 'Comida, bebida', icon: '🍴', color: 'bg-slate-100' },
    ];
    const csv = await leer(movementsToCsv([tx({ category: 'custom_c' })], custom));

    // Una categoría con coma desplazaba las columnas cuando solo se
    // entrecomillaba el concepto.
    expect(csv).toContain('"Fecha","Tipo","Ámbito","Categoría","Concepto","Método","Monto"');
    expect(csv).toContain('"Comida, bebida"');
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('lleva BOM para que Excel detecte UTF-8', async () => {
    // Hay que mirar los BYTES: Blob.text() decodifica como UTF-8 y el spec
    // descarta el BOM inicial, así que leyendo texto nunca se vería.
    const bytes = new Uint8Array(await movementsToCsv([tx()], []).arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('escapa las comillas dobles del concepto', async () => {
    const csv = await leer(movementsToCsv([tx({ concept: 'Pago "urgente"' })], []));
    expect(csv).toContain('"Pago ""urgente"""');
  });
});
