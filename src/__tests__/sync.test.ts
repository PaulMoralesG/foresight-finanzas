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

import { syncService, isSchemaError, isTransientSchemaError, desfaseDeRelojMinutos, igualEstructural } from '@/lib/sync';
import { useFinanceStore } from '@/stores/financeStore';

const mockFrom = (mocks.supabase as { from: ReturnType<typeof vi.fn> }).from;

/**
 * Builder por tabla: select→eq expone tanto `.maybeSingle()` (lookups de
 * fila única, ej. profiles) como `.order().order().range()` (el pull
 * paginado de fetchAllRows para las 5 tablas de entidades). `.range()`
 * siempre resuelve la página completa configurada — los datos de test usan
 * < PAGE_SIZE filas, así que una sola página cubre el caso.
 */
function makeBuilder(resultByTable: Record<string, unknown[]> = {}) {
  return (table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => {
        const chain = {
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          range: vi.fn(() => Promise.resolve({ data: resultByTable[table] ?? [], error: null })),
        };
        return chain;
      }),
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
    // Un solo ciclo: pull de las 10 tablas (expenses, categories, savings_goals, budgets, accounts, debts, settings, assets, networth, budget_lines)
    expect(mockFrom.mock.calls.length).toBe(before + 10);
    void p1;
    void p2;
  });

  it('flush cancela el timer pendiente y sincroniza de inmediato', async () => {
    await syncService.attach('user-1');
    const before = mockFrom.mock.calls.length;

    const p = syncService.schedule();
    const result = await syncService.flush(); // sin avanzar timers

    expect(result).toBe(true);
    expect(mockFrom.mock.calls.length).toBe(before + 10);
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

  // C-2 de la auditoría: PostgREST corta cualquier select sin `range` en
  // 1000 filas. Sin paginar, una cuenta con más de 1000 movimientos perdía
  // el resto del historial en silencio, sin error visible. Este test
  // verifica que fetchAllRows/pullAll efectivamente encadenan páginas.
  it('pagina pullAll cuando una tabla supera PAGE_SIZE (1000 filas)', async () => {
    const makeRow = (id: string) => ({
      id,
      user_id: 'user-1',
      type: 'expense',
      amount: 1,
      concept: `Gasto ${id}`,
      date: '2026-07-15',
      category: 'food',
      method: 'cash',
      business_type: 'personal',
      created_at: null,
      updated_at: '2026-08-01T00:00:00.000Z',
      deleted_at: null,
    });
    const page1 = Array.from({ length: 1000 }, (_, i) => makeRow(`e-${i}`));
    const page2 = [makeRow('e-1000')];
    const rangeCalls: Array<[number, number]> = [];

    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            gte: vi.fn(() => chain),
            order: vi.fn(() => chain),
            range: vi.fn((from: number, to: number) => {
              if (table !== 'expenses') return Promise.resolve({ data: [], error: null });
              rangeCalls.push([from, to]);
              return Promise.resolve({ data: from === 0 ? page1 : page2, error: null });
            }),
          };
          return chain;
        }),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));

    await syncService.attach('user-1');

    // Dos páginas: [0,999] (llena, 1000 filas → sigue) y [1000,1999] (1 fila → corta)
    expect(rangeCalls).toEqual([[0, 999], [1000, 1999]]);
    expect(useFinanceStore.getState().expenses).toHaveLength(1001);
  }, 15000);

  it('completa la limpieza pendiente si la data ya está en las tablas (flag false)', async () => {
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const rows = table === 'expenses'
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
            : [];
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({
              data: table === 'profiles' ? { legacy_imported: false } : null,
              error: null,
            })),
            gte: vi.fn(() => chain),
            order: vi.fn(() => chain),
            range: vi.fn(() => Promise.resolve({ data: rows, error: null })),
          };
          return chain;
        }),
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
        eq: vi.fn(() => {
          const rows = table === 'expenses'
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
            : [];
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            gte: vi.fn(() => chain),
            order: vi.fn(() => chain),
            range: vi.fn(() => Promise.resolve({ data: rows, error: null })),
          };
          return chain;
        }),
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

    // Una edición local nueva: sin ella el push encolado no tendría nada que
    // enviar (desde DAT-01 solo se suben las filas posteriores a la marca de
    // agua) y no llegaría a llamar a upsert. Lo que se comprueba aquí es el
    // single-flight, así que hay que darle carga real que empujar.
    useFinanceStore.getState().addTransaction({
      type: 'expense',
      amount: 42,
      concept: 'Editado durante el push',
      date: '2026-08-19',
      category: 'food',
      method: 'cash',
      businessType: 'personal',
    });

    const flushP = syncService.flush(); // debe encolarse, no duplicar
    release();

    await attachP;
    await flushP;
    await tick(30); // procesar el push encolado (single-flight)
    await vi.advanceTimersByTimeAsync(100);

    // 2 upserts de expenses en total: el original + el encolado (no más)
    expect(upsertCalls.length).toBe(2);
  });

  it('el push incremental omite las filas ya sincronizadas', async () => {
    const upsertCalls: { table: string; rows: unknown[] }[] = [];

    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({
              data: table === 'profiles' ? { legacy_imported: true } : null,
              error: null,
            })),
            gte: vi.fn(() => chain),
            order: vi.fn(() => chain),
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
          return chain;
        }),
      })),
      upsert: vi.fn((rows: unknown[]) => {
        upsertCalls.push({ table, rows: rows as unknown[] });
        return Promise.resolve({ error: null });
      }),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));

    // Un movimiento existente antes de conectar
    useFinanceStore.getState().addTransaction({
      type: 'expense',
      amount: 10,
      concept: 'Antiguo',
      date: '2026-08-01',
      category: 'food',
      method: 'cash',
      businessType: 'personal',
    });

    // Separar el reloj: la marca de agua se toma al inicio del push y la
    // comparación es `>=`, así que sin avanzar el tiempo la fila quedaría
    // justo en el límite y se reenviaría.
    await vi.advanceTimersByTimeAsync(10);

    // attach hace push COMPLETO: el movimiento viaja
    await syncService.attach('user-1');
    await vi.advanceTimersByTimeAsync(100);
    const firstPush = upsertCalls.filter((c) => c.table === 'expenses');
    expect(firstPush.length).toBe(1);
    expect(firstPush[0].rows.length).toBe(1);

    // Segundo ciclo sin cambios: nada que subir, así que no se llama a upsert
    await vi.advanceTimersByTimeAsync(10);
    upsertCalls.length = 0;
    await syncService.flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(upsertCalls.filter((c) => c.table === 'expenses')).toHaveLength(0);

    // Tras una edición nueva, vuelve a viajar solo esa fila
    useFinanceStore.getState().addTransaction({
      type: 'income',
      amount: 99,
      concept: 'Nuevo',
      date: '2026-08-19',
      category: 'salary',
      method: 'transfer',
      businessType: 'personal',
    });
    upsertCalls.length = 0;
    await syncService.flush();
    await vi.advanceTimersByTimeAsync(100);
    const thirdPush = upsertCalls.filter((c) => c.table === 'expenses');
    expect(thirdPush.length).toBe(1);
    expect(thirdPush[0].rows.length).toBe(1); // solo la nueva, no las dos
  });

  // Auditoría 2026-09: signOut() hace `await flush()` y luego borra el estado
  // local. flush devolvía la promesa del ciclo EN CURSO, no la del encolado
  // por una edición llegada a mitad de ciclo: esa edición se perdía.
  it('flush no resuelve hasta que el ciclo encolado por una edición en vuelo también terminó', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const upsertCalls: { table: string; rows: unknown[] }[] = [];

    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            gte: vi.fn(() => chain),
            order: vi.fn(() => chain),
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
          return chain;
        }),
      })),
      upsert: vi.fn((rows: unknown[]) => {
        upsertCalls.push({ table, rows: rows as unknown[] });
        return gate.then(() => ({ error: null }));
      }),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));

    useFinanceStore.getState().addTransaction({
      type: 'expense', amount: 1, concept: 'Antes', date: '2026-08-01', category: 'food', method: 'cash', businessType: 'personal',
    });
    await vi.advanceTimersByTimeAsync(10);

    const attachP = syncService.attach('user-1');
    await tick(30);
    expect(upsertCalls.filter((c) => c.table === 'expenses')).toHaveLength(1); // en vuelo, colgado en el gate

    useFinanceStore.getState().addTransaction({
      type: 'expense', amount: 42, concept: 'Editado durante el push', date: '2026-08-19', category: 'food', method: 'cash', businessType: 'personal',
    });

    const flushP = syncService.flush();
    release();
    await attachP;
    await flushP;

    // Sin ticks ni timers extra: al resolverse flush, la segunda edición ya viajó.
    const expensesPushes = upsertCalls.filter((c) => c.table === 'expenses');
    expect(expensesPushes).toHaveLength(2);
    expect(expensesPushes[1].rows).toEqual([expect.objectContaining({ concept: 'Editado durante el push' })]);

    // Y no queda nada pendiente que un reset() pudiera pisar.
    upsertCalls.length = 0;
    await vi.advanceTimersByTimeAsync(5000);
    expect(upsertCalls.filter((c) => c.table === 'expenses')).toHaveLength(0);
  });

  it('el pull es incremental (updated_at >= marca − 5 min) salvo en attach, al volver a la pestaña y al reconectar', async () => {
    const gteCalls: { table: string; col: string; value: string }[] = [];
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({
              data: table === 'profiles' ? { legacy_imported: true } : null,
              error: null,
            })),
            gte: vi.fn((col: string, value: string) => {
              gteCalls.push({ table, col, value });
              return chain;
            }),
            order: vi.fn(() => chain),
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
          return chain;
        }),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));

    const inicio = Date.now();
    await syncService.attach('user-1'); // completo
    expect(gteCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(10);
    await syncService.flush(); // incremental: 10 tablas filtradas
    expect(gteCalls).toHaveLength(10);
    expect(new Set(gteCalls.map((c) => c.table)).size).toBe(10);
    expect(gteCalls.every((c) => c.col === 'updated_at')).toBe(true);
    expect(gteCalls[0].value).toBe(new Date(inicio - 5 * 60_000).toISOString());

    gteCalls.length = 0;
    await syncService.flush(true); // completo explícito
    expect(gteCalls).toHaveLength(0);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    expect(gteCalls).toHaveLength(0); // volver a la pestaña → completo

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(100);
    expect(gteCalls).toHaveLength(0); // reconectar → completo

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    expect(gteCalls.length).toBeGreaterThan(0); // ocultar → incremental, como siempre
  });

  it('upsert de categories usa onConflict compuesto user_id,id', async () => {
    const upsertSpy = vi.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            gte: vi.fn(() => chain),
            order: vi.fn(() => chain),
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
          return chain;
        }),
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
  it('reconoce los códigos de esquema PERMANENTE (SQL de migración no ejecutado)', () => {
    expect(isSchemaError({ code: '42P01' })).toBe(true);
    expect(isSchemaError({ code: '42703' })).toBe(true);
    expect(isSchemaError({ code: '23505' })).toBe(false);
    expect(isSchemaError(new Error('red caída'))).toBe(false);
  });

  // PGRST205 (caché de esquema de PostgREST) es TRANSITORIO — un redeploy o
  // DDL reciente lo dispara y se resuelve solo. Antes isSchemaError() lo
  // trataba igual que un esquema sin migrar y desactivaba el sync para
  // siempre (bug C-4 de la auditoría); ahora tiene su propio chequeo.
  it('NO trata PGRST205 como esquema faltante permanente', () => {
    expect(isSchemaError({ code: 'PGRST205' })).toBe(false);
  });
});

