// ================================================================
// TESTS — src/lib/sync.ts: hidratación de claves ausentes (spec D2)
//
// Un cliente anterior a 001dbbd/283b692 deja deudas/movimientos locales sin
// cutDay/statementBalance/creditLimit/debtId. Al actualizar, el primer ciclo
// completo no debe subir `null` encima de lo que el servidor sí tiene:
// `pendienteHidratar` (rellenado por migrateV16) lista los ids a rellenar.
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

vi.mock('@/lib/error-reporter', () => ({
  reportarError: vi.fn(),
  initErrorReporter: vi.fn(),
}));

import { syncService } from '@/lib/sync';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import type { Debt, Transaction } from '@/types';

const mockFrom = (mocks.supabase as { from: ReturnType<typeof vi.fn> }).from;

type Fila = Record<string, unknown>;

/** Builder de Supabase que registra upserts y si algún pull usó `gte` (incremental). */
function armar(filas: Record<string, Fila[]> = {}, opciones: { fallaPull?: boolean } = {}) {
  const upserts: { table: string; rows: Fila[] }[] = [];
  const gte = vi.fn();
  mockFrom.mockImplementation((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => {
        const chain = {
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          gte: vi.fn((...args: unknown[]) => {
            gte(...args);
            return chain;
          }),
          order: vi.fn(() => chain),
          range: vi.fn(() =>
            Promise.resolve(
              opciones.fallaPull && table === 'debts'
                ? { data: null, error: { code: 'ECONN', message: 'fetch failed' } }
                : { data: filas[table] ?? [], error: null },
            ),
          ),
        };
        return chain;
      }),
    })),
    upsert: vi.fn((rows: Fila[]) => {
      upserts.push({ table, rows });
      return Promise.resolve({ error: null });
    }),
    update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
  }));
  return { upserts, gte };
}

const filasDe = (upserts: { table: string; rows: Fila[] }[], table: string) =>
  upserts.filter((u) => u.table === table).flatMap((u) => u.rows);

const filaDeuda = (extra: Fila = {}): Fila => ({
  id: 'd1',
  user_id: 'user-1',
  name: 'Tarjeta Pichincha',
  tag: 'personal',
  kind: 'Tarjeta de crédito',
  balance: 500,
  annual_rate: 0,
  min_payment: 20,
  pay_day: 12,
  cut_day: 24,
  statement_balance: 300,
  credit_limit: 2000,
  updated_at: '2026-08-01T00:00:00.000Z',
  deleted_at: null,
  ...extra,
});

const filaPago = (extra: Fila = {}): Fila => ({
  id: 'e1',
  user_id: 'user-1',
  type: 'expense',
  amount: 201.6,
  concept: 'Pago tarjeta',
  date: '2026-09-26',
  category: 'pago-tarjetas',
  method: 'cash',
  business_type: 'personal',
  debt_id: 'd1',
  created_at: null,
  updated_at: '2026-08-01T00:00:00.000Z',
  deleted_at: null,
  ...extra,
});

/** Deuda local escrita por un cliente viejo: sin claves de tarjeta. */
function deudaLocalVieja(updated_at: string, id = 'd1'): Debt {
  const d: Debt = {
    id,
    name: 'Tarjeta Pichincha',
    tag: 'personal',
    kind: 'Tarjeta de crédito',
    balance: 500,
    annualRate: 0,
    minPayment: 20,
    payDay: 12,
    updated_at,
  };
  useFinanceStore.setState((s) => ({ debts: [...s.debts, d] }));
  return d;
}

/** Movimiento local escrito por un cliente viejo: sin debtId. */
function gastoLocalViejo(updated_at: string, id = 'e1'): Transaction {
  const t: Transaction = {
    id,
    type: 'expense',
    amount: 201.6,
    concept: 'Pago tarjeta',
    date: '2026-09-26',
    category: 'pago-tarjetas',
    method: 'cash',
    businessType: 'personal',
    updated_at,
  };
  useFinanceStore.setState((s) => ({ expenses: [...s.expenses, t] }));
  return t;
}

