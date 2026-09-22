import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  passwordStrength,
  validateNewPassword,
  leakedPasswordCount,
  validateNewPasswordOnline,
  LEAKED_PASSWORD_MESSAGE,
} from '@/lib/password';

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

// ─── Contraseñas filtradas (HaveIBeenPwned, k-anonimato) ────────

describe('leakedPasswordCount / validateNewPasswordOnline', () => {
  // SHA-1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 → prefijo 5BAA6, sufijo 1E4C9…
  const SUFIJO_PASSWORD = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
  const respuesta = (body: string, ok = true) =>
    Promise.resolve({ ok, text: () => Promise.resolve(body) } as Response);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envía solo los 5 primeros caracteres del SHA-1, con Add-Padding, y encuentra el sufijo', async () => {
    const fetchMock = vi.fn(() => respuesta(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFIJO_PASSWORD}:9545824\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0`));
    vi.stubGlobal('fetch', fetchMock);

    expect(await leakedPasswordCount('password')).toBe(9545824);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(url).not.toContain(SUFIJO_PASSWORD);
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('devuelve 0 si el sufijo no aparece (o solo aparece como relleno con contador 0)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respuesta(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFIJO_PASSWORD}:0`)));
    expect(await leakedPasswordCount('password')).toBe(0);
  });

  it('fail-open: sin red, con error HTTP o con la API caída no bloquea', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect(await leakedPasswordCount('password')).toBe(0);

    vi.stubGlobal('fetch', vi.fn(() => respuesta('', false)));
    expect(await leakedPasswordCount('password')).toBe(0);

    vi.stubGlobal('fetch', vi.fn(() => respuesta(`${SUFIJO_PASSWORD}:5`)));
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    expect(await leakedPasswordCount('password')).toBe(0);
  });

  it('validateNewPasswordOnline aplica primero la política local y luego las filtraciones', async () => {
    const fetchMock = vi.fn(() => respuesta(`${SUFIJO_PASSWORD}:5`));
    vi.stubGlobal('fetch', fetchMock);

    expect(await validateNewPasswordOnline('corta')).toContain(String(MIN_PASSWORD_LENGTH));
    expect(fetchMock).not.toHaveBeenCalled(); // no consulta lo que ya falla en local

    expect(await validateNewPasswordOnline('password')).toMatch(/común/i); // lista local, sin red
    expect(fetchMock).not.toHaveBeenCalled();

    // Contraseña que pasa la política local pero cuyo hash "aparece" filtrado
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode('Tr3sPatit0s'));
      const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      expect(url).toBe(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`);
      return respuesta(`${hex.slice(5)}:12`);
    }));
    expect(await validateNewPasswordOnline('Tr3sPatit0s')).toBe(LEAKED_PASSWORD_MESSAGE);

    vi.stubGlobal('fetch', vi.fn(() => respuesta('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0')));
    expect(await validateNewPasswordOnline('Tr3sPatit0s')).toBeNull();
  });
});
