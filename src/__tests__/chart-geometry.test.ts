// ================================================================
// TESTS — Geometría de gráficos SVG (sustituye a Recharts)
// ================================================================

import { describe, it, expect } from 'vitest';
import { escalaBonita, formatoTickDinero, trazarLinea } from '@/lib/chart-geometry';

describe('escalaBonita', () => {
  it('cubre el rango con ticks redondos y siempre incluye el cero', () => {
    const s = escalaBonita(0, 8600, 5);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(8600);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
    // Paso 2000: 0, 2000, …, 10000
    expect(s.ticks).toEqual([0, 2000, 4000, 6000, 8000, 10000]);
  });

  it('extiende el dominio por debajo de cero cuando el balance es negativo', () => {
    const s = escalaBonita(-1300, 4000, 5);
    expect(s.min).toBeLessThanOrEqual(-1300);
    expect(s.ticks).toContain(0);
    expect(s.ticks[0]).toBe(s.min);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
  });

  it('con todo en cero devuelve un dominio mínimo utilizable', () => {
    const s = escalaBonita(0, 0, 5);
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('usa pasos 1-2-5 por década', () => {
    expect(escalaBonita(0, 37, 5).ticks).toEqual([0, 10, 20, 30, 40]);
    expect(escalaBonita(0, 1234567, 5).ticks).toEqual([0, 500000, 1000000, 1500000]);
  });
});

describe('formatoTickDinero', () => {
  it('abrevia miles y millones como hacía el tickFormatter de Recharts', () => {
    expect(formatoTickDinero(0)).toBe('$0');
    expect(formatoTickDinero(500)).toBe('$500');
    expect(formatoTickDinero(1000)).toBe('$1k');
    expect(formatoTickDinero(12000)).toBe('$12k');
    expect(formatoTickDinero(1500000)).toBe('$1.5M');
  });

  it('conserva el signo en negativos', () => {
    expect(formatoTickDinero(-2000)).toBe('-$2k');
    expect(formatoTickDinero(-50)).toBe('-$50');
  });
});

describe('trazarLinea', () => {
  it('construye un path M/L con una decimal', () => {
    expect(trazarLinea([[0, 10], [20.456, 5.04], [40, 0]])).toBe('M0.0 10.0 L20.5 5.0 L40.0 0.0');
  });

  it('con un solo punto devuelve solo el M', () => {
    expect(trazarLinea([[3, 3]])).toBe('M3.0 3.0');
  });

  it('sin puntos devuelve cadena vacía', () => {
    expect(trazarLinea([])).toBe('');
  });
});
