// ================================================================
// Exportar el respaldo JSON del estado local actual.
//
// Compartido por Ajustes → Copia de seguridad y por el aviso del login antes
// de que otra cuenta descarte cambios sin subir de la anterior.
// ================================================================

import { useFinanceStore } from '@/stores/financeStore';
import { downloadBlob, type DownloadOutcome } from '@/lib/utils';
import { buildBackup, backupFilename } from '@/lib/backup';

/** Descarga (o comparte) todo el estado financiero local en un JSON. Puede lanzar. */
export async function exportarRespaldoLocal(): Promise<DownloadOutcome> {
  const s = useFinanceStore.getState();
  const backup = buildBackup({
    expenses: s.expenses,
    accounts: s.accounts,
    debts: s.debts,
    assets: s.assets,
    networth: s.networth,
    budgetLines: s.budgetLines,
    recurrences: s.recurrences,
    budgets: s.budgets,
    budgetUpdatedAt: s.budgetUpdatedAt,
    savingsGoals: s.savingsGoals,
    customExpenseCategories: s.customExpenseCategories,
    customIncomeCategories: s.customIncomeCategories,
    settings: s.settings,
  });
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  return downloadBlob(blob, backupFilename());
}
