import { describe, it, expect } from 'vitest';
import { MIN_PASSWORD_LENGTH, passwordStrength, validateNewPassword } from '@/lib/password';

describe('validateNewPassword', () => {
  it(`rechaza por debajo de ${MIN_PASSWORD_LENGTH} caracteres`, () => {
    expect(validateNewPassword('abc123')).toContain(String(MIN_PASSWORD_LENGTH));
    expect(validateNewPassword('1234567')).not.toBeNull();
  });

  it('acepta a partir del mínimo', () => {
    expect(validateNewPassword('Tr3sPatit0s')).toBeNull();
  });

  it('rechaza contraseñas comunes aunque cumplan la longitud', () => {
    expect(validateNewPassword('password')).toMatch(/común/i);
    expect(validateNewPassword('12345678')).toMatch(/común/i);
    expect(validateNewPassword('PASSWORD')).toMatch(/común/i); // insensible a mayúsculas
  });
});

describe('passwordStrength', () => {
  it('puntúa 0 una contraseña corta y simple', () => {
    expect(passwordStrength('abc').score).toBe(0);
  });

  it('sube con longitud, mayúsculas, dígitos y símbolos', () => {
    expect(passwordStrength('abcdefgh').score).toBe(1);       // solo longitud
    expect(passwordStrength('abcdefgH').score).toBe(2);       // + mayúscula
    expect(passwordStrength('abcdefH1').score).toBe(3);       // + dígito
    expect(passwordStrength('abcdefH1!').score).toBe(4);      // + símbolo
  });

  it('los colores se adaptan al tema, no van fijos en un style inline', () => {
    // Las variantes pensadas para fondo claro (700) fallan todas sobre el
    // fondo oscuro: entre 3.12:1 y 4.10:1, por debajo del 4.5:1 de AA. Por eso
    // cada nivel tiene que traer su variante dark:.
    for (const pw of ['a', 'abcdefgh', 'abcdefgH', 'abcdefH1', 'abcdefH1!']) {
      const s = passwordStrength(pw);
      expect(s.textClass).toMatch(/dark:/);
      expect(s.barClass).toMatch(/dark:/);
      // Texto en variante 700 (contraste de texto), medidor en 500 (gráfico)
      expect(s.textClass).toMatch(/text-[a-z]+-700/);
      expect(s.barClass).toMatch(/bg-[a-z]+-500/);
    }
  });
});
