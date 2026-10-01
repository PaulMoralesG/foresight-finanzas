---
tipo: mapa
tags: [mapa, arquitectura, logica-de-negocio, calculos]
fecha: 2026-09-30
---

# Lógica de negocio pura (`src/lib/`)

> Página de tipo **mapa** (derivada de `src/lib/*.ts` y del `CLAUDE.md` raíz).
> Puede quedar desactualizada si el código cambia — revisar en cada lint.

Volver a [[mapa-del-proyecto]].

Cada cálculo portado de la referencia Balance Dual es una función pura (sin
React ni Supabase) con su propio archivo de test en `src/__tests__/`, escrito
antes que la UI. **Regla**: la aritmética nueva va aquí, no dentro de una
página.

| Módulo | Qué resuelve | Funciones principales |
|---|---|---|
| `src/lib/accounts.ts` | Saldo por cuenta y total, transferencias | `accountBalance`, `totalBalance`, `accountIsUsed`, `TRANSFER_CATEGORY` |
| `src/lib/debts.ts` | Proyección de pago de deudas: *snowball* (saldo menor primero) o *avalanche* (interés más alto primero) | `projectDebts`, `totalDebt`, `monthlyDebtPayment`, `payoffDate` |
| `src/lib/debt-balance.ts` | Anclaje de deudas y el saldo derivado de una deuda anclada (desde el PR #33) | `recalcularSaldos`, `anclarDeuda`, `rebasarDeuda`, `estaAnclada`, `saldoDerivado` |
| `src/lib/networth.ts` | Patrimonio actual e histórico de cierres mensuales | `netWorthNow`, `netWorthHistory`, `needsSnapshot` |
| `src/lib/budget-lines.ts` | Plan vs. real por categoría, reporte anual, migración del presupuesto global viejo | `planFor`, `actualFor`, `budgetStatus`, `groupSummary`, `annualReport`, `convertGlobalBudgets` |
| `src/lib/goals.ts` | Metas de ahorro: meses restantes, aporte mensual, atraso | `goalMath`, `isGoalLate`, `goalTotals` |
| `src/lib/month-keys.ts` | Helpers de claves `YYYY-MM` | `shiftMonthKey`, `currentMonthKey`, `mesDeLaVista`, `filtrarPorMes` |

Módulos puros vecinos que el store usa para sus invariantes (ver
[[stores-zustand]]):

- `src/lib/debt-payments.ts` — un movimiento con `debtId` es un pago. Para una
  deuda **sin anclar**, `aplicarCambioDePagos` ajusta el `balance` por delta
  directo; `historialDeuda` arma el historial de pagos por deuda en ambos
  casos (deuda anclada o no). Para una deuda **anclada**
  (`saldoBase`/`contadoBase` definidos), el saldo ya no lo mueve este módulo:
  lo deriva `recalcularSaldos` en `src/lib/debt-balance.ts`, excluyendo los
  pagos marcados `debtHistorico` (ver [[stores-zustand]]).
- `src/lib/recurrence.ts` — `fechasPendientes`, `proximaFecha`: qué
  ocurrencias toca generar.
- `src/lib/ids.ts` — `newId`, `nowIso`, `uuidv5` (ids deterministas, usados
  también por el import legacy en [[sync-y-autenticacion]]).

## Relacionado

- [[testing]] — cada módulo tiene su `*.test.ts`.
- [[stores-zustand]] — dónde se aplican estos cálculos al estado.
