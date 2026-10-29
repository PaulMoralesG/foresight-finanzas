// ================================================================
// ESCENARIO — tarjeta de crédito: consumo del mes vs. pago de la tarjeta
// con el financeStore real (deuda anclada, gastos con método 'card').
// ================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useFinanceStore } from '@/stores/financeStore';
import { totalesDe } from '@/lib/totales';
import type { Transaction } from '@/types';

const estado = () => useFinanceStore.getState();

const gastoTarjeta = (amount: number, concept: string, date: string): Omit<Transaction, 'id' | 'created_at' | 'updated_at'> => ({
  type: 'expense',
  amount,
  concept,
  date,
  category: 'compras',
  method: 'card',
  businessType: 'personal',
  accountId: null,
  toAccountId: null,
});

const delMes = (mes: string) => estado().expenses.filter((e) => e.date.startsWith(mes));

describe('escenario: consumo mensual y pago de una tarjeta de crédito', () => {
  beforeEach(() => estado().reset());

  it('consumos cuentan como gasto sin tocar el saldo; el pago baja el saldo y no es gasto; borrarlo lo restaura', () => {
    // (a) deuda tipo tarjeta, anclada al nacer
    const id = estado().addDebt({
      name: 'Visa', tag: 'personal', kind: 'Tarjeta de crédito',
      balance: 1000, annualRate: 30, minPayment: 50, payDay: 10,
    });
    expect(estado().debts[0]).toMatchObject({ balance: 1000, saldoBase: 1000 });

    // (b) tres consumos con tarjeta en septiembre, sin cuenta
    estado().addTransaction(gastoTarjeta(100, 'Supermercado', '2026-09-03'));
    estado().addTransaction(gastoTarjeta(250.5, 'Gasolina', '2026-09-12'));
    estado().addTransaction(gastoTarjeta(49.5, 'Streaming', '2026-09-20'));

    expect(estado().expenses).toHaveLength(3);
    expect(totalesDe(delMes('2026-09')).gastos).toBe(400);
    // Los consumos no están enlazados a la deuda: su saldo no se mueve
    expect(estado().debts[0].balance).toBe(1000);

    // (c) pago de la tarjeta (transferencia con debtId, sin cuenta de origen)
    estado().registerDebtPayment(id, { amount: 300, date: '2026-09-25', accountId: null });
    const pago = estado().expenses.find((e) => e.debtId === id);
    expect(pago).toBeDefined();
    expect(estado().debts[0].balance).toBe(700);
    // El pago no suma al gasto del mes (sigue 400, no 700)
    expect(totalesDe(delMes('2026-09')).gastos).toBe(400);

    // (d) borrar el pago restaura el saldo
    estado().deleteTransaction(pago!.id);
    expect(estado().debts[0].balance).toBe(1000);
    expect(totalesDe(delMes('2026-09')).gastos).toBe(400);
    expect(estado().expenses).toHaveLength(3);
  });
});
