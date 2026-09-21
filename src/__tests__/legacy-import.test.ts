// ================================================================
// TESTS — src/lib/legacy-import.ts
// ================================================================

import { describe, it, expect } from 'vitest';
import { shouldImportLegacy, hasLegacyBlobs, buildImportRows, type LegacyProfileRow } from '@/lib/legacy-import';
import type { Transaction, SavingsGoal } from '@/types';

// Los blobs legacy tienen ids NUMÉRICOS (así los dejó la versión vieja)
const legacyExpense = {
  id: 7,
  type: 'expense',
  amount: 100,
  concept: 'X',
  date: '2026-07-15',
  category: 'food',
  method: 'cash',
  businessType: 'personal',
  created_at: '2026-07-15T10:00:00.000Z',
  updated_at: '2026-07-15T10:00:00.000Z',
} as unknown as Transaction;

function makeProfile(overrides: Partial<LegacyProfileRow> = {}): LegacyProfileRow {
  return {
    legacy_imported: false,
    expenses: [legacyExpense],
    budgets: { '2026-07': 5000 },
    // Forma legacy real: sin tag/targetDate/saved/savedFromAccounts (fase 3.8).
    savings_goal: [{ id: 'legacy-1', concept: 'Casa', target: 100000, updated_at: '2026-07-16T10:00:00.000Z' }] as unknown as SavingsGoal[],
    custom_expense_categories: [{ id: 'custom_test', label: 'Test', icon: '📌', color: 'bg-slate-100' }],
    custom_income_categories: [],
    last_synced_at: '2026-07-20T10:00:00.000Z',
    ...overrides,
  };
}

function emptyProfile(): LegacyProfileRow {
  return makeProfile({
    expenses: [],
    budgets: {},
    savings_goal: [],
    custom_expense_categories: [],
    custom_income_categories: [],
  });
}

describe('shouldImportLegacy / hasLegacyBlobs', () => {
  it('true: flag pendiente + blobs con datos (aunque las tablas ya tengan filas)', () => {
    // El import es idempotente por clave: puede re-correr sin duplicar
    expect(shouldImportLegacy(makeProfile())).toBe(true);
  });

  it('false: flag legacy_imported completado', () => {
    expect(shouldImportLegacy(makeProfile({ legacy_imported: true }))).toBe(false);
  });

  it('false: sin blobs que importar', () => {
    expect(shouldImportLegacy(emptyProfile())).toBe(false);
  });

  it('hasLegacyBlobs detecta cualquier entidad con datos', () => {
    expect(hasLegacyBlobs(makeProfile())).toBe(true);
    expect(hasLegacyBlobs(makeProfile({
      expenses: [],
      budgets: { '2026-07': 100 },
      savings_goal: [],
      custom_expense_categories: [],
      custom_income_categories: [],
    }))).toBe(true);
    expect(hasLegacyBlobs(emptyProfile())).toBe(false);
  });
});

