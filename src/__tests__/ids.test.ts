// ================================================================
// TESTS — src/lib/ids.ts (uuidv5 determinista)
// ================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { uuidv5, newId, nowIso } from '@/lib/ids';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('uuidv5', () => {
  it('devuelve vectores fijos (SHA-1 truncado a 16 bytes, versión 5, variante RFC 4122)', async () => {
    // Si estos valores cambian, los ids del import legacy y de las
    // recurrencias dejan de coincidir entre dispositivos y versiones: se
    // duplicarían los datos. SHA-1("") = da39a3ee5e6b4b0d3255bfef95601890afd80709
    // y SHA-1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d, con los
    // nibbles de versión (5) y variante (8..b) forzados.
    expect(await uuidv5('')).toBe('da39a3ee-5e6b-5b0d-b255-bfef95601890');
    expect(await uuidv5('abc')).toBe('a9993e36-4706-516a-ba3e-25717850c26c');
  });

  it('es determinista y distingue semillas', async () => {
    const [a1, a2, b] = await Promise.all([uuidv5('rec|2026-09-01'), uuidv5('rec|2026-09-01'), uuidv5('rec|2026-09-02')]);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it('tiene formato UUID v5', async () => {
    for (const seed of ['', 'x', 'legacy|expense|123', 'ñandú 💸']) {
      expect(await uuidv5(seed)).toMatch(UUID_V5);
    }
  });

  it('fallback sin crypto.subtle: determinista y con formato v5, pero NO coincide con el camino SHA-1', async () => {
    // Comportamiento documentado: si crypto.subtle.digest lanza (contexto no
    // seguro, entorno sin Web Crypto), se usa un hash djb2 doble. Es estable
    // dentro del mismo entorno, pero da ids distintos a los del camino SHA-1:
    // un dispositivo sin subtle y otro con él NO convergen al mismo id para la
    // misma semilla (riesgo de duplicados al sincronizar entre ambos).
    const conSubtle = await uuidv5('rec|2026-09-01');
    vi.stubGlobal('crypto', {
      randomUUID: () => 'x',
      subtle: { digest: () => Promise.reject(new Error('sin subtle')) },
    });
    const f1 = await uuidv5('rec|2026-09-01');
    const f2 = await uuidv5('rec|2026-09-01');
    const f3 = await uuidv5('rec|2026-09-02');
    expect(f1).toBe(f2);
    expect(f1).not.toBe(f3);
    expect(f1).toMatch(UUID_V5);
    expect(f1).not.toBe(conSubtle);
  });

  it('fallback cuando crypto.subtle no existe (digest lanza TypeError)', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'x' });
    expect(await uuidv5('abc')).toMatch(UUID_V5);
  });
});

describe('newId / nowIso', () => {
  it('newId devuelve ids distintos con forma de UUID', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(newId());
  });

  it('newId usa el fallback con Math.random si no hay crypto.randomUUID', () => {
    vi.stubGlobal('crypto', undefined);
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('nowIso es ISO UTC con milisegundos', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
