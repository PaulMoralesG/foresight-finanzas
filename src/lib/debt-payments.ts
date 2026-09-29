// ================================================================
// PAGOS DE DEUDAS — un pago es un movimiento con `debtId`
//
// Una sola fuente de verdad: el historial de una deuda son sus movimientos
// enlazados, y el saldo se ajusta cuando esos movimientos cambian. Todo lo de
// aquí es puro; el store decide cuándo aplicarlo (ver financeStore).
// ================================================================

import { roundMoney } from './utils';
import { esTarjeta } from './credit-card';
import type { Account, Debt, DebtKind, Transaction } from '@/types';

/** Categorías en las que un gasto puede ser el pago de una deuda. */
export const CATEGORIAS_DE_PAGO = ['pago-tarjetas', 'prestamos'] as const;

export function esCategoriaDePago(category: string): boolean {
  return (CATEGORIAS_DE_PAGO as readonly string[]).includes(category);
}

/** La categoría de gasto que corresponde a un tipo de deuda. */
export function categoriaDePago(kind: DebtKind): string {
  return kind === 'Tarjeta de crédito' ? 'pago-tarjetas' : 'prestamos';
}

/** ¿El movimiento paga una deuda? (lleva `debtId`, sea gasto o transferencia). */
export function esPagoDeDeuda(t: Pick<Transaction, 'debtId'>): boolean {
  return !!t.debtId;
}

/**
 * ¿Suma a los gastos del mes? Un pago de deuda NO es gasto: la compra ya se
 * contó al hacerla. Todo lo que suma gastos debe pasar por aquí, también los
 * `expense` con `debtId` que ya existían.
 */
export function cuentaComoGasto(t: Pick<Transaction, 'type' | 'debtId'>): boolean {
  return t.type === 'expense' && !t.debtId;
}

/**
 * Etiqueta de un pago de deuda para listados: «Pago de tarjeta · Visa»,
 * «Pago de préstamo · Auto» o «Pago de deuda eliminada». Un movimiento sin
 * `debtId` devuelve su concepto.
 */
export function etiquetaPago(t: Pick<Transaction, 'debtId' | 'concept'>, debts: Pick<Debt, 'id' | 'name' | 'kind'>[]): string {
  if (!t.debtId) return t.concept;
  const deuda = debts.find((d) => d.id === t.debtId);
  if (!deuda) return 'Pago de deuda eliminada';
  return `Pago de ${esTarjeta(deuda) ? 'tarjeta' : 'préstamo'} · ${deuda.name}`;
}

const porFechaDesc = (a: Transaction, b: Transaction) =>
  a.date === b.date ? (b.created_at ?? '').localeCompare(a.created_at ?? '') : b.date.localeCompare(a.date);

/**
 * Cuenta de origen con la que preseleccionar «Registrar pago»: la del último
 * pago enlazado de esa deuda (si la cuenta aún existe); si no, la primera
 * cuenta de tipo Banco; si no, la primera cuenta; sin cuentas, null.
 */
export function cuentaSugeridaParaPago(debt: Debt, expenses: Transaction[], accounts: Account[]): string | null {
  const ids = new Set(accounts.map((a) => a.id));
  const ultimo = expenses
    .filter((e) => e.debtId === debt.id && !!e.accountId && ids.has(e.accountId))
    .sort(porFechaDesc)[0];
  if (ultimo?.accountId) return ultimo.accountId;
  return (accounts.find((a) => a.kind === 'Banco') ?? accounts[0])?.id ?? null;
}

/**
 * Gastos de la categoría de pago de esta deuda que aún no están enlazados a
 * ninguna (registrados antes de `debtId`), del más reciente al más antiguo.
 * Se pueden vincular a mano sin tocar el saldo.
 */
export function gastosSinVincular(debt: Debt, expenses: Transaction[]): Transaction[] {
  const categoria = categoriaDePago(debt.kind);
  return expenses
    .filter((e) => e.type === 'expense' && !e.debtId && e.category === categoria)
    .sort(porFechaDesc);
}

