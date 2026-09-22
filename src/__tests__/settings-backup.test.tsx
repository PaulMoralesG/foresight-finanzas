// ================================================================
// TESTS — Ajustes (fase 3.5): Copia de seguridad, importBackup en el store
//
// La sección "Metas y estrategia" que vivía aquí se repartió a las
// pantallas donde ya se usa: la meta de patrimonio se edita en
// NetWorthPage (networth-page.test.tsx) y el método/aporte extra de
// deudas ya eran editables en DebtsPage desde antes.
// ================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupSettings } from '@/components/features/settings/BackupSettings';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { buildBackup } from '@/lib/backup';

const saveData = () => Promise.resolve(true);

beforeEach(() => {
  cleanup();
  useFinanceStore.getState().reset();
  useUiStore.setState({ toasts: [] });
});

describe('BackupSettings', () => {
  it('importa un respaldo válido tras confirmar', async () => {
    const respaldo = buildBackup({
      expenses: [{ id: 'e1', type: 'expense', amount: 10, concept: 'Café', date: '2026-09-01', category: 'comida', method: 'cash', businessType: 'personal', updated_at: 'viejo' }],
      accounts: [{ id: 'a1', name: 'Banco', kind: 'Banco', initialBalance: 5, updated_at: 'viejo' }],
      debts: [], assets: [], networth: [], budgetLines: [], recurrences: [], budgets: {}, budgetUpdatedAt: {}, savingsGoals: [],
      customExpenseCategories: [], customIncomeCategories: [],
      settings: { debtMethod: 'snowball', extraPayment: 0, netWorthGoal: 0, updated_at: '' },
    });
    render(<BackupSettings saveData={saveData} />);
    const archivo = new File([JSON.stringify(respaldo)], 'foresight-2026-09-21.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Archivo de respaldo'), archivo);

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('1 movimientos, 1 cuentas');
    await userEvent.click(screen.getByRole('button', { name: 'Importar' }));

    const s = useFinanceStore.getState();
    expect(s.expenses).toHaveLength(1);
    expect(s.expenses[0].concept).toBe('Café');
    expect(s.expenses[0].updated_at).not.toBe('viejo'); // sellado al importar
    expect(s.accounts[0].name).toBe('Banco');
  });

  it('rechaza un archivo que no es un respaldo, con un aviso', async () => {
    render(<BackupSettings saveData={saveData} />);
    const archivo = new File(['{"cols":{}}'], 'otro.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Archivo de respaldo'), archivo);
    await vi.waitFor(() => {
      expect(useUiStore.getState().toasts.some((t) => t.message.includes('no parece un respaldo'))).toBe(true);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