const pendiente = (debts: string[], expenses: string[]) =>
  useFinanceStore.setState({ pendienteHidratar: { debts, expenses } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
  mocks.supabase = { from: mockFrom };
  mockFrom.mockClear();
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

describe('hidratación de deudas (cut_day, statement_balance, credit_limit)', () => {
  it('empate de updated_at, local sin cutDay, id pendiente: el push manda cut_day 24 y la lista queda vacía', async () => {
    const t = '2026-08-01T00:00:00.000Z';
    const { upserts } = armar({ debts: [filaDeuda({ updated_at: t })] });
    deudaLocalVieja(t);
    pendiente(['d1'], []);

    await syncService.attach('user-1');

    const subida = filasDe(upserts, 'debts').find((r) => r.id === 'd1');
    expect(subida).toMatchObject({ cut_day: 24, statement_balance: 300, credit_limit: 2000 });
    expect(useFinanceStore.getState().debts[0]).toMatchObject({ cutDay: 24, statementBalance: 300, creditLimit: 2000 });
    expect(useFinanceStore.getState().pendienteHidratar).toEqual({ debts: [], expenses: [] });
  });

  it('con la copia local MÁS NUEVA (edición offline de cliente viejo) también conserva los valores del servidor', async () => {
    const { upserts } = armar({ debts: [filaDeuda({ updated_at: '2026-08-01T00:00:00.000Z' })] });
    deudaLocalVieja('2026-08-20T00:00:00.000Z');
    useFinanceStore.setState((s) => ({ debts: s.debts.map((d) => ({ ...d, balance: 450 })) }));
    pendiente(['d1'], []);

    await syncService.attach('user-1');

    const subida = filasDe(upserts, 'debts').find((r) => r.id === 'd1');
    expect(subida).toMatchObject({ balance: 450, cut_day: 24, statement_balance: 300, credit_limit: 2000 });
    expect(useFinanceStore.getState().pendienteHidratar.debts).toEqual([]);
  });

  it('un id NO pendiente con la clave ausente a propósito sube null (el usuario la borró)', async () => {
    const t = '2026-08-01T00:00:00.000Z';
    const { upserts } = armar({ debts: [filaDeuda({ updated_at: t })] });
    deudaLocalVieja(t);
    // Hay pendientes, pero de otra deuda
    pendiente(['otra'], []);

    await syncService.attach('user-1');

    const subida = filasDe(upserts, 'debts').find((r) => r.id === 'd1');
    expect(subida).toMatchObject({ cut_day: null, statement_balance: null, credit_limit: null });
  });
});

describe('hidratación de movimientos (debt_id)', () => {
  it('empate de updated_at, local sin debtId, id pendiente: el push manda debt_id y la lista queda vacía', async () => {
    const t = '2026-08-01T00:00:00.000Z';
    const { upserts } = armar({ expenses: [filaPago({ updated_at: t })] });
    gastoLocalViejo(t);
    pendiente([], ['e1']);

    await syncService.attach('user-1');

    const subida = filasDe(upserts, 'expenses').find((r) => r.id === 'e1');
    expect(subida).toMatchObject({ debt_id: 'd1' });
    expect(useFinanceStore.getState().expenses[0].debtId).toBe('d1');
    expect(useFinanceStore.getState().pendienteHidratar).toEqual({ debts: [], expenses: [] });
  });

  it('con la copia local más nueva también conserva el debt_id del servidor', async () => {
    const { upserts } = armar({ expenses: [filaPago({ updated_at: '2026-08-01T00:00:00.000Z' })] });
    gastoLocalViejo('2026-08-20T00:00:00.000Z');
    pendiente([], ['e1']);

    await syncService.attach('user-1');

    expect(filasDe(upserts, 'expenses').find((r) => r.id === 'e1')).toMatchObject({ debt_id: 'd1' });
  });

  it('un id NO pendiente sin debtId sube debt_id null', async () => {
    const t = '2026-08-01T00:00:00.000Z';
    const { upserts } = armar({ expenses: [filaPago({ updated_at: t })] });
    gastoLocalViejo(t);
    pendiente([], ['otro']);

    await syncService.attach('user-1');

    expect(filasDe(upserts, 'expenses').find((r) => r.id === 'e1')).toMatchObject({ debt_id: null });
  });
});

describe('ciclo de vida de pendienteHidratar', () => {
  it('con pendientes, un schedule() corre ciclo COMPLETO (pull sin filtro incremental)', async () => {
    const { gte } = armar();
    await syncService.attach('user-1'); // sin pendientes: fija la marca de agua
    // Un ciclo incremental normal SÍ filtra el pull por marca de agua.
    gte.mockClear();
    await syncService.flush();
    expect(gte).toHaveBeenCalled();

    // Con pendientes, el mismo schedule() debe bajar todo sin filtro.
    gte.mockClear();
    pendiente(['d1'], []);
    const p = syncService.schedule();
    await vi.advanceTimersByTimeAsync(800);
    await p;

    expect(gte).not.toHaveBeenCalled();
    expect(useFinanceStore.getState().pendienteHidratar).toEqual({ debts: [], expenses: [] });
  });

  it('si el ciclo falla, la lista NO se vacía (se reintenta en el siguiente)', async () => {
    const t = '2026-08-01T00:00:00.000Z';
    armar({ debts: [filaDeuda({ updated_at: t })] }, { fallaPull: true });
    deudaLocalVieja(t);
    pendiente(['d1'], []);

    const p = syncService.attach('user-1');
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    await p;

    expect(useUiStore.getState().syncState).toBe('error');
    expect(useFinanceStore.getState().pendienteHidratar).toEqual({ debts: ['d1'], expenses: [] });
  });

  it('sin pendientes no cambia nada: un local sin cutDay sigue sin él (no hay hidratación)', async () => {
    const t = '2026-08-01T00:00:00.000Z';
    const { upserts } = armar({ debts: [filaDeuda({ updated_at: t })] });
    deudaLocalVieja(t);

    await syncService.attach('user-1');

    expect(filasDe(upserts, 'debts').find((r) => r.id === 'd1')).toMatchObject({ cut_day: null });
  });
});