/**
 * Lo que un pago descontó de verdad de su deuda. Descontar no es simétrico:
 * el saldo (y el pago de contado) nunca bajan de 0, así que un pago mayor que
 * lo que había descontó menos que su monto, y devolver el monto entero al
 * borrarlo dejaría la deuda más alta que antes. Por eso se guarda lo efectivo.
 *
 * Es estado LOCAL (`financeStore.descuentosDePago`, persistido pero no
 * sincronizado: no hay columna en BD). Sin entrada —dispositivo que no
 * registró el pago, dato anterior— se revierte el monto completo.
 */
export interface DescuentoPago {
  /** Lo que bajó `balance`. */
  balance: number;
  /** Lo que bajó `statementBalance`; ausente si la deuda no lo tenía. */
  statement?: number;
  /** Pago histórico enlazado a mano: ya estaba descontado, no mueve el saldo. */
  vinculado?: true;
}

export type DescuentosDePago = Record<string, DescuentoPago>;

/** Lo que descontaría hoy un pago de `monto` a esta deuda (acotado a 0). */
export function descuentoEfectivo(debt: Pick<Debt, 'balance' | 'statementBalance'>, monto: number): DescuentoPago {
  const tope = (saldo: number) => roundMoney(Math.max(0, Math.min(monto, saldo)));
  const d: DescuentoPago = { balance: tope(debt.balance) };
  if (debt.statementBalance !== undefined) d.statement = tope(debt.statementBalance);
  return d;
}

/**
 * Lo que devolvería a su deuda borrar este movimiento: su descuento efectivo
 * si se conoce, el monto entero si no, y 0 si es un pago vinculado a mano.
 * Sirve para avisar al usuario antes de borrar.
 */
export function montoQueRevierte(t: Pick<Transaction, 'id' | 'debtId' | 'amount'>, descuentos: DescuentosDePago): number {
  if (!t.debtId) return 0;
  const rec = descuentos[t.id];
  return rec ? rec.balance : t.amount;
}

/**
 * Aplica a las deudas el paso de `antes` a `despues` (los movimientos
 * afectados, no todos): primero revierte lo que descontaron los de `antes` y
 * luego descuenta los de `despues`, guardando lo efectivo de cada uno.
 *
 * Alta: antes = [], despues = [nuevo]. Borrado: al revés. Edición: [viejo] →
 * [nuevo], que cubre a la vez un cambio de monto y un cambio de deuda; si no
 * cambia ni la deuda ni el monto no toca nada.
 *
 * En una tarjeta con pago de contado conocido el pago también se descuenta de
 * él (y borrarlo lo devuelve). El saldo nunca baja de 0. Un movimiento
 * vinculado a mano (`vinculado`) no mueve el saldo: al editarlo conserva el
 * enlace, al quitarle `debtId` pierde la marca.
 */
