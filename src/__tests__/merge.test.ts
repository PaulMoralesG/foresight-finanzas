// ================================================================
// TESTS — src/lib/merge.ts (merge determinista por fila)
// ================================================================

import { describe, it, expect } from 'vitest';
import { mergeById, mergeBudgets, type MergeSet } from '@/lib/merge';

interface Item {
  id: string;
  updated_at: string;
  value: string;
}

function item(id: string, updatedAt: string, value: string): Item {
  return { id, updated_at: updatedAt, value };
}

function set(live: Item[] = [], tombstones: Record<string, string> = {}): MergeSet<Item> {
  return { live, tombstones };
}

const T1 = '2026-08-01T10:00:00.000Z';
const T2 = '2026-08-02T10:00:00.000Z';
const T3 = '2026-08-03T10:00:00.000Z';

describe('mergeById', () => {
  it('conserva items locales más nuevos (pull-then-push: local gana)', () => {
    const result = mergeById(
      set([item('a', T2, 'local-nuevo')]),
      set([item('a', T1, 'server-viejo')]),
    );
    expect(result.live).toEqual([item('a', T2, 'local-nuevo')]);
    expect(result.tombstones).toEqual({});
  });

  it('adopta items remotos que no existen localmente', () => {
    const result = mergeById(
      set([item('a', T1, 'local')]),
      set([item('a', T1, 'local'), item('b', T2, 'solo-server')]),
    );
    expect(result.live).toHaveLength(2);
    expect(result.live.find((i) => i.id === 'b')?.value).toBe('solo-server');
  });

  it('adopta la versión remota cuando es más nueva', () => {
    const result = mergeById(
      set([item('a', T1, 'local-viejo')]),
      set([item('a', T2, 'server-nuevo')]),
    );
    expect(result.live).toEqual([item('a', T2, 'server-nuevo')]);
  });

  it('propaga borrado remoto: tombstone más nuevo gana sobre item local', () => {
    const result = mergeById(
      set([item('a', T1, 'local')]),
      set([], { a: T2 }),
    );
    expect(result.live).toEqual([]);
    expect(result.tombstones['a']).toBe(T2);
  });

  it('resucita: item local más nuevo gana sobre tombstone remoto', () => {
    const result = mergeById(
      set([item('a', T2, 'editado-después')]),
      set([], { a: T1 }),
    );
    expect(result.live).toEqual([item('a', T2, 'editado-después')]);
    expect(result.tombstones).toEqual({});
  });

  it('propaga borrado local: tombstone local más nuevo gana sobre item remoto', () => {
    const result = mergeById(
      set([], { a: T2 }),
      set([item('a', T1, 'server')]),
    );
    expect(result.live).toEqual([]);
    expect(result.tombstones['a']).toBe(T2);
  });

  it('tombstone unilateral local se conserva (borrado que el server nunca vio)', () => {
    const result = mergeById(
      set([], { x: T2 }),
      set([item('a', T1, 'server')]),
    );
    expect(result.tombstones['x']).toBe(T2);
    expect(result.live).toEqual([item('a', T1, 'server')]);
  });

  it('tombstone unilateral remoto se adopta', () => {
    const result = mergeById(
      set([item('a', T1, 'local')]),
      set([item('a', T1, 'local')], { z: T2 }),
    );
    expect(result.tombstones['z']).toBe(T2);
    expect(result.live).toEqual([item('a', T1, 'local')]);
  });

  it('empate exacto → gana remote', () => {
    const result = mergeById(
      set([item('a', T1, 'igual')]),
      set([item('a', T1, 'igual')]),
    );
    expect(result.live).toEqual([item('a', T1, 'igual')]);
  });

  it('empate de marcas con contenido distinto → comparación canónica determinista', () => {
    const result = mergeById(
      set([item('a', T1, 'contenido-local')]),
      set([item('a', T1, 'contenido-remoto')]),
    );
    // La regla es determinista: misma entrada → misma salida, una sola ganadora
    const again = mergeById(
      set([item('a', T1, 'contenido-local')]),
      set([item('a', T1, 'contenido-remoto')]),
    );
    expect(result.live).toHaveLength(1);
    expect(result.live).toEqual(again.live);
  });

  it('invariante: un id nunca está vivo y en tombstones a la vez', () => {
    const result = mergeById(
      set([item('a', T1, 'x'), item('b', T1, 'y')], { b: T2 }),
      set([], { a: T3 }),
    );
    const liveIds = new Set(result.live.map((i) => i.id));
    const tombstoneIds = Object.keys(result.tombstones);
    for (const id of tombstoneIds) {
      expect(liveIds.has(id)).toBe(false);
    }
  });

  it('item sin updated_at (categoría default) pierde contra cualquier marca remota', () => {
    const result = mergeById<{ id: string; updated_at?: string; label: string }>(
      { live: [{ id: 'cat', label: 'vieja' }], tombstones: {} },
      { live: [{ id: 'cat', label: 'nueva', updated_at: T1 }], tombstones: {} },
    );
    expect(result.live).toEqual([{ id: 'cat', label: 'nueva', updated_at: T1 }]);
  });

  it('item vivo sin updated_at y sin contraparte remota sobrevive', () => {
    // Antes caía en el early-continue de "ningún lado tiene marca" y
    // desaparecía del resultado: ni vivo ni en tombstones.
    const result = mergeById<{ id: string; updated_at?: string; label: string }>(
      { live: [{ id: 'cat', label: 'solo-local' }], tombstones: {} },
      { live: [], tombstones: {} },
    );
    expect(result.live).toEqual([{ id: 'cat', label: 'solo-local' }]);
    expect(result.tombstones).toEqual({});
  });

  it('item remoto sin updated_at y sin contraparte local sobrevive', () => {
    const result = mergeById<{ id: string; updated_at?: string; label: string }>(
      { live: [], tombstones: {} },
      { live: [{ id: 'cat', label: 'solo-remoto' }], tombstones: {} },
    );
    expect(result.live).toEqual([{ id: 'cat', label: 'solo-remoto' }]);
  });
});

describe('mergeBudgets', () => {
  it('adopta mes remoto inexistente localmente', () => {
    const { budgets } = mergeBudgets(
      { '2026-07': 5000 },
      { '2026-07': T1 },
      [{ month: '2026-07', amount: 5000, updated_at: T1 }, { month: '2026-08', amount: 8000, updated_at: T2 }],
    );
    expect(budgets).toEqual({ '2026-07': 5000, '2026-08': 8000 });
  });

  it('gana el updated_at más nuevo por mes', () => {
    const { budgets } = mergeBudgets(
      { '2026-07': 9000 },
      { '2026-07': T3 },
      [{ month: '2026-07', amount: 5000, updated_at: T1 }],
    );
    expect(budgets['2026-07']).toBe(9000);
  });

  it('sin updatedAt local → gana el remoto', () => {
    const { budgets } = mergeBudgets(
      { '2026-07': 9000 },
      {},
      [{ month: '2026-07', amount: 5000, updated_at: T1 }],
    );
    expect(budgets['2026-07']).toBe(5000);
  });

  it('empate de marcas → gana el mayor monto', () => {
    const { budgets } = mergeBudgets(
      { '2026-07': 3000 },
      { '2026-07': T1 },
      [{ month: '2026-07', amount: 7000, updated_at: T1 }],
    );
    expect(budgets['2026-07']).toBe(7000);
  });
});
