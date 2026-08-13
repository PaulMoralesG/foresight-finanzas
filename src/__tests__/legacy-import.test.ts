// ================================================================
// TESTS — src/lib/legacy-import.ts
// ================================================================

import { describe, it, expect } from 'vitest';
import { shouldImportLegacy, buildImportRows, type LegacyProfileRow } from '@/lib/legacy-import';
import type { Transaction } from '@/types';

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
    reminders: [],
    savings_goal: [{ id: 'legacy-1', concept: 'Casa', target: 100000, updated_at: '2026-07-16T10:00:00.000Z' }],
    custom_expense_categories: [{ id: 'custom_test', label: 'Test', icon: '📌', color: 'bg-slate-100' }],
    custom_income_categories: [],
    last_synced_at: '2026-07-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('shouldImportLegacy', () => {
  it('true: flag pendiente + blobs + tablas vacías', () => {
    expect(shouldImportLegacy(makeProfile(), true)).toBe(true);
  });

  it('false: tablas no vacías', () => {
    expect(shouldImportLegacy(makeProfile(), false)).toBe(false);
  });

  it('false: flag legacy_imported completado', () => {
    expect(shouldImportLegacy(makeProfile({ legacy_imported: true }), true)).toBe(false);
  });

  it('false: sin blobs que importar', () => {
    expect(shouldImportLegacy(makeProfile({
      expenses: [],
      budgets: {},
      savings_goal: [],
      custom_expense_categories: [],
      custom_income_categories: [],
    }), true)).toBe(false);
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
        reminders: 'no-es-json' as unknown as LegacyProfileRow['reminders'],
        custom_expense_categories: 42 as unknown as LegacyProfileRow['custom_expense_categories'],
      }),
      'user-1',
    );
    expect(rows.expenses).toEqual([]);
    expect(rows.budgets).toEqual([]);
    expect(rows.reminders).toEqual([]);
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
});
