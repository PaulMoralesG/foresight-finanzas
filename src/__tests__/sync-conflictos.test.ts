// ================================================================
// TESTS — src/lib/sync.ts: caminos de conflicto y de fallo
//
// sync.test.ts cubre el ciclo feliz (debounce, single-flight, paginado,
// push incremental). Aquí va lo que decide qué dato gana cuando dos
// dispositivos chocan, y qué pasa cuando Supabase falla: tombstones que
// no deben resucitar, empates de updated_at, marca de agua desfasada,
// reintentos con backoff, esquema sin migrar, import legacy, reloj
// atrasado y los listeners de ciclo de vida.
// ================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() } as unknown,
  reportarError: vi.fn(),
}));

vi.mock('@/config/supabase', () => ({
  get supabase() {
    return mocks.supabase;
  },
  supabaseAvailable: true,
}));

vi.mock('@/lib/error-reporter', () => ({
  reportarError: mocks.reportarError,
  initErrorReporter: vi.fn(),
}));

import { syncService } from '@/lib/sync';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Transaction } from '@/types';

const mockFrom = (mocks.supabase as { from: ReturnType<typeof vi.fn> }).from;

type Fila = Record<string, unknown>;
interface Escenario {
  /** Filas por tabla que devuelve el pull. */
  filas?: Record<string, Fila[]>;
  /** Perfil que devuelve `profiles.select().eq().maybeSingle()`. */
  perfil?: Fila | null;
  /** Error que devuelve el pull de esa tabla (una vez por llamada, por orden). */
  erroresPull?: Record<string, ({ code?: string; message?: string } | null)[]>;
  /** Error al leer profiles. */
  errorPerfil?: { code?: string; message?: string } | null;
  /** Error al hacer update en profiles. */
  errorUpdatePerfil?: { message: string } | null;
}

/** Builder de tabla que además registra cada upsert. */
function armar(esc: Escenario = {}) {
  const upserts: { table: string; rows: Fila[]; opts: Fila }[] = [];
  const contadorPull: Record<string, number> = {};
  const impl = (table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => {
        const chain = {
          maybeSingle: vi.fn(() =>
            Promise.resolve({ data: esc.perfil ?? null, error: esc.errorPerfil ?? null })
          ),
          order: vi.fn(() => chain),
          range: vi.fn(() => {
            const n = contadorPull[table] ?? 0;
            contadorPull[table] = n + 1;
            const error = esc.erroresPull?.[table]?.[n] ?? null;
            return Promise.resolve({ data: error ? null : esc.filas?.[table] ?? [], error });
          }),
        };
        return chain;
      }),
    })),
    upsert: vi.fn((rows: Fila[], opts: Fila) => {
      upserts.push({ table, rows, opts });
      return Promise.resolve({ error: null });
    }),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: esc.errorUpdatePerfil ?? null })),
    })),
  });
  mockFrom.mockImplementation(impl);
  return { upserts, contadorPull };
}

const filaGasto = (extra: Fila = {}): Fila => ({
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
  ...extra,
});

/** Mete un movimiento en el store con id y updated_at controlados. */
function gastoLocal(id: string, updated_at: string, extra: Partial<Transaction> = {}) {
  const tx: Transaction = {
    id,
    type: 'expense',
    amount: 5,
    concept: 'Local',
    date: '2026-07-10',
    category: 'food',
    method: 'cash',
    businessType: 'personal',
    updated_at,
    ...extra,
  };
  useFinanceStore.setState((s) => ({ expenses: [...s.expenses, tx] }));
  return tx;
}

const filasDe = (upserts: { table: string; rows: Fila[] }[], table: string) =>
  upserts.filter((u) => u.table === table).flatMap((u) => u.rows);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
  mocks.supabase = { from: mockFrom };
  mockFrom.mockClear();
  mocks.reportarError.mockClear();
  armar();
  syncService.init();
  useFinanceStore.getState().reset();
  useUiStore.getState().setSyncState('idle');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  syncService.detach();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tombstones ──