describe('buildImportRows', () => {
  it('genera ids uuid deterministas (idempotente ante re-ejecución)', async () => {
    const rows1 = await buildImportRows(makeProfile(), 'user-1');
    const rows2 = await buildImportRows(makeProfile(), 'user-1');

    expect(rows1.expenses[0].id).toBe(rows2.expenses[0].id);
    expect(rows1.expenses[0].id).not.toBe('7'); // ya no es numérico
    expect(rows1.goals[0].id).toBe(rows2.goals[0].id);
  });

  it('ids distintos por usuario y por entidad', async () => {
    const rows = await buildImportRows(makeProfile(), 'user-1');
    const otherUser = await buildImportRows(makeProfile(), 'user-2');

    expect(otherUser.expenses[0].id).not.toBe(rows.expenses[0].id);
    expect(rows.expenses[0].id).not.toBe(rows.goals[0].id);
  });

  it('expande budgets a filas (month, amount, updated_at = last_synced_at)', async () => {
    const rows = await buildImportRows(makeProfile(), 'user-1');
    expect(rows.budgets).toEqual([
      { month: '2026-07', amount: 5000, updated_at: '2026-07-20T10:00:00.000Z' },
    ]);
  });

  it('conserva el slug de las categorías y estampa updated_at', async () => {
    const rows = await buildImportRows(makeProfile(), 'user-1');
    expect(rows.expenseCategories[0].id).toBe('custom_test');
    expect(rows.expenseCategories[0].updated_at).toBe('2026-07-20T10:00:00.000Z');
  });

  it('conserva los campos de la transacción además del id', async () => {
    const rows = await buildImportRows(makeProfile(), 'user-1');
    expect(rows.expenses[0].concept).toBe('X');
    expect(rows.expenses[0].amount).toBe(100);
    expect(rows.expenses[0].date).toBe('2026-07-15');
  });

  it('no crashea con savings_goal NUMERIC (columna real de Supabase, herencia v5)', async () => {
    const rows = await buildImportRows(
      makeProfile({ savings_goal: 50000 as unknown as LegacyProfileRow['savings_goal'] }),
      'user-1',
    );
    expect(rows.goals).toEqual([]);
    expect(rows.expenses).toHaveLength(1); // el resto del import sigue intacto
  });

  it('no crashea con campos null o malformados', async () => {
    const rows = await buildImportRows(
      makeProfile({
        expenses: null as unknown as LegacyProfileRow['expenses'],
        budgets: null as unknown as LegacyProfileRow['budgets'],
        custom_expense_categories: 42 as unknown as LegacyProfileRow['custom_expense_categories'],
      }),
      'user-1',
    );
    expect(rows.expenses).toEqual([]);
    expect(rows.budgets).toEqual([]);
    expect(rows.expenseCategories).toEqual([]);
  });

  it('normaliza montos string a number', async () => {
    const base = (makeProfile().expenses as unknown[])[0] as Record<string, unknown>;
    const profile = makeProfile({
      expenses: [{ ...base, amount: '250.50' }] as unknown as LegacyProfileRow['expenses'],
    });
    const rows = await buildImportRows(profile, 'user-1');
    expect(rows.expenses[0].amount).toBe(250.5);
  });

  it('normaliza enums y fechas inválidas (CHECK de Postgres)', async () => {
    const base = (makeProfile().expenses as unknown[])[0] as Record<string, unknown>;
    const profile = makeProfile({
      expenses: [{
        ...base,
        id: 1,
        type: 'cualquier-cosa',
        method: 'cheque',
        businessType: null,
        date: '15/07/2026',
      }] as unknown as LegacyProfileRow['expenses'],
    });
    const rows = await buildImportRows(profile, 'user-1');
    expect(rows.expenses[0].type).toBe('expense');
    expect(rows.expenses[0].method).toBe('cash');
    expect(rows.expenses[0].businessType).toBe('personal');
    expect(rows.expenses[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deduplica ids numéricos repetidos (no genera PKs uuid duplicadas)', async () => {
    const base = (makeProfile().expenses as unknown[])[0] as Record<string, unknown>;
    const profile = makeProfile({
      expenses: [
        { ...base, id: 7, concept: 'A' },
        { ...base, id: 7, concept: 'B' },
        { ...base, id: 8, concept: 'C' },
      ] as unknown as LegacyProfileRow['expenses'],
    });
    const rows = await buildImportRows(profile, 'user-1');
    expect(rows.expenses).toHaveLength(2);
    const ids = new Set(rows.expenses.map((e) => e.id));
    expect(ids.size).toBe(2);
  });

  it('descarta categorías sin slug válido', async () => {
    const profile = makeProfile({
      custom_expense_categories: [
        { id: 42, label: 'Sin slug', icon: 'x', color: 'y' },
        { id: 'custom_ok', label: 'Con slug', icon: 'x', color: 'y' },
      ] as unknown as LegacyProfileRow['custom_expense_categories'],
    });
    const rows = await buildImportRows(profile, 'user-1');
    expect(rows.expenseCategories).toHaveLength(1);
    expect(rows.expenseCategories[0].id).toBe('custom_ok');
  });
});
