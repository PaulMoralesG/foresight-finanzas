// ================================================================
// IMPRIMIR DEUDAS — lista de deudas a PDF vía window.print()
// ================================================================

import { DebtsPrintView } from '@/components/features/report/DebtsPrintView';
import { imprimirVista } from '@/lib/print';
import { generadoAhora, roundMoney } from '@/lib/utils';
import type { Debt } from '@/types';

export function imprimirDeudas(debts: Debt[]): void {
  const totalBalance = roundMoney(debts.reduce((s, d) => s + d.balance, 0));
  imprimirVista(
    <DebtsPrintView debts={debts} totalBalance={totalBalance} generado={generadoAhora()} />,
    'foresight-deudas',
  );
}
