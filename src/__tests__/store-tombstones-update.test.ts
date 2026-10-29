// ================================================================
// TESTS — editar un registro ya borrado NO lo resucita (auditoría oct-2026)
//
// Los update* limpiaban el tombstone del id aunque el registro no estuviera
// vivo. Un modal abierto sobre un elemento que se borró (aquí o vía sync)
// dejaba un borrado pendiente sin tombstone: el borrado no viajaba al
// servidor y el siguiente pull devolvía la fila. Ahora, sin registro vivo,
// el update es un no-op.
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/stores/financeStore';
import type { Category } from '@/types';

const s = () => useFinanceStore.getState();

const cat = (id: string): Category => ({ id, label: 'Mascotas', icon: 'tag', color: '#000' });

beforeEach(() => {
  s().reset();
});

describe('update* tras borrar no resucita', () => {
  it('updateTransaction', () => {
    const id = s().addTransaction({
      type: 'expense', amount: 10, concept: 'A', date: '2026-09-01',
      category: 'comida', method: 'cash', businessType: 'personal',
    });
    s().deleteTransaction(id);
    const marca = s().tombstones[id];
    s().updateTransaction(id, { concept: 'B' });
    expect(s().tombstones[id]).toBe(marca);
    expect(s().expenses).toHaveLength(0);
  });

  it('updateDebt', () => {
    const id = s().addDebt({
      name: 'Préstamo', tag: 'personal', kind: 'Préstamo', balance: 100,
      annualRate: 20, minPayment: 10, payDay: 5,
    });
    s().deleteDebt(id);
    const marca = s().tombstones[id];
    s().updateDebt(id, { name: 'Otra' });
    expect(s().tombstones[id]).toBe(marca);
    expect(s().debts).toHaveLength(0);
  });

  it('updateSavingsGoal', () => {
    const id = s().addSavingsGoal({ concept: 'Casa', target: 100 });
    s().deleteSavingsGoal(id);
    const marca = s().tombstones[id];
    s().updateSavingsGoal(id, { target: 200 });
    expect(s().tombstones[id]).toBe(marca);
  });

  it('updateRecurrence', () => {
    const id = s().addRecurrence({
      type: 'expense', amount: 10, concept: 'Netflix', category: 'ocio', method: 'card',
      businessType: 'personal', frecuencia: 'monthly', intervalo: 1, diaMes: 1,
      desde: '2026-01-01', hasta: null, activa: true,
    });
    s().deleteRecurrence(id);
    const marca = s().tombstones[id];
    s().updateRecurrence(id, { amount: 20 });
    expect(s().tombstones[id]).toBe(marca);
  });

  it('updateBudgetLine', () => {
    const id = s().addBudgetLine({ tag: 'personal', kind: 'expense', categoryId: 'comida', limit: 100, plan: {} });
    s().deleteBudgetLine(id);
    const marca = s().tombstones[id];
    s().updateBudgetLine(id, { plan: { '2026-09': 50 } });
    expect(s().tombstones[id]).toBe(marca);
  });

  it('updateAccount', () => {
    const id = s().addAccount({ name: 'Banco', kind: 'Banco', initialBalance: 0 });
    s().deleteAccount(id);
    const marca = s().tombstones[id];
    s().updateAccount(id, { name: 'Otro' });
    expect(s().tombstones[id]).toBe(marca);
  });

  it('updateAsset', () => {
    const id = s().addAsset({ name: 'Auto', tag: 'personal', group: 'Otros activos', value: 1000 });
    s().deleteAsset(id);
    const marca = s().tombstones[id];
    s().updateAsset(id, { value: 2000 });
    expect(s().tombstones[id]).toBe(marca);
  });

  it('updateCustomCategory', () => {
    s().addCustomCategory('expense', cat('cat-x'));
    s().deleteCustomCategory('expense', 'cat-x');
    const marca = s().tombstones['cat-x'];
    s().updateCustomCategory('expense', 'cat-x', { label: 'Otra' });
    expect(s().tombstones['cat-x']).toBe(marca);
    expect(s().customExpenseCategories).toHaveLength(0);
  });

  it('un update sobre un registro VIVO con tombstone sí lo limpia (resurrección legítima)', () => {
    const id = s().addSavingsGoal({ concept: 'Casa', target: 100 });
    useFinanceStore.setState({ tombstones: { [id]: '2026-01-01T00:00:00.000Z' } });
    s().updateSavingsGoal(id, { target: 200 });
    expect(s().tombstones[id]).toBeUndefined();
  });

  it('update de un id inexistente no notifica cambios al store (no agenda sync)', () => {
    s().addSavingsGoal({ concept: 'Casa', target: 100 });
    const antes = s();
    s().updateSavingsGoal('no-existe', { target: 1 });
    s().updateTransaction('no-existe', { concept: 'X' });
    s().updateAccount('no-existe', { name: 'X' });
    expect(s().savingsGoals).toBe(antes.savingsGoals);
    expect(s().expenses).toBe(antes.expenses);
    expect(s().accounts).toBe(antes.accounts);
    expect(s().tombstones).toBe(antes.tombstones);
  });
});
