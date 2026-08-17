// ================================================================
// TESTS — src/lib/sync.ts (servicio singleton de sincronización)
// Mock de @/config/supabase + fake timers.
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

import { syncService, isSchemaError } from '@/lib/sync';
import { useFinanceStore } from '@/stores/financeStore';

const mockFrom = (mocks.supabase as { from: ReturnType<typeof vi.fn> }).from;

/** Builder por tabla: select→eq devuelve las filas configuradas. */
function makeBuilder(resultByTable: Record<string, unknown[]> = {}) {
  return (table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        data: resultByTable[table] ?? [],
        error: null,
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
    update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.supabase = { from: mockFrom };
  mockFrom.mockClear();
  mockFrom.mockImplementation(makeBuilder());
  syncService.init(); // guard de módulo: registra una sola vez
  useFinanceStore.getState().reset();
});

/** Avanza n turnos de microtasks (para cadenas de promises mockeadas). */
async function tick(n = 1) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

afterEach(() => {
  syncService.detach();
  vi.useRealTimers();
});

describe('syncService', () => {
  it('schedule debouncea: una sola sincronización tras ráfaga de llamadas', async () => {
    await syncService.attach('user-1');
    const before = mockFrom.mock.calls.length;

    const p1 = syncService.schedule();
    const p2 = syncService.schedule();
    const p3 = syncService.schedule();

    await vi.advanceTimersByTimeAsync(799);
    expect(mockFrom.mock.calls.length).toBe(before); // aún no sincroniza

    await vi.advanceTimersByTimeAsync(1);
    const result = await p3; // solo el último schedule dispara el push
    expect(result).toBe(true);
    // Un solo ciclo: pull de las 5 tablas
    expect(mockFrom.mock.calls.length).toBe(before + 5);
    void p1;
    void p2;
  });

  it('flush cancela el timer pendiente y sincroniza de inmediato', async () => {
    await syncService.attach('user-1');
    const before = mockFrom.mock.calls.length;

    const p = syncService.schedule();
    const result = await syncService.flush(); // sin avanzar timers

    expect(result).toBe(true);
    expect(mockFrom.mock.calls.length).toBe(before + 5);
    void p;
  });

  it('no-op en modo offline (sin supabase configurado)', async () => {
    mocks.supabase = null;
    await syncService.attach('user-1'); // setea userId pero no sincroniza
    const result = await syncService.schedule();
    expect(result).toBe(true);
    expect(await syncService.flush()).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('cancel evita el push pendiente; sin usuario schedule es no-op', async () => {
    await syncService.attach('user-1');
    const before = mockFrom.mock.calls.length;

    const p = syncService.schedule();
    syncService.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFrom.mock.calls.length).toBe(before); // nada nuevo

    syncService.detach();
    const r = await syncService.schedule();
    expect(r).toBe(true);
    expect(mockFrom.mock.calls.length).toBe(before);
    void p;
  });

  it('cambios de datos disparan auto-save (suscripción al store)', async () => {
    await syncService.attach('user-1');
    const before = mockFrom.mock.calls.length;

    useFinanceStore.getState().addTransaction({
      type: 'expense',
      amount: 100,
      concept: 'X',
      date: '2026-07-15',
      category: 'food',
      method: 'cash',
      businessType: 'personal',
    });

    await vi.advanceTimersByTimeAsync(800);
    expect(mockFrom.mock.calls.length).toBeGreaterThan(before);
  });

  it('sin usuario, los cambios de datos no disparan sincronización', async () => {
    syncService.detach();
    useFinanceStore.getState().addTransaction({
      type: 'expense',
      amount: 100,
      concept: 'X',
      date: '2026-07-15',
      category: 'food',
      method: 'cash',
      businessType: 'personal',
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('no genera loops infinitos en estado estable', async () => {
    await syncService.attach('user-1');
    // Posible follow-up pendiente → dejarlo converger
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(800);
    const stable = mockFrom.mock.calls.length;

    await vi.advanceTimersByTimeAsync(8000);
    expect(mockFrom.mock.calls.length).toBe(stable);
  });

  it('adopta filas remotas en el store local (pull → merge → setState)', async () => {
    mockFrom.mockImplementation(makeBuilder({
      expenses: [{
        id: 'e1',
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
      }],
    }));

    await syncService.attach('user-1');
    const expenses = useFinanceStore.getState().expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0].id).toBe('e1');
    expect(expenses[0].concept).toBe('Remoto');
  });

  it('completa la limpieza pendiente si la data ya está en las tablas (flag false)', async () => {
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: table === 'expenses'
            ? [{
                id: 'e1',
                user_id: 'user-1',
                type: 'expense',
                amount: 10,
                concept: 'Ya importado',
                date: '2026-07-15',
                category: 'food',
                method: 'cash',
                business_type: 'personal',
                created_at: null,
                updated_at: '2026-08-01T00:00:00.000Z',
                deleted_at: null,
              }]
            : [],
          error: null,
          maybeSingle: vi.fn(() => Promise.resolve({
            data: table === 'profiles' ? { legacy_imported: false } : null,
            error: null,
          })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      update,
    }));

    await syncService.attach('user-1');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      legacy_imported: true,
    }));
  });

  it('single-flight: flush durante un push en vuelo no duplica el push', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const upsertCalls: unknown[][] = [];

    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: table === 'expenses'
            ? [{
                id: 'e1',
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
              }]
            : [],
          error: null,
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      upsert: vi.fn((rows: unknown[]) => {
        upsertCalls.push(rows as unknown[]);
        return gate.then(() => ({ error: null }));
      }),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));

    const attachP = syncService.attach('user-1');
    // Dejar que el attach avance hasta el upsert colgado en el gate
    await tick(30);
    expect(upsertCalls.length).toBe(1); // push en vuelo

    const flushP = syncService.flush(); // debe encolarse, no duplicar
    release();

    await attachP;
    await flushP;
    await tick(30); // procesar el push encolado (single-flight)
    await vi.advanceTimersByTimeAsync(100);

    // 2 upserts de expenses en total: el original + el encolado (no más)
    expect(upsertCalls.length).toBe(2);
  });

  it('upsert de categories usa onConflict compuesto user_id,id', async () => {
    const upsertSpy = vi.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: [],
          error: null,
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      upsert: upsertSpy,
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));

    useFinanceStore.getState().addCustomCategory('expense', {
      id: 'custom_test',
      label: 'Test',
      icon: '📌',
      color: 'bg-slate-100 text-slate-600',
    });

    await syncService.attach('user-1');
    await syncService.flush();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ onConflict: 'user_id,id' }),
    );
  });
});

describe('isSchemaError', () => {
  it('reconoce los códigos de esquema faltante', () => {
    expect(isSchemaError({ code: '42P01' })).toBe(true);
    expect(isSchemaError({ code: '42703' })).toBe(true);
    expect(isSchemaError({ code: 'PGRST205' })).toBe(true);
    expect(isSchemaError({ code: '23505' })).toBe(false);
    expect(isSchemaError(new Error('red caída'))).toBe(false);
  });
});