describe('isTransientSchemaError', () => {
  it('reconoce PGRST205 como transitorio y todo lo demás como no-transitorio', () => {
    expect(isTransientSchemaError({ code: 'PGRST205' })).toBe(true);
    expect(isTransientSchemaError({ code: '42P01' })).toBe(false);
    expect(isTransientSchemaError({ code: '23505' })).toBe(false);
    expect(isTransientSchemaError(new Error('red caída'))).toBe(false);
  });
});

// ─── Detección de desfase de reloj ──────────────────────────────

describe('desfaseDeRelojMinutos', () => {
  const ahora = Date.parse('2026-08-30T12:00:00.000Z');
  const vacio = { expenses: [], categories: [], goals: [], budgets: [], accounts: [], debts: [], settings: [], assets: [], networth: [], budgetLines: [] };
  const fila = (updated_at: string) => ({ updated_at }) as never;

  it('no avisa cuando los datos del servidor son del pasado', () => {
    const snap = { ...vacio, expenses: [fila('2026-08-30T11:59:00.000Z')] };
    expect(desfaseDeRelojMinutos(snap, ahora)).toBe(0);
  });

  it('tolera unos minutos de diferencia sin dar la alarma', () => {
    // Latencia y relojes ligeramente distintos son normales
    const snap = { ...vacio, expenses: [fila('2026-08-30T12:03:00.000Z')] };
    expect(desfaseDeRelojMinutos(snap, ahora)).toBe(0);
  });

  it('detecta un reloj local claramente atrasado', () => {
    // El servidor tiene filas de "dentro de media hora": este reloj va detrás,
    // así que sus ediciones nacerían con marca vieja y keep_newest las tiraría
    const snap = { ...vacio, expenses: [fila('2026-08-30T12:30:00.000Z')] };
    expect(desfaseDeRelojMinutos(snap, ahora)).toBe(30);
  });

  it('mira todas las tablas, no solo los gastos', () => {
    const snap = { ...vacio, budgets: [fila('2026-08-30T13:00:00.000Z')] };
    expect(desfaseDeRelojMinutos(snap, ahora)).toBe(60);
  });

  it('se queda con la marca más nueva de todas', () => {
    const snap = {
      ...vacio,
      expenses: [fila('2026-08-30T12:10:00.000Z'), fila('2026-08-30T12:45:00.000Z')],
      goals: [fila('2026-08-30T12:20:00.000Z')],
    };
    expect(desfaseDeRelojMinutos(snap, ahora)).toBe(45);
  });

  it('ignora marcas ausentes o ilegibles', () => {
    const snap = {
      ...vacio,
      categories: [fila(''), { updated_at: null } as never, fila('no es una fecha')],
    };
    expect(desfaseDeRelojMinutos(snap, ahora)).toBe(0);
  });
});

describe('igualEstructural', () => {
  it('compara por contenido y corta en la misma referencia', () => {
    const item = { id: 'a', plan: { '2026-01': 1 } };
    expect(igualEstructural({ x: [item] }, { x: [item] })).toBe(true);
    expect(igualEstructural({ x: [item] }, { x: [{ id: 'a', plan: { '2026-01': 1 } }] })).toBe(true);
    expect(igualEstructural({ x: [item] }, { x: [{ id: 'a', plan: { '2026-01': 2 } }] })).toBe(false);
    expect(igualEstructural({ x: [item] }, { x: [item, item] })).toBe(false);
    expect(igualEstructural({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(igualEstructural([], {})).toBe(false);
    expect(igualEstructural(null, {})).toBe(false);
  });
});
