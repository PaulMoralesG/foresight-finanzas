// ================================================================
// totales — suma de ingresos y gastos de una lista de movimientos.
//
// Antes estaba escrita dos veces (ReportModal y MovementsPage). Función pura:
// los gastos usan `cuentaComoGasto` (un pago de deuda o una transferencia no
// son gasto) y el resultado se redondea a centavos.
//
// Regla de ámbito para movimientos antiguos sin `businessType`: `Transaction.
// businessType` es obligatorio y la deserialización de sync
// (`business_type` nulo → 'personal') ya lo normaliza, así que un movimiento
// sin etiqueta solo puede existir en datos locales muy viejos. La regla de la
// app es la estricta de `filtrarPorAmbito`/`enAmbito` (src/lib/ambito.ts): sin
// etiqueta no cuenta ni como Personal ni como Negocio. ReportModal trataba
// `!businessType` como Negocio y contradecía a Movimientos y al segmentado;
// ahora ambos usan `filtrarPorAmbito`.
// ================================================================

import { cuentaComoGasto } from '@/lib/debt-payments';
import { roundMoney } from '@/lib/utils';
import type { Transaction } from '@/types';

export interface Totales {
  ingresos: number;
  gastos: number;
  saldo: number;
}

export function totalesDe(items: Transaction[]): Totales {
  const ingresos = roundMoney(
    items.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0),
  );
  const gastos = roundMoney(items.filter(cuentaComoGasto).reduce((s, i) => s + i.amount, 0));
  return { ingresos, gastos, saldo: roundMoney(ingresos - gastos) };
}
