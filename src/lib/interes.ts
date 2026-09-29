// ================================================================
// INTERÉS ESTIMADO — cuánto costaría un mes sin pagar de contado
//
// Es solo una orientación (interés simple mensual = saldo × tasa / 12): el
// banco calcula por días, con comisiones e IVA, y su estado de cuenta manda.
// ================================================================

import { roundMoney } from './utils';

/**
 * Interés estimado de un mes sobre `saldoNoPagado` con una tasa anual en
 * porcentaje. Devuelve 0 con datos inválidos, saldo ≤ 0 o tasa ≤ 0 (una tasa
 * de 0 significa «sin definir», no «sin interés»).
 */
export function interesEstimadoMensual(saldoNoPagado: number, tasaAnualPct: number): number {
  if (!Number.isFinite(saldoNoPagado) || !Number.isFinite(tasaAnualPct)) return 0;
  if (saldoNoPagado <= 0 || tasaAnualPct <= 0) return 0;
  return roundMoney((saldoNoPagado * tasaAnualPct) / 100 / 12);
}
