---
tipo: mapa
tags: [mapa, arquitectura, estado, zustand]
fecha: 2026-09-30
---

# Stores de Zustand

> Página de tipo **mapa** (derivada de `src/stores/` y del `CLAUDE.md` raíz).
> Puede quedar desactualizada si el código cambia — revisar en cada lint.

Volver a [[mapa-del-proyecto]].

Tres stores, cada uno con una sola responsabilidad.

## `src/stores/authStore.ts`

El más chico: `user` (o `null`), `isLoading` (arranca en `true`) y tres
setters. No persiste nada. Lo alimenta `useAuthSession()` — ver
[[sync-y-autenticacion]].

## `src/stores/financeStore.ts`

Todos los datos financieros: movimientos (`expenses`, incluidas las
transferencias entre cuentas), `accounts`, `debts`, `assets`, `networth`
(cierres mensuales), `budgetLines` (presupuesto por categoría + plan anual),
`recurrences`, `savingsGoals`, `settings`, categorías personalizadas y
`tombstones` (id → `deleted_at`, para propagar borrados por el sync). También
estado de vista: mes actual, filtro y el **ámbito** global (Todo / Personal /
Negocio).

- **Persistencia**: middleware `persist` en `localStorage`, clave
  `foresight-finance-storage`, **sin cifrar a propósito** (ver README). El
  logout la borra.
- **Versionado**: hoy `version: 16`. Cada cambio de forma sube la versión y
  añade un paso `migrateVn` en la tabla `MIGRACIONES`; cada paso corre solo si
  la versión persistida es anterior (re-aplicar no es inocuo). Si una
  migración falla, se guarda el estado crudo en
  `foresight-finance-storage.backup` y se arranca vacío.
- **Campos que se persisten pero no se sincronizan**: `descuentosDePago`,
  `pendienteHidratar`. El campo legacy `budgets` se conserva solo para que
  clientes viejos sigan sincronizando.

### Invariantes de negocio (viven en el store, no en las páginas)

- `deleteAccount` no hace nada mientras `accountIsUsed()` sea verdadero: la
  cuenta es origen o destino de algún movimiento **o de alguna recurrencia**
  (desde la auditoría del 2026-09-30; antes una recurrencia seguía generando
  movimientos con un `accountId` huérfano que ningún saldo sumaba).
- Un movimiento con `debtId` *es* un pago de esa deuda: toda acción sobre
  movimientos y `registerDebtPayment` ajustan el `balance` de la deuda en el
  mismo `set()`, vía `src/lib/debt-payments.ts` (ver
  [[logica-de-negocio-pura]]).
- `materializarRecurrencias()` convierte recurrencias vencidas en
  movimientos. Es idempotente: el id de cada ocurrencia es un UUID v5 de
  `recurrencia:<id>:<fecha>`, se saltan los ids con tombstone y la marca
  `ultimaGenerada` avanza en el mismo `set()`. Se llama **solo** desde
  `src/components/layout/AppLayout.tsx` (al montar y en `visibilitychange`),
  nunca desde un efecto que dependa de `expenses`/`recurrences` — escribe en
  ambos, sería un bucle de render. Con Supabase espera a
  `uiStore.primerSyncCompleto`.

## `src/stores/uiStore.ts`

Tema (dark mode), pestaña activa (guardada a mano en `localStorage` como
`foresight-active-tab` y normalizada con `normalizarTabId`), modales, toasts,
conectividad y el estado de sync (`idle | syncing | error | local-only`), que
escribe `syncService`, no un componente. También las banderas
`primerSyncCompleto` y `cierreConPendientes`. Sin middleware `persist`.

## Relacionado

- [[sync-y-autenticacion]] — quién lee y escribe el `financeStore` desde el remoto.
- [[navegacion-y-code-splitting]] — cómo `activeTab` elige la vista.
- [[testing]] — cómo mockear módulos que envuelven stores singleton.
