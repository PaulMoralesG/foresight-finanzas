// ================================================================
// TESTS — src/lib/utils.ts
// ================================================================

import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  parseMoneyInput,
  getTodayISO,
  MONTH_NAMES,
  safeParseDate,
  formatDateLong,
} from '@/lib/utils';

// ─── formatMoney ────────────────────────────────────────────────

describe('formatMoney', () => {
  it('formatea números positivos en MXN', () => {
    expect(formatMoney(1500)).toBe('$1,500.00');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(99.9)).toBe('$99.90');
  });

  it('formatea números negativos correctamente', () => {
    const result = formatMoney(-500);
    expect(result).toContain('500');
    expect(result).toContain('-');
  });

  it('usa separadores de miles para montos grandes', () => {
    expect(formatMoney(1_000_000)).toBe('$1,000,000.00');
  });
});

// ─── parseMoneyInput ────────────────────────────────────────────

describe('parseMoneyInput', () => {
  it('retorna 0 para string vacío', () => {
    expect(parseMoneyInput('')).toBe(0);
    expect(parseMoneyInput('   ')).toBe(0);
  });

  it('convierte número entero simple', () => {
    expect(parseMoneyInput('42')).toBe(42);
    expect(parseMoneyInput('1000')).toBe(1000);
  });

  it('maneja coma como decimal', () => {
    expect(parseMoneyInput('1,50')).toBe(1.5);
    expect(parseMoneyInput('99,99')).toBe(99.99);
    expect(parseMoneyInput('0,50')).toBe(0.5);
  });

  it('maneja punto como decimal', () => {
    expect(parseMoneyInput('1.50')).toBe(1.5);
    expect(parseMoneyInput('60.70')).toBe(60.7);
  });

  it('maneja coma como separador de miles', () => {
    expect(parseMoneyInput('1,000')).toBe(1000);
    expect(parseMoneyInput('10,000')).toBe(10000);
  });

  it('maneja punto como separador de miles', () => {
    expect(parseMoneyInput('1.000')).toBe(1000);
    expect(parseMoneyInput('10.000')).toBe(10000);
  });

  it('maneja ambos separadores (punto=miles, coma=decimal)', () => {
    expect(parseMoneyInput('1.000,50')).toBe(1000.5);
    expect(parseMoneyInput('10.000,99')).toBe(10000.99);
  });

  it('maneja ambos separadores (coma=miles, punto=decimal)', () => {
    expect(parseMoneyInput('1,000.50')).toBe(1000.5);
    expect(parseMoneyInput('10,000.99')).toBe(10000.99);
  });

  it('rechaza strings no numéricos', () => {
    expect(parseMoneyInput('abc')).toBe(0);
    expect(parseMoneyInput('---')).toBe(0);
  });
});

// ─── getTodayISO ────────────────────────────────────────────────

describe('getTodayISO', () => {
  it('retorna string en formato YYYY-MM-DD', () => {
    const result = getTodayISO();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('retorna la fecha de hoy', () => {
    const today = new Date();
    const iso = getTodayISO();
    const [y, m, d] = iso.split('-').map(Number);
    expect(y).toBe(today.getFullYear());
    expect(m).toBe(today.getMonth() + 1);
    expect(d).toBe(today.getDate());
  });
});

// ─── safeParseDate ──────────────────────────────────────────────

describe('safeParseDate', () => {
  it('parsea YYYY-MM-DD correctamente', () => {
    const result = safeParseDate('2026-07-15');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6); // Julio = index 6
    expect(result.getDate()).toBe(15);
  });

  it('maneja fechas de fin de mes', () => {
    const result = safeParseDate('2026-01-31');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(31);
  });

  it('maneja ISO completo con hora (solo toma la parte de fecha)', () => {
    const result = safeParseDate('2026-02-13T17:00:00.000Z');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(13);
  });
});

// ─── formatDateLong ─────────────────────────────────────────────

describe('formatDateLong', () => {
  it('formatea fecha en español', () => {
    expect(formatDateLong('2026-07-15')).toBe('15 de Julio 2026');
    expect(formatDateLong('2026-01-01')).toBe('1 de Enero 2026');
    expect(formatDateLong('2026-12-31')).toBe('31 de Diciembre 2026');
  });
});

// ─── MONTH_NAMES ────────────────────────────────────────────────

describe('MONTH_NAMES', () => {
  it('tiene 12 meses en español', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe('Enero');
    expect(MONTH_NAMES[11]).toBe('Diciembre');
  });
});
