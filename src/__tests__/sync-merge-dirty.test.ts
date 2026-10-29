// ================================================================
// TESTS — el setState del propio merge no agenda un ciclo extra
// (auditoría oct-2026)
//
// applyMerge escribe en el store mientras `isSyncing` es true, y la
// suscripción lo tomaba por una edición del usuario: marcaba
// dirtyDuringSync y, al terminar, agendaba OTRO ciclo (pull de 11 tablas)
// tras cada sync que trajera algo del servidor. Lo que el merge escribe ya lo
// sube el pushAll del mismo ciclo. Una edición REAL durante el ciclo sí debe
// seguir marcando dirty.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() } as unknown,
}));

vi.mock('@/config/supabase', () => ({
  get supabase() {
    return mocks.supabase;
  },
  supabaseAvailable: true,
}));

import { syncService } from '@/lib/sync';
import { useFinanceStore } from '@/stores/financeStore';

const mockFrom = (mocks.supabase as { from: ReturnType<typeof vi.fn> }).from;

type Fila = Record<string, unknown>;

/** Builder como el de sync.test.ts; `rangoDe` permite retener el pull de una tabla. */
function makeBuilder(resultByTable: Record<string, Fila[]>, rangoDe?: (table: string) => Promise<unknown> | null) {
  return (table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => {
        const chain = {
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          range: vi.fn(() => rangoDe?.(table) ?? Promise.resolve({ data: resultByTable[table] ?? [], error: null })),
        };
        return chain;
      }),
    })),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
    update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
  });
}

const filaRemota: Fila = {
  id: 'e-remoto',
  user_id: 'user-1',
  type: 'expense',
  amount: 10,
  concept: 'Remoto',
  date: '2026-07-15',
  category: 'food',
  method: 'cash',
  business_type: 'personal',
  created_at: null,
  updated_at: '2026-08-01T00:00:00.000Z',
  deleted_at: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.supabase = { from: mockFrom };
  mockFrom.mockClear();
  syncService.init();
  useFinanceStore.getState().reset();
});

afterEach(() => {
  syncService.detach();
  vi.useRealTimers();
});

describe('sync · escritura del merge vs. edición durante el ciclo', () => {
  it('adoptar filas remotas no agenda un ciclo extra', async () => {
    mockFrom.mockImplementation(makeBuilder({ expenses: [filaRemota] }));

    await syncService.attach('user-1');
    expect(useFinanceStore.getState().expenses.map((e) => e.id)).toEqual(['e-remoto']);
    const tras = mockFrom.mock.calls.length;

    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFrom.mock.calls.length).toBe(tras);
    expect(syncService.hayCambiosSinSubir()).toBe(false);
  });

  it('una edición del usuario DURANTE el ciclo sí agenda otro y se sube', async () => {
    let soltar: (() => void) | null = null;
    const retenido = new Promise<unknown>((resolve) => {
      soltar = () => resolve({ data: [filaRemota], error: null });
    });
    let primera = true;
    const upserts: Array<{ table: string; rows: Fila[] }> = [];
    const base = makeBuilder({}, (table) => {
      if (table === 'expenses' && primera) {
        primera = false;
        return retenido;
      }
      return null;
    });
    mockFrom.mockImplementation((table: string) => ({
      ...base(table),
      upsert: vi.fn((rows: Fila[]) => {
        upserts.push({ table, rows });
        return Promise.resolve({ error: null });
      }),
    }));

    const attachP = syncService.attach('user-1');
    await vi.advanceTimersByTimeAsync(0);

    // El pull de expenses sigue en vuelo: el usuario registra un gasto.
    const id = useFinanceStore.getState().addTransaction({
      type: 'expense', amount: 5, concept: 'Durante', date: '2026-09-01',
      category: 'comida', method: 'cash', businessType: 'personal',
    });
    soltar!();
    await attachP;

    // El gasto sigue en el store tras el merge…
    expect(useFinanceStore.getState().expenses.map((e) => e.id).sort()).toEqual([id, 'e-remoto'].sort());
    // …y queda marcado como pendiente: hace falta otro ciclo.
    expect(syncService.hayCambiosSinSubir()).toBe(true);

    const tras = mockFrom.mock.calls.length;
    await vi.advanceTimersByTimeAsync(800);
    expect(mockFrom.mock.calls.length).toBeGreaterThan(tras);
    expect(upserts.some((u) => u.table === 'expenses' && u.rows.some((r) => r.id === id))).toBe(true);
    expect(syncService.hayCambiosSinSubir()).toBe(false);
  });
});