export function aplicarCambioDePagos(
  debts: Debt[],
  descuentos: DescuentosDePago,
  antes: Transaction[],
  despues: Transaction[],
  ahora: string,
): { debts: Debt[]; descuentos: DescuentosDePago } {
  const sig: DescuentosDePago = { ...descuentos };
  const porId = new Map(debts.map((d) => [d.id, d]));
  const tocadas = new Set<string>();
  const cambiar = (id: string, balance: number, statement: number) => {
    const d = porId.get(id);
    if (!d) return;
    const n: Debt = { ...d, balance: roundMoney(d.balance + balance) };
    if (d.statementBalance !== undefined) n.statementBalance = roundMoney(d.statementBalance + statement);
    porId.set(id, n);
    tocadas.add(id);
  };

  const nuevos = new Map(despues.map((m) => [m.id, m]));
  const intactos = new Set<string>();
  for (const v of antes) {
    const n = nuevos.get(v.id);
    if (!v.debtId || !n) continue;
    const rec = descuentos[v.id];
    if (rec?.vinculado && n.debtId) {
      sig[v.id] = rec; // sigue siendo un pago vinculado, aunque cambie la deuda
      intactos.add(v.id);
    } else if (n.debtId === v.debtId && n.amount === v.amount) {
      intactos.add(v.id);
    }
  }

  for (const v of antes) {
    if (!v.debtId || intactos.has(v.id)) continue;
    const rec = descuentos[v.id];
    if (rec?.vinculado) {
      // Borrado: la marca se conserva para que deshacer no lo descuente. Edición
      // que le quita la deuda: la marca ya no tiene sentido.
      if (nuevos.has(v.id)) delete sig[v.id];
      continue;
    }
    delete sig[v.id];
    cambiar(v.debtId, rec ? rec.balance : v.amount, rec ? (rec.statement ?? 0) : v.amount);
  }
  for (const n of despues) {
    if (!n.debtId || intactos.has(n.id)) continue;
    // Deshacer el borrado de un pago vinculado a mano: sigue sin mover el saldo.
    if (descuentos[n.id]?.vinculado) continue;
    const d = porId.get(n.debtId);
    if (!d) continue;
    const ef = descuentoEfectivo(d, n.amount);
    sig[n.id] = ef;
    cambiar(n.debtId, -ef.balance, -(ef.statement ?? 0));
  }

  if (tocadas.size === 0) return { debts, descuentos: sig };
  return {
    debts: debts.map((d) => (tocadas.has(d.id) ? { ...porId.get(d.id)!, updated_at: ahora } : d)),
    descuentos: sig,
  };
}

export interface PagoDeDeuda {
  id: string;
  date: string;
  amount: number;
  accountId: string | null;
  /** Saldo de la deuda justo después de este pago (reconstruido). */
  saldoDespues: number;
}

export interface HistorialDeuda {
  pagos: PagoDeDeuda[]; // del más reciente al más antiguo
  totalPagado: number;
}

/**
 * Historial de una deuda a partir de sus movimientos enlazados.
 *
 * El saldo tras cada pago se reconstruye hacia atrás desde el saldo actual:
 * tras el último pago el saldo es el de hoy; antes de él, ese saldo más su
 * monto. Si el saldo se editó a mano entre pagos la serie lo absorbe en el
 * tramo más antiguo, que es lo razonable sin un registro de ediciones.
 */
export function historialDeuda(debt: Debt, expenses: Transaction[]): HistorialDeuda {
  const propios = expenses
    .filter((e) => e.debtId === debt.id)
    .sort((a, b) => (a.date === b.date ? (b.created_at ?? '').localeCompare(a.created_at ?? '') : b.date.localeCompare(a.date)));

  let saldo = debt.balance;
  const pagos: PagoDeDeuda[] = propios.map((e) => {
    const pago: PagoDeDeuda = {
      id: e.id,
      date: e.date,
      amount: e.amount,
      accountId: e.accountId ?? null,
      saldoDespues: roundMoney(saldo),
    };
    saldo += e.amount;
    return pago;
  });

  return { pagos, totalPagado: roundMoney(propios.reduce((s, e) => s + e.amount, 0)) };
}

/**
 * Enlaza a su deuda los pagos registrados antes de que existiera `debtId`:
 * los que creaba «Registrar pago» se llaman «Pago <nombre de la deuda>» y van
 * en una categoría de pago. Solo enlaza si el nombre identifica una única
 * deuda. NO toca saldos: esos pagos ya se habían descontado.
 */
export function enlazarPagosAntiguos(expenses: Transaction[], debts: Debt[], ahora: string): Transaction[] {
  const porNombre = new Map<string, Debt[]>();
  for (const d of debts) porNombre.set(d.name, [...(porNombre.get(d.name) ?? []), d]);
  return expenses.map((e) => {
    if (e.debtId || e.type !== 'expense' || !esCategoriaDePago(e.category)) return e;
    const nombre = e.concept.startsWith('Pago ') ? e.concept.slice(5) : null;
    const candidatas = nombre ? porNombre.get(nombre) : undefined;
    if (!candidatas || candidatas.length !== 1) return e;
    return { ...e, debtId: candidatas[0].id, updated_at: ahora };
  });
}