describe('tombstones: un borrado nunca resucita', () => {
  it('un borrado local offline gana a la fila viva más vieja del servidor y viaja como tombstone', async () => {
    const { upserts } = armar({ filas: { expenses: [filaGasto({ updated_at: '2026-08-01T00:00:00.000Z' })] } });
    gastoLocal('e1', '2026-08-01T00:00:00.000Z');
    useFinanceStore.getState().deleteTransaction('e1'); // tombstone con nowIso() = 2026-09-01

    await syncService.attach('user-1');

    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useFinanceStore.getState().tombstones.e1).toBeDefined();
    const subidas = filasDe(upserts, 'expenses');
    expect(subidas).toHaveLength(1);
    expect(subidas[0]).toMatchObject({ id: 'e1', deleted_at: expect.any(String) });
    expect(subidas[0].deleted_at).toBe(subidas[0].updated_at);
  });

  it('un tombstone remoto elimina la fila local más vieja y la marca localmente', async () => {
    armar({ filas: { expenses: [filaGasto({ deleted_at: '2026-08-20T00:00:00.000Z', updated_at: '2026-08-20T00:00:00.000Z' })] } });
    gastoLocal('e1', '2026-08-01T00:00:00.000Z');

    await syncService.attach('user-1');

    expect(useFinanceStore.getState().expenses).toHaveLength(0);
    expect(useFinanceStore.getState().tombstones.e1).toBe('2026-08-20T00:00:00.000Z');
  });

  it('una edición local posterior al borrado remoto resucita la fila (el más nuevo gana)', async () => {
    armar({ filas: { expenses: [filaGasto({ deleted_at: '2026-08-20T00:00:00.000Z', updated_at: '2026-08-20T00:00:00.000Z' })] } });
    gastoLocal('e1', '2026-08-25T00:00:00.000Z', { concept: 'Editado después' });

    await syncService.attach('user-1');

    const vivos = useFinanceStore.getState().expenses;
    expect(vivos).toHaveLength(1);
    expect(vivos[0].concept).toBe('Editado después');
    expect(useFinanceStore.getState().tombstones.e1).toBeUndefined();
  });

  it('poda los tombstones de más de 30 días solo si el servidor ya los confirmó', async () => {
    const viejo = '2026-06-01T00:00:00.000Z'; // hace 3 meses
    armar({
      filas: {
        expenses: [filaGasto({ id: 'confirmado', deleted_at: viejo, updated_at: viejo })],
      },
    });
    useFinanceStore.setState({
      tombstones: { confirmado: viejo, 'solo-local': viejo },
    });

    await syncService.attach('user-1');

    const t = useFinanceStore.getState().tombstones;
    expect(t.confirmado).toBeUndefined(); // el servidor lo tiene: se puede olvidar
    expect(t['solo-local']).toBe(viejo); // el servidor no lo sabe: se conserva
  });
});

// ── Empates y marca de agua ──

