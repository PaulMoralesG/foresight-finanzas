// ================================================================
// TESTS — src/lib/month-keys.ts
// ================================================================

import { describe, it, expect } from 'vitest';
import { shiftMonthKey, monthKeyLabel, monthKeyLabelCorto, currentMonthKey } from '@/lib/month-keys';

describe('shiftMonthKey', () => {
  it('cruza el límite de año en ambos sentidos', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-08', 0)).toBe('2026-08');
  });
});

describe('monthKeyLabel', () => {
  it('formatea el mes en español, nombre completo (mismo formato que MonthNav)', () => {
    expect(monthKeyLabel('2026-08')).toBe('Agosto 2026');
    expect(monthKeyLabel('2026-01')).toBe('Enero 2026');
  });

  it('la versión corta abrevia el mes a tres letras', () => {
    expect(monthKeyLabelCorto('2026-09')).toBe('Sep 2026');
  });
});

describe('currentMonthKey', () => {
  it('devuelve el mes de hoy con el mes a dos dígitos', () => {
    const d = new Date();
    expect(currentMonthKey()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
});
