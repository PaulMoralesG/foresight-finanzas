# Fase 3 — Foresight con la estructura de Balance Dual

## Objetivo
Que Foresight quede organizado como `D:\ProyectosIA\balance-dual\index.html`:
8 vistas en 2 secciones, y las entidades que lo hacen posible (cuentas,
deudas, patrimonio, presupuesto por categoría), conservando lo que Foresight
ya tiene y la referencia no: login, sync con Supabase, RLS, tests y CI.

Decisiones tomadas (2026-09-21):
- **Estadísticas se reparte**: gráfico y tarjetas de periodo → Resumen;
  matriz anual → "Reporte anual" en Presupuestos; PDF/CSV siguen en el
  Reporte mensual (MonthNav). El filtro por rango de fechas se pierde.
- **Orden**: estructura → Cuentas → Deudas → Patrimonio → Presupuestos.
- **Móvil**: 4 pestañas (Resumen · Movimientos · Presupuestos · Patrimonio)
  + "Más" (hoja con Deudas, Metas, Cuentas, Ajustes).

## Mapa de vistas

| Sección | Vista | id | Estado hoy |
|---|---|---|---|
| Día a día | Resumen | `home` | existe (absorbe Estadísticas) |
| Día a día | Movimientos | `movements` | existe (+cuenta, transferencias en 3.1) |
| Día a día | Presupuestos | `budgets` | nueva (3.0: presupuesto global actual; 3.4: por categoría) |
| Patrimonio | Deudas | `debts` | nueva (3.2) |
| Patrimonio | Metas | `goals` | existe como parte de Planes (3.0 la separa) |
| Patrimonio | Patrimonio | `networth` | nueva (3.3) |
| Patrimonio | Cuentas | `accounts` | nueva (3.1) |
| Patrimonio | Ajustes | `settings` | existe como Perfil (3.0 renombra; 3.5 completa) |

Ids persistidos en `localStorage['foresight-active-tab']`: `stats`→`home`,
`savings`→`goals`, `profile`→`settings` (migración al leer).

## Pasos (un commit cada uno, cuatro comprobaciones en verde)

### 3.0 Estructura
- `TabId` con los 8 ids; `VIEWS` con sección, etiqueta e icono en un solo
  sitio (`src/config/views.ts`), que consumen Sidebar y TabBar.
- Sidebar: cabeceras de sección como Balance Dual ("Día a día", "Patrimonio").
- TabBar: 4 + "Más" → `ModalSheet` con las 4 restantes.
- Resumen absorbe de Estadísticas: `TrendChart`, tarjetas Ingresos/Gastos/
  Saldo/Negocio con comparación vs. mes anterior, gastos por categoría, mayor
  gasto, día pico. Se elimina `StatsPage` y `useStatsPeriod` pasa a servir al
  mes visible (`currentViewDate`).
- `SavingsPage` (Planes) se parte: metas → `GoalsPage`; presupuesto global →
  `BudgetsPage` (provisional hasta 3.4).
- `ProfilePage` → `SettingsPage` (mismo contenido; secciones nuevas en 3.5).
- Deudas, Patrimonio y Cuentas: página con `EmptyState` que dice qué llega.
- Tests: `stats-page.test` → `home-page.test` (mismas aserciones de periodo);
  `savings-page.test` → `goals-page.test`; nav: TabBar muestra 4 + Más, la
  hoja lista las 4 restantes; migración de ids persistidos.

### 3.1 Cuentas
- Referencia: `state.accounts`, `accountBalance()`, `viewCuentas()`.
- `Account { id, name, kind: 'Efectivo'|'Banco'|'Tarjeta'|'Otro', initialBalance, updated_at }`.
- `Transaction.accountId?`, `Transaction.toAccountId?`, `Transaction.kind?: 'transfer'`
  (una transferencia mueve saldo entre cuentas sin contar como gasto/ingreso).
- Migración `0009_accounts.sql`: tabla `accounts` (PK `user_id,id`, RLS
  `(select auth.uid())`, trigger `keep_newest`, `grant` explícito por la 0004)
  + columnas `account_id`, `to_account_id`, `kind` en `expenses`.
- Store v9 con `migrate`; `merge.ts` y `sync.ts` con la entidad nueva.
- `lib/accounts.ts` con `accountBalance()` y tests ANTES de la UI.
- Página Cuentas (lista con saldo, alta/edición, cuenta desplegable con sus
  movimientos) + selector de cuenta y modo transferencia en TransactionModal.

### 3.2 Deudas
- `Debt { id, name, tag, kind, balance, annualRate, minPayment, payDay, updated_at }`.
- `lib/debts.ts#projectDebts(debts, extra, method)` portado y testeado primero:
  una deuda sola, tres con aporte extra, interés cero, deuda ya saldada, plan
  que no cierra.
- Migración `0010_debts.sql`, store v10, merge, sync, página (KPIs, orden de
  pago, curva "Rumbo a cero" en SVG, comparación snowball/avalanche).
- Settings: `debtMethod`, `extraPayment` (columnas en `profiles`).

### 3.3 Patrimonio
- `Asset { id, name, kind, value, updated_at }`; `NetWorthSnapshot { month, assets, debts, net }`.
- `netWorthNow()` = cuentas + activos − deudas; `syncNetWorth()` guarda el
  cierre del mes anterior al abrir la app en un mes nuevo.
- Migración `0011_assets_networth.sql`, store v11, merge, sync, página con
  curva histórica (SVG) y meta de patrimonio (`settings.netWorthGoal`).

### 3.4 Categorías con grupo + Presupuestos
- `Category` gana `group` y `tag` (personal/negocio) y opcionalmente
  `payDay`/`accountId`. Las categorías por defecto se reagrupan como en
  `DEFAULT_CATEGORIES` de la referencia.
- `Budget` pasa de `{ month: amount }` a filas `{ id, month, categoryId, kind, limit }`.
  **Migración de estado persistido primero, con test**: el presupuesto global
  de cada mes se convierte en un reparto por categoría (proporcional al gasto
  real de ese mes; si no hay gasto, todo a "Sin asignar").
- Migración `0012_budgets_by_category.sql` (tabla nueva `budget_lines`,
  `budgets` se conserva hasta confirmar la migración de datos).
- Página Presupuestos: Este mes (presupuestado vs. real por grupo), Plan 12
  meses, Reporte anual (matriz categoría × 12 meses).

### 3.5 Ajustes
- Exportar/Importar JSON completo, meta de patrimonio, método de deuda y
  aporte extra, borrar datos locales; lo de Perfil (cuenta, contraseña) sigue.

## Reglas de cada entidad (del PLAN.md)
Tipo en `src/types/index.ts` → migración SQL con RLS siguiendo la 0007 →
estado y acciones en `financeStore.ts` (subir `version` + `migrate`) →
`merge.ts` + `sync.ts` → pantalla. Tests de la aritmética antes de la UI.
`npx tsc --noEmit && npx eslint . && npx vitest run && npx vite build`.
