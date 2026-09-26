// ================================================================
// TARJETAS — estado de cuenta: corte, pago de contado y cupo
//
// Funciones puras. Solo aplican a deudas «Tarjeta de crédito»; en las demás
// devuelven null y la pantalla no muestra nada de esto.
// ================================================================

import { roundMoney } from './utils';
import type { Debt } from '@/types';

export const esTarjeta = (d: Pick<Debt, 'kind'>): boolean => d.kind === 'Tarjeta de crédito';

/**
 * Deja en la deuda solo los campos de tarjeta con valor válido: la clave
 * desaparece si viene null/undefined/NaN o fuera de rango. Así una deuda sin
 * esos datos tiene la misma forma local y remota (ver rowToDebt en sync).
 * En deudas que no son tarjeta los tres campos se quitan.
 */
export function normalizarDeuda<T extends Partial<Debt>>(d: T): T {
  const out: T = { ...d };
  const tarjeta = d.kind === undefined || d.kind === 'Tarjeta de crédito';
  const dia = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31;
  const monto = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!tarjeta || !dia(out.cutDay)) delete out.cutDay;
  if (!tarjeta || !monto(out.statementBalance)) delete out.statementBalance;
  else out.statementBalance = roundMoney(out.statementBalance as number);
  if (!tarjeta || !monto(out.creditLimit) || out.creditLimit === 0) delete out.creditLimit;
  else out.creditLimit = roundMoney(out.creditLimit as number);
  return out;
}

const clave = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Próxima fecha (hoy incluido) cuyo día del mes es `dia`. Si el mes es más
 * corto, cae en su último día: un corte el 31 cae el 30 de septiembre.
 */
export function proximaFechaConDia(dia: number, hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number);
  for (let salto = 0; salto < 2; salto++) {
    const ultimo = new Date(y, m - 1 + salto + 1, 0).getDate();
    const candidata = new Date(y, m - 1 + salto, Math.min(dia, ultimo));
    if (salto > 0 || candidata.getDate() >= d) return clave(candidata);
  }
  return hoy; // inalcanzable: el mes siguiente siempre vale
}

/** Días naturales de `desde` a `hasta` (ambos 'YYYY-MM-DD'). */
export function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00`);
  const b = new Date(`${hasta}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface EstadoTarjeta {
  /** Próxima fecha límite de pago («Pagar hasta»), si hay `payDay`. */
  proximoPago: string | null;
  diasParaPagar: number | null;
  /** Próxima fecha de corte, si hay `cutDay`. */
  proximoCorte: string | null;
  /** Pago de contado pendiente, si se conoce. */
  contado: number | null;
  /** true si el pago de contado ya está cubierto (0). */
  contadoCubierto: boolean;
  cupoDisponible: number | null;
  /** % del cupo en uso (0–100+), si hay cupo. */
  usoPct: number | null;
}

export function estadoTarjeta(debt: Debt, hoy: string): EstadoTarjeta | null {
  if (!esTarjeta(debt)) return null;
  const proximoPago = debt.payDay ? proximaFechaConDia(debt.payDay, hoy) : null;
  const contado = debt.statementBalance ?? null;
  const cupo = debt.creditLimit ?? null;
  return {
    proximoPago,
    diasParaPagar: proximoPago ? diasEntre(hoy, proximoPago) : null,
    proximoCorte: debt.cutDay ? proximaFechaConDia(debt.cutDay, hoy) : null,
    contado,
    contadoCubierto: contado === 0,
    cupoDisponible: cupo !== null ? roundMoney(cupo - debt.balance) : null,
    usoPct: cupo ? roundMoney((debt.balance / cupo) * 100) : null,
  };
}
