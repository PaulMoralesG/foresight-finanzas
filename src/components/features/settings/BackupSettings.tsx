// ================================================================
// BackupSettings — "Copia de seguridad" (fase 3.5; Balance Dual viewAjustes)
//
// Exportar descarga todo en un JSON con la fecha; importar reemplaza lo
// que haya tras confirmar. En una app de finanzas es la red de seguridad:
// si se borra el almacenamiento del navegador, hay de dónde volver.
// ================================================================

import { useRef, useState } from 'react';
import { Download, FileText } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { downloadBlob, syncToCloud } from '@/lib/utils';
import { buildBackup, backupFilename, parseBackup, type BackupData } from '@/lib/backup';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function BackupSettings({ saveData }: { saveData: () => Promise<boolean> }) {
  const addToast = useUiStore((s) => s.addToast);
  const importBackup = useFinanceStore((s) => s.importBackup);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendiente, setPendiente] = useState<{ nombre: string; data: BackupData } | null>(null);

  async function exportar() {
    const s = useFinanceStore.getState();
    const backup = buildBackup({
      expenses: s.expenses,
      accounts: s.accounts,
      debts: s.debts,
      assets: s.assets,
      networth: s.networth,
      budgetLines: s.budgetLines,
      budgets: s.budgets,
      budgetUpdatedAt: s.budgetUpdatedAt,
      savingsGoals: s.savingsGoals,
      customExpenseCategories: s.customExpenseCategories,
      customIncomeCategories: s.customIncomeCategories,
      settings: s.settings,
    });
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const outcome = await downloadBlob(blob, backupFilename());
      if (outcome === 'cancelled') return;
      addToast(outcome === 'shared' ? 'Respaldo listo para compartir ✅' : 'Respaldo descargado ✅', 'success');
    } catch (err: unknown) {
      const motivo = err instanceof Error ? err.message : String(err);
      addToast(`No se pudo exportar: ${motivo}`, 'error');
    }
  }

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = parseBackup(String(fr.result ?? ''));
        setPendiente({ nombre: f.name, data });
      } catch (err: unknown) {
        addToast(err instanceof Error ? err.message : 'No se pudo leer el respaldo.', 'error');
      }
    };
    fr.onerror = () => addToast('No se pudo leer el archivo.', 'error');
    fr.readAsText(f);
  }

  function confirmarImportar() {
    if (!pendiente) return;
    importBackup(pendiente.data);
    setPendiente(null);
    addToast('Respaldo importado ✅', 'success');
    syncToCloud(saveData, addToast);
  }

  const resumen = pendiente
    ? `${pendiente.data.expenses.length} movimientos, ${pendiente.data.accounts.length} cuentas, ${pendiente.data.debts.length} deudas, ${pendiente.data.budgetLines.length} presupuestos.`
    : '';

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Copia de seguridad</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Descarga un respaldo cada cierto tiempo. Importar reemplaza lo que haya.</p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={exportar} className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Exportar JSON
        </button>
        <button onClick={() => inputRef.current?.click()} className="saas-btn saas-btn-secondary saas-btn-sm">
          Importar JSON
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={onArchivo}
          className="hidden"
          aria-label="Archivo de respaldo"
        />
      </div>

      <ConfirmDialog
        open={!!pendiente}
        title="¿Importar este respaldo?"
        message={`"${pendiente?.nombre ?? ''}" trae ${resumen} Se reemplazará todo lo que hay en este dispositivo.`}
        confirmLabel="Importar"
        variant="warning"
        onConfirm={confirmarImportar}
        onCancel={() => setPendiente(null)}
      />
    </div>
  );
}
