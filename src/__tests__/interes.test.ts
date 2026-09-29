// ================================================================
// TESTS — interesEstimadoMensual: estimación del interés de un mes
// ================================================================

import { describe, it, expect } from 'vitest';
import { interesEstimadoMensual } from '@/lib/interes';

describe('interesEstimadoMensual', () => {
  it('saldo × tasa anual / 12, redondeado a centavos', () => {
    expect(interesEstimadoMensual(1200, 24)).toBe(24);
    expect(interesEstimadoMensual(1000, 16)).toBe(13.33);
    expect(interesEstimadoMensual(6586.29, 21.5)).toBe(118); // 118.0 aprox: 6586.29*0.215/12 = 118.0
  });

  it('es 0 si la tasa es 0 o negativa (0 = sin definir)', () => {
    expect(interesEstimadoMensual(1000, 0)).toBe(0);
    expect(interesEstimadoMensual(1000, -5)).toBe(0);
  });

  it('es 0 si el saldo es 0, negativo o inválido', () => {
    expect(interesEstimadoMensual(0, 20)).toBe(0);
    expect(interesEstimadoMensual(-100, 20)).toBe(0);
    expect(interesEstimadoMensual(Number.NaN, 20)).toBe(0);
    expect(interesEstimadoMensual(100, Number.NaN)).toBe(0);
    expect(interesEstimadoMensual(Infinity, 20)).toBe(0);
  });
});