describe('empates y marca de agua', () => {
  it('con updated_at empatado no duplica ni pierde: queda una sola fila', async () => {
    const t = '2026-08-01T00:00:00.000Z';
    armar({ filas: { expenses: [filaGasto({ updated_at: t, concept: 'Remoto' })] } });
    gastoLocal('e1', t, { concept: 'Local' });

    await syncService.attach('user-1');

    const vivos = useFinanceStore.getState().expenses;
    expect(vivos).toHaveLength(1);
    expect(vivos[0].id).toBe('e1');
  });

  it('una marca de agua vieja en localStorage no deja fuera lo editado después de ella', async () => {
    // Sesión anterior dejó una marca de agua de hace un mes; un cambio
    // posterior (offline) tiene que subir aunque no hubiera push completo.
    localStorage.setItem('foresight-sync-watermark:user-1', '2026-08-01T00:00:00.000Z');
    const { upserts } = armar();
    gastoLocal('nuevo', '2026-08-15T00:00:00.000Z');
    gastoLocal('viejo', '2026-07-01T00:00:00.000Z');

    // attach fuerza push COMPLETO: las dos viajan, incluida la anterior a la marca
    await syncService.attach('user-1');
    expect(filasDe(upserts, 'expenses').map((r) => r.id).sort()).toEqual(['nuevo', 'viejo']);

    // El siguiente ciclo ya filtra contra la marca nueva (tomada al iniciar el
    // push anterior): sin cambios no sube nada.
    upserts.length = 0;
    await vi.advanceTimersByTimeAsync(10);
    await syncService.flush();
    expect(filasDe(upserts, 'expenses')).toHaveLength(0);
  });

  it('si localStorage falla (modo privado, cuota llena), el sync sigue funcionando sin marca', async () => {
    // test-setup sustituye localStorage por un objeto plano: se espía ese.
    // Solo falla la clave de la marca de agua: el persist de Zustand también
    // escribe aquí y no es lo que se está probando.
    const esMarca = (k: string) => k.startsWith('foresight-sync-watermark');
    const getItem = vi.spyOn(localStorage, 'getItem');
    const getReal = getItem.getMockImplementation();
    getItem.mockImplementation((k: string) => {
      if (esMarca(k)) throw new Error('SecurityError');
      return getReal ? getReal(k) : null;
    });
    const setItem = vi.spyOn(localStorage, 'setItem');
    const setReal = setItem.getMockImplementation();
    setItem.mockImplementation((k: string, v: string) => {
      if (esMarca(k)) throw new Error('QuotaExceededError');
      setReal?.(k, v);
    });
    const { upserts } = armar();
    gastoLocal('x', '2026-08-15T00:00:00.000Z');

    await syncService.attach('user-1');
    expect(useUiStore.getState().syncState).toBe('idle');

    // Sin marca persistida cada ciclo filtra contra la marca en memoria: el
    // segundo push no reenvía lo ya subido.
    upserts.length = 0;
    await vi.advanceTimersByTimeAsync(10);
    await syncService.flush();
    expect(filasDe(upserts, 'expenses')).toHaveLength(0);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

// ── Metas, categorías y presupuestos viajan en ambos sentidos ──

describe('entidades secundarias (fase 3)', () => {
  it('adopta entidades remotas (cuentas, deudas, activos, patrimonio, presupuestos, metas, categorías, ajustes)', async () => {
    armar({
      filas: {
        savings_goals: [
          { id: 'g1', user_id: 'user-1', concept: 'Viaje', target: 5000, tag: 'personal', target_date: '2026-12', saved: 100, saved_from_accounts: 50, updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null },
          { id: 'g-borrada', user_id: 'user-1', concept: null, target: null, updated_at: '2026-08-25T00:00:00.000Z', deleted_at: '2026-08-25T00:00:00.000Z' },
        ],
        categories: [
          { id: 'cat_gasto', user_id: 'user-1', kind: 'expense', label: 'Mascotas', icon: '🐶', color: 'bg-x', updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null },
          { id: 'cat_ingreso', user_id: 'user-1', kind: 'income', label: null, icon: null, color: null, updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null },
        ],
        budgets: [{ user_id: 'user-1', month: '2026-08', amount: 12000, updated_at: '2026-08-01T00:00:00.000Z' }],
        accounts: [{ id: 'a1', user_id: 'user-1', name: 'Banco', kind: 'Banco', initial_balance: 1000, updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null }],
        debts: [{ id: 'd1', user_id: 'user-1', name: 'Tarjeta', tag: 'personal', kind: 'Tarjeta de crédito', balance: 500, annual_rate: 0, min_payment: 0, pay_day: null, updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null }],
        assets: [{ id: 'as1', user_id: 'user-1', name: 'Moto', tag: 'personal', group: 'Otros activos', value: 2000, updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null }],
        networth: [
          { user_id: 'user-1', month: '2026-07', assets: 2000, liabilities: 500, net: 1500, updated_at: '2026-08-01T00:00:00.000Z' },
          { user_id: 'user-1', month: '2026-07', assets: 2500, liabilities: 400, net: 2100, updated_at: '2026-08-02T00:00:00.000Z' } // gana esta (empate de mes)
        ],
        budget_lines: [{ id: 'bl1', user_id: 'user-1', tag: 'personal', kind: 'expense', category_id: 'comida', limit: 300, plan: { '2026-08': 350 }, updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null }],
        settings: [{ user_id: 'user-1', debt_method: 'avalanche', extra_payment: 100, net_worth_goal: 50000, updated_at: '2026-08-01T00:00:00.000Z' }]
      },
    });

    await syncService.attach('user-1');

    const s = useFinanceStore.getState();
    expect(s.savingsGoals).toEqual([
      { id: 'g1', concept: 'Viaje', target: 5000, tag: 'personal', targetDate: '2026-12', saved: 100, savedFromAccounts: 50, updated_at: '2026-08-01T00:00:00.000Z' },
    ]);
    expect(s.customExpenseCategories[0]).toMatchObject({ id: 'cat_gasto', label: 'Mascotas', icon: '🐶' });
    expect(s.customIncomeCategories[0]).toMatchObject({ id: 'cat_ingreso', label: '', icon: '📌' });
    expect(s.budgets['2026-08']).toBe(12000);
    expect(s.tombstones['g-borrada']).toBe('2026-08-25T00:00:00.000Z');
    expect(s.accounts[0]).toMatchObject({ id: 'a1', name: 'Banco', kind: 'Banco', initialBalance: 1000 });
    expect(s.debts[0]).toMatchObject({ id: 'd1', name: 'Tarjeta', balance: 500 });
    expect(s.assets[0]).toMatchObject({ id: 'as1', name: 'Moto', value: 2000 });
    expect(s.networth).toEqual([{ month: '2026-07', assets: 2500, liabilities: 400, net: 2100, updated_at: '2026-08-02T00:00:00.000Z' }]);
    expect(s.budgetLines[0]).toMatchObject({ id: 'bl1', categoryId: 'comida', limit: 300, plan: { '2026-08': 350 } });
    expect(s.settings).toMatchObject({ debtMethod: 'avalanche', extraPayment: 100, netWorthGoal: 50000 });
  });

  it('sube entidades secundarias y sus tombstones', async () => {
    const { upserts } = armar({
      filas: {
        categories: [{ id: 'cat_fuera', user_id: 'user-1', kind: 'expense', label: 'Fuera', icon: '❌', color: 'bg-z', updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null }],
        accounts: [{ id: 'a_fuera', user_id: 'user-1', name: 'A', kind: 'Banco', initial_balance: 0, updated_at: '2026-08-01T00:00:00.000Z', deleted_at: null }],
      },
    });
    const s = useFinanceStore.getState();
    s.addSavingsGoal({ concept: 'Coche', target: 100 });
    s.addCustomCategory('income', { id: 'cat_extra', label: 'Extra', icon: '💸', color: 'bg-y' });
    s.addCustomCategory('expense', { id: 'cat_fuera', label: 'Fuera', icon: '❌', color: 'bg-z', updated_at: '2026-08-01T00:00:00.000Z' });
    s.deleteCustomCategory('expense', 'cat_fuera');
    s.setBudget('2026-09', 8000);
    s.addAccount({ name: 'Nuevo', kind: 'Banco', initialBalance: 100 });
    s.addAccount({ name: 'A', kind: 'Banco', initialBalance: 0 });
    s.deleteAccount('a_fuera');
    s.addDebt({ name: 'Tarjeta', kind: 'Tarjeta de crédito', tag: 'personal', balance: 500, annualRate: 0, minPayment: 0, payDay: null });
    s.addAsset({ name: 'Coche', tag: 'personal', group: 'Otros activos', value: 3000 });
    s.saveNetWorthSnapshot({ month: '2026-08', assets: 100, liabilities: 0, net: 100 });
    s.addBudgetLine({ tag: 'personal', kind: 'expense', categoryId: 'ropa', limit: 100, plan: {} });
    s.setSettings({ extraPayment: 200 });

    await syncService.attach('user-1');

    expect(filasDe(upserts, 'savings_goals')).toEqual([expect.objectContaining({ concept: 'Coche', target: 100, user_id: 'user-1', deleted_at: null })]);
    const cats = filasDe(upserts, 'categories');
    expect(cats).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cat_extra', kind: 'income', label: 'Extra' }),
      expect.objectContaining({ id: 'cat_fuera', deleted_at: expect.any(String) }),
    ]));
    expect(filasDe(upserts, 'accounts')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Nuevo', initial_balance: 100 }),
      expect.objectContaining({ id: 'a_fuera', deleted_at: expect.any(String) })
    ]));
    expect(filasDe(upserts, 'debts')).toEqual([expect.objectContaining({ name: 'Tarjeta', balance: 500 })]);
    expect(filasDe(upserts, 'assets')).toEqual([expect.objectContaining({ name: 'Coche', value: 3000 })]);
    expect(filasDe(upserts, 'networth')).toEqual([expect.objectContaining({ month: '2026-08', assets: 100, net: 100 })]);
    expect(filasDe(upserts, 'budget_lines')).toEqual([expect.objectContaining({ category_id: 'ropa', limit: 100 })]);
    expect(filasDe(upserts, 'settings')).toEqual([expect.objectContaining({ extra_payment: 200 })]);
    const presupuestos = upserts.filter((u) => u.table === 'budgets');
    expect(presupuestos[0].rows).toEqual([expect.objectContaining({ month: '2026-09', amount: 8000 })]);
  });
});

