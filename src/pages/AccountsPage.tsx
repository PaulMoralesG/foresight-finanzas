// ================================================================
// AccountsPage — Cuentas (fase 3.1; referencia: viewCuentas() de Balance Dual)
//
// Rejilla de cuentas con su saldo derivado (saldo inicial + movimientos),
// alta y edición en una hoja, borrado solo si no tiene movimientos, y el
// "Resumen por cuenta" del mes: entradas y salidas por categoría en una
// sola cuenta, con las transferencias aparte. La columna "Proyectado" de
// la referencia llega con el presupuesto por categoría (3.4).
// ================================================================

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Wallet } from '@/components/ui/icons.generated';
import { useFinanceStore } from '@/stores/financeStore';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney, parseMoneyInput, roundMoney, safeParseDate, syncToCloud } from '@/lib/utils';
import { accountBalance, accountIsUsed, accountName, totalBalance, ACCOUNT_KINDS } from '@/lib/accounts';
import { currentMonthKey, shiftMonthKey, monthKeyLabel } from '@/hooks/useBudget';
import { getCategoryById } from '@/config/categories';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useScrollLock } from '@/hooks/useScrollLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Account, AccountKind } from '@/types';

export function AccountsPage() {
  const accounts = useFinanceStore((s) => s.accounts);
  const expenses = useFinanceStore((s) => s.expenses);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);
  const addToast = useUiStore((s) => s.addToast);
  const { saveData } = useAuth();

  const [editing, setEditing] = useState<Account | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('Banco');
  const [initialInput, setInitialInput] = useState('0');
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);

  const total = useMemo(() => totalBalance(accounts, expenses), [accounts, expenses]);

  function openCreate() {
    setEditing(null);
    setName('');
    setKind('Banco');
    setInitialInput('0');
    setIsFormOpen(true);
  }

  function openEdit(a: Account) {
    setEditing(a);
    setName(a.name);
    setKind(a.kind);
    setInitialInput(String(a.initialBalance));
    setIsFormOpen(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nombre = name.trim();
    if (!nombre) {
      addToast('Ponle un nombre a la cuenta', 'error');
      return;
    }
    // Saldo inicial: puede ser negativo (una tarjeta con deuda) y cero.
    const crudo = initialInput.trim();
    const negativo = crudo.startsWith('-');
    const initialBalance = roundMoney((negativo ? -1 : 1) * parseMoneyInput(crudo.replace(/^-/, '')));

    if (editing) {
      updateAccount(editing.id, { name: nombre, kind, initialBalance });
      addToast('Cuenta actualizada ✅', 'success');
    } else {
      addAccount({ name: nombre, kind, initialBalance });
      addToast('Cuenta creada ✅', 'success');
    }
    syncToCloud(saveData, addToast);
    setIsFormOpen(false);
  }

  function requestDelete(a: Account) {
    if (accountIsUsed(a.id, expenses)) {
      addToast('Esta cuenta tiene movimientos asociados. Elimínalos primero o reasígnalos.', 'error');
      return;
    }
    setConfirmDelete(a);
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteAccount(confirmDelete.id);
    addToast(`Cuenta "${confirmDelete.name}" eliminada`, 'info');
    syncToCloud(saveData, addToast);
    setConfirmDelete(null);
  }

  useEscapeKey(() => {
    if (confirmDelete) setConfirmDelete(null);
    else if (isFormOpen) setIsFormOpen(false);
  }, isFormOpen || !!confirmDelete);
  useScrollLock(isFormOpen || !!confirmDelete);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Cabecera con saldo total */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Saldo total</p>
          <p className={`text-2xl font-bold tabular-nums ${total < 0 ? 'text-expense-600 dark:text-expense-400' : 'text-slate-900 dark:text-white'}`}>
            {formatMoney(total)}
          </p>
          <p className="text-2xs text-slate-500 dark:text-slate-400">
            {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}
          </p>
        </div>
        <button onClick={openCreate} className="saas-btn saas-btn-primary saas-btn-sm flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Agregar cuenta
        </button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no tienes cuentas"
          description="Crea tus cuentas (efectivo, banco, tarjeta…) para saber dónde está tu dinero y mover saldo entre ellas con transferencias."
          action={{ label: 'Crear la primera cuenta', icon: Plus, onClick: openCreate }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => {
            const bal = accountBalance(a, expenses);
            return (
              <div key={a.id} className="saas-card p-4 flex flex-col gap-1 animate-slide-up">
                <p className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{a.kind}</p>
                <p className="font-semibold text-slate-900 dark:text-white truncate">{a.name}</p>
                <p className={`text-xl font-bold tabular-nums ${bal < 0 ? 'text-expense-600 dark:text-expense-400' : 'text-slate-900 dark:text-white'}`}>
                  {formatMoney(bal)}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => openEdit(a)}
                    className="saas-btn saas-btn-secondary saas-btn-sm flex items-center gap-1"
                    aria-label={`Editar ${a.name}`}
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                  <button
                    onClick={() => requestDelete(a)}
                    className="saas-btn saas-btn-ghost saas-btn-sm flex items-center gap-1 text-expense-600 dark:text-expense-400"
                    aria-label={`Eliminar ${a.name}`}
                  >
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {accounts.length > 0 && <AccountSummaryCard />}

      {isFormOpen && (
        <ModalSheet
          id="account-form-title"
          titulo={editing ? 'Editar cuenta' : 'Nueva cuenta'}
          onClose={() => setIsFormOpen(false)}
          trapActivo={!confirmDelete}
          focoInicial="#account-name"
        >
          <form onSubmit={handleSubmit} className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div>
              <label htmlFor="account-name" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Nombre</label>
              <input
                id="account-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Banco Pichincha"
                className="saas-input py-1.5 text-sm"
                required
                maxLength={80}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="account-kind" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Tipo</label>
                <select
                  id="account-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AccountKind)}
                  className="saas-input py-1.5 text-sm"
                >
                  {ACCOUNT_KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="account-initial" className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 block">Saldo inicial</label>
                <input
                  id="account-initial"
                  type="text"
                  inputMode="decimal"
                  value={initialInput}
                  onChange={(e) => { if (/^-?\d*[.,]?\d*$/.test(e.target.value)) setInitialInput(e.target.value); }}
                  className="saas-input py-1.5 text-sm tabular-nums"
                  required={!editing}
                />
              </div>
            </div>
            <p className="text-2xs text-slate-500 dark:text-slate-400">
              Lo que ya tienes guardado dentro de una cuenta déjalo aquí como saldo inicial: no vuelve a contarse en tu patrimonio.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setIsFormOpen(false)} className="saas-btn saas-btn-secondary flex-1 py-2 text-xs">Cancelar</button>
              <button type="submit" className="saas-btn saas-btn-primary flex-1 py-2 text-xs">{editing ? 'Guardar' : 'Crear'}</button>
            </div>
          </form>
        </ModalSheet>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="¿Eliminar esta cuenta?"
        message={confirmDelete ? `"${confirmDelete.name}" desaparecerá de la lista. Su saldo inicial dejará de contar en el total.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/* ─── Resumen por cuenta: entradas y salidas del mes en una sola cuenta ───
   Como la hoja "Balance de Cuentas" de la plantilla: qué entró y qué salió
   por categoría, las transferencias aparte, y el saldo actual al pie. */
function AccountSummaryCard() {
  const accounts = useFinanceStore((s) => s.accounts);
  const expenses = useFinanceStore((s) => s.expenses);
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const [accId, setAccId] = useState(accounts[0]?.id ?? '');
  const [mk, setMk] = useState(currentMonthKey());

  const cuenta = accounts.find((a) => a.id === accId) ?? accounts[0];
  const meses = [-3, -2, -1, 0].map((i) => shiftMonthKey(currentMonthKey(), i));

  const filas = useMemo(() => {
    if (!cuenta) return { entradas: [] as [string, number][], salidas: [] as [string, number][] };
    const customCats = [...customExpenseCategories, ...customIncomeCategories];
    const entradas: Record<string, number> = {};
    const salidas: Record<string, number> = {};
    const [y, m] = mk.split('-').map(Number);
    for (const t of expenses) {
      const d = safeParseDate(t.date);
      if (d.getFullYear() !== y || d.getMonth() !== m - 1) continue;
      if (t.accountId !== cuenta.id && t.toAccountId !== cuenta.id) continue;
      if (t.type === 'transfer') {
        const bucket = t.toAccountId === cuenta.id ? entradas : salidas;
        bucket['Transferencias'] = (bucket['Transferencias'] ?? 0) + t.amount;
        continue;
      }
      const label = getCategoryById(t.category, customCats).label;
      const bucket = t.type === 'income' ? entradas : salidas;
      bucket[label] = (bucket[label] ?? 0) + t.amount;
    }
    const ordenar = (r: Record<string, number>) =>
      Object.entries(r).map(([k, v]) => [k, roundMoney(v)] as [string, number]).sort((a, b) => a[0].localeCompare(b[0]));
    return { entradas: ordenar(entradas), salidas: ordenar(salidas) };
  }, [cuenta, expenses, mk, customExpenseCategories, customIncomeCategories]);

  if (!cuenta) return null;
  const vacio = filas.entradas.length === 0 && filas.salidas.length === 0;

  return (
    <div className="saas-card p-4 animate-slide-up">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Resumen por cuenta</h2>
          <p className="text-2xs text-slate-500 dark:text-slate-400">Entradas y salidas del mes en una sola cuenta</p>
        </div>
        <div className="flex gap-2">
          <div>
            <label htmlFor="ac-sel" className="sr-only">Cuenta</label>
            <select id="ac-sel" value={cuenta.id} onChange={(e) => setAccId(e.target.value)} className="saas-input-sm text-2xs">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ac-month" className="sr-only">Mes</label>
            <select id="ac-month" value={mk} onChange={(e) => setMk(e.target.value)} className="saas-input-sm text-2xs">
              {meses.map((k) => <option key={k} value={k}>{monthKeyLabel(k)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {vacio ? (
        <EmptyState variant="compact" title={`Sin movimientos en ${accountName(accounts, cuenta.id)} para ${monthKeyLabel(mk)}`} />
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-1 font-semibold">Categoría</th>
              <th className="py-1 font-semibold text-right">Real</th>
            </tr>
          </thead>
          <tbody>
            {([['Entradas', filas.entradas], ['Salidas', filas.salidas]] as const).map(([titulo, lista]) =>
              lista.length === 0 ? null : (
                <FragmentoSeccion key={titulo} titulo={titulo} lista={lista} />
              )
            )}
            <tr className="border-t border-slate-200 dark:border-slate-800 font-semibold">
              <td className="py-1.5">Saldo actual de la cuenta</td>
              <td className="py-1.5 text-right tabular-nums">{formatMoney(accountBalance(cuenta, expenses))}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function FragmentoSeccion({ titulo, lista }: { titulo: string; lista: [string, number][] }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="pt-2 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</td>
      </tr>
      {lista.map(([label, monto]) => (
        <tr key={label} className="border-t border-slate-100 dark:border-slate-800">
          <td className="py-1 text-slate-700 dark:text-slate-300">{label}</td>
          <td className={`py-1 text-right tabular-nums ${titulo === 'Entradas' ? 'text-income-600 dark:text-income-400' : 'text-expense-600 dark:text-expense-400'}`}>
            {formatMoney(monto)}
          </td>
        </tr>
      ))}
    </>
  );
}
