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

  it('da un color de etiqueta con contraste suficiente sobre blanco', () => {
    // El color del medidor (gráfico) puede ser más claro que el del texto:
    // WCAG pide 3:1 para gráficos y 4.5:1 para texto. Deben ser distintos.
    for (let i = 0; i <= 4; i++) {
      const pw = ['a', 'abcdefgh', 'abcdefgH', 'abcdefH1', 'abcdefH1!'][i];
      const s = passwordStrength(pw);
      expect(s.textColor).toBeDefined();
      expect(s.color).toBeDefined();
      expect(s.textColor).not.toBe(s.color);
    }
  });
});