// ── Fallos de Supabase ──

describe('reintentos y errores de esquema', () => {
  const red = { code: 'ECONN', message: 'fetch failed' };

  it('reintenta con backoff exponencial y termina bien si el servidor se recupera', async () => {
    const { contadorPull } = armar({ erroresPull: { expenses: [red, red, null] } });

    const p = syncService.attach('user-1');
    // Reintento 1 tras 1000 ms, reintento 2 tras 2000 ms
    await vi.advanceTimersByTimeAsync(999);
    expect(contadorPull.expenses).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(contadorPull.expenses).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    await p;

    expect(contadorPull.expenses).toBe(3);
    expect(useUiStore.getState().syncState).toBe('idle');
    expect(mocks.reportarError).not.toHaveBeenCalled();
  });

  it('tras agotar los reintentos deja el estado en error y lo reporta', async () => {
    armar({ erroresPull: { expenses: [red, red, red, red] } });

    const p = syncService.attach('user-1');
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    await p;

    expect(useUiStore.getState().syncState).toBe('error');
    expect(mocks.reportarError).toHaveBeenCalledWith(red, { tag: 'reintentos-agotados' });
  });

  it('un error de esquema permanente en el pull desactiva el sync sin reintentar', async () => {
    const { contadorPull } = armar({ erroresPull: { expenses: [{ code: '42P01', message: 'relation does not exist' }] } });

    await syncService.attach('user-1');

    expect(contadorPull.expenses).toBe(1);
    expect(useUiStore.getState().syncState).toBe('local-only');
    // Desactivado: ni schedule ni flush vuelven a tocar Supabase
    mockFrom.mockClear();
    await syncService.flush();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('PGRST205 (caché de esquema) es transitorio: se reintenta y NO desactiva el sync', async () => {
    const { contadorPull } = armar({ erroresPull: { expenses: [{ code: 'PGRST205' }, null] } });

    const p = syncService.attach('user-1');
    await vi.advanceTimersByTimeAsync(1000);
    await p;

    expect(contadorPull.expenses).toBe(2);
    expect(useUiStore.getState().syncState).toBe('idle');
  });

  it('esquema sin migrar al leer profiles: local-only y reporte etiquetado', async () => {
    armar({ errorPerfil: { code: '42703', message: 'column does not exist' } });

    await syncService.attach('user-1');

    expect(useUiStore.getState().syncState).toBe('local-only');
    expect(mocks.reportarError).toHaveBeenCalledWith(
      expect.objectContaining({ code: '42703' }),
      { tag: 'esquema-no-migrado' },
    );
  });

  it('PGRST205 al leer profiles: estado error, sin desactivar', async () => {
    armar({ errorPerfil: { code: 'PGRST205' } });
    await syncService.attach('user-1');
    expect(useUiStore.getState().syncState).toBe('error');
    expect(mocks.reportarError).not.toHaveBeenCalled();

    // Sigue vivo: el próximo flush vuelve a intentarlo
    armar();
    await syncService.flush();
    expect(useUiStore.getState().syncState).toBe('idle');
  });

  it('cualquier otro fallo al adjuntar: estado error y reporte attach-fallo', async () => {
    armar({ errorPerfil: { code: 'ECONN', message: 'fetch failed' } });
    await syncService.attach('user-1');
    expect(useUiStore.getState().syncState).toBe('error');
    expect(mocks.reportarError).toHaveBeenCalledWith(expect.anything(), { tag: 'attach-fallo' });
  });

  it('disable() corta el sync y lo deja en local-only; detach lo restablece para la sesión siguiente', async () => {
    await syncService.attach('user-1');
    syncService.disable();
    expect(useUiStore.getState().syncState).toBe('local-only');
    mockFrom.mockClear();
    await syncService.flush();
    expect(mockFrom).not.toHaveBeenCalled();

    syncService.detach();
    expect(useUiStore.getState().syncState).toBe('idle');
    await syncService.attach('user-2');
    expect(mockFrom).toHaveBeenCalled();
  });
});

// ── Import legacy ──

describe('import legacy', () => {
  it('convierte los blobs del perfil en filas, las sube con ignoreDuplicates y marca el flag', async () => {
    const { upserts } = armar({
      perfil: {
        id: 'user-1',
        legacy_imported: false,
        expenses: JSON.stringify([
          { id: 'old-1', type: 'expense', amount: '12.5', concept: 'Café', date: '2026-01-05', category: 'food', method: 'cash', businessType: 'personal' },
        ]),
        budgets: JSON.stringify({ '2026-01': 3000 }),
        savings_goal: JSON.stringify([{ id: 'g-old', concept: 'Fondo', target: 1000 }]),
        custom_expense_categories: JSON.stringify([{ id: 'cat_old', label: 'Vieja', icon: '📦', color: 'bg-x' }]),
        custom_income_categories: JSON.stringify([{ id: 'cat_ing', label: 'Bonos', icon: '🎁', color: 'bg-y' }]),
        last_synced_at: '2026-02-01T00:00:00.000Z',
      },
    });

    await syncService.attach('user-1');

    const conIgnore = upserts.filter((u) => u.opts.ignoreDuplicates === true);
    expect(conIgnore.map((u) => u.table).sort()).toEqual(['budgets', 'categories', 'expenses', 'savings_goals']);
    expect(filasDe(conIgnore, 'expenses')[0]).toMatchObject({ concept: 'Café', amount: 12.5 });
    expect(filasDe(conIgnore, 'budgets')[0]).toMatchObject({ month: '2026-01', amount: 3000 });
    expect(filasDe(conIgnore, 'categories').map((c) => c.kind).sort()).toEqual(['expense', 'income']);
    expect(filasDe(conIgnore, 'savings_goals')[0]).toMatchObject({ concept: 'Fondo', target: 1000 });

    // Al final marca legacy_imported = true en profiles
    const update = mockFrom.mock.results
      .map((r) => r.value as { update: ReturnType<typeof vi.fn> })
      .find((b) => b.update.mock.calls.length > 0);
    expect(update?.update).toHaveBeenCalledWith({ legacy_imported: true });
  });

  it('si el flag quedó pendiente pero no hay blobs, solo marca el flag', async () => {
    const { upserts } = armar({ perfil: { id: 'user-1', legacy_imported: false } });
    await syncService.attach('user-1');
    expect(upserts.filter((u) => u.opts.ignoreDuplicates === true)).toHaveLength(0);
    const update = mockFrom.mock.results
      .map((r) => r.value as { update: ReturnType<typeof vi.fn> })
      .find((b) => b.update.mock.calls.length > 0);
    expect(update?.update).toHaveBeenCalledWith({ legacy_imported: true });
  });

  it('si marcar el flag falla, avisa pero el sync continúa', async () => {
    armar({ perfil: { id: 'user-1', legacy_imported: false }, errorUpdatePerfil: { message: 'boom' } });
    await syncService.attach('user-1');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo marcar el import'),
      expect.anything(),
    );
    expect(useUiStore.getState().syncState).toBe('idle');
  });
});

// ── Reloj y ciclo de vida ──

describe('reloj y ciclo de vida', () => {
  it('avisa una sola vez si el servidor tiene datos del futuro (reloj local atrasado)', async () => {
    armar({ filas: { expenses: [filaGasto({ updated_at: '2026-09-01T13:00:00.000Z' })] } }); // +60 min
    await syncService.attach('user-1');

    const toasts = useUiStore.getState().toasts;
    expect(toasts.some((t) => t.message.includes('hora de este dispositivo'))).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Reloj local desfasado'));

    // Segundo ciclo: no repite el aviso
    const antes = useUiStore.getState().toasts.length;
    await syncService.flush();
    expect(useUiStore.getState().toasts.length).toBe(antes);
  });

  it('pagehide, visibilitychange (hidden) y online disparan un flush', async () => {
    await syncService.attach('user-1');
    const eventos = [
      () => window.dispatchEvent(new Event('pagehide')),
      () => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      },
      () => window.dispatchEvent(new Event('online')),
    ];
    for (const disparar of eventos) {
      mockFrom.mockClear();
      disparar();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFrom.mock.calls.length).toBeGreaterThanOrEqual(10); // pull de las 10 tablas
    }
  });

  it('una edición durante un push en vuelo agenda otro push al terminar', async () => {
    // Pull que no resuelve hasta que lo liberemos
    let liberar: (() => void) | null = null;
    const bloqueo = new Promise<void>((r) => { liberar = r; });
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const chain = {
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            order: vi.fn(() => chain),
            range: vi.fn(async () => {
              if (table === 'expenses') await bloqueo;
              return { data: [], error: null };
            }),
          };
          return chain;
        }),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }));

    const p = syncService.attach('user-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(useUiStore.getState().syncState).toBe('syncing');

    // Edición mientras sincroniza: no debe perderse
    gastoLocal('durante', '2026-09-01T12:00:00.000Z');
    const llamadasAntes = mockFrom.mock.calls.length;

    liberar!();
    await p;
    // Tras terminar, se agenda (debounce) un segundo ciclo
    await vi.advanceTimersByTimeAsync(800);
    expect(mockFrom.mock.calls.length).toBeGreaterThan(llamadasAntes);
  });
});
