import { describe, it, expect } from 'vitest';
import { makeCategoryId } from '@/lib/category-id';

describe('makeCategoryId', () => {
  it('normaliza acentos en vez de borrarlos', () => {
    // Antes: 'Café' -> 'custom_caf' (la é se eliminaba por no ser ASCII)
    expect(makeCategoryId('Café')).toMatch(/^custom_cafe_[0-9a-f]{6}$/);
    expect(makeCategoryId('Diseño')).toMatch(/^custom_diseno_/);
    expect(makeCategoryId('Educación')).toMatch(/^custom_educacion_/);
  });

  it('no colisiona cuando dos etiquetas distintas normalizan igual', () => {
    // Este era el bug: 'Café' y 'Cafe' producían el mismo id, el control de
    // duplicados comparaba etiquetas (no ids) y la segunda categoría pisaba
    // a la primera en el upsert.
    const a = makeCategoryId('Café');
    const b = makeCategoryId('Cafe');
    expect(a).not.toBe(b);
  });

  it('el mismo texto genera ids distintos en llamadas distintas', () => {
    expect(makeCategoryId('Comida')).not.toBe(makeCategoryId('Comida'));
  });

  it('produce un id válido para etiquetas sin caracteres latinos', () => {
    // Antes daba exactamente 'custom_' para cualquiera de estas
    expect(makeCategoryId('🍕')).toMatch(/^custom_[0-9a-f]{6}$/);
    expect(makeCategoryId('日本語')).toMatch(/^custom_[0-9a-f]{6}$/);
    expect(makeCategoryId('!!!')).toMatch(/^custom_[0-9a-f]{6}$/);
  });

  it('colapsa espacios y separadores repetidos', () => {
    expect(makeCategoryId('Comida   rápida')).toMatch(/^custom_comida_rapida_/);
    expect(makeCategoryId('  Gastos -- varios  ')).toMatch(/^custom_gastos_varios_/);
  });

  it('acota la longitud del slug', () => {
    const id = makeCategoryId('a'.repeat(200));
    // custom_ (7) + slug (32) + _ (1) + sufijo (6)
    expect(id.length).toBeLessThanOrEqual(46);
  });

  it('siempre empieza por custom_', () => {
    for (const label of ['Comida', 'Café', '🍕', '', '   ']) {
      expect(makeCategoryId(label).startsWith('custom_')).toBe(true);
    }
  });
});
