# Specs

Borradores de especificación de features (`[nombre-feature].md`), según
`.agents/workflows/trabajo-dividido.md`. Una spec se escribe **antes** de
codificar una tarea grande y se conserva como registro de las decisiones.

| Spec | Estado |
|---|---|
| `error-reporter-sin-sentry.md` | Completada — `src/lib/error-reporter.ts`, migración `0008_error_log.sql` |
| `fase-3-estructura-balance-dual.md` | Completada — 3.0 a 3.8 en `main` (vistas, cuentas, deudas, patrimonio, presupuestos por categoría, ajustes, filtro por cuenta, widgets del resumen, metas con `saved`) |
| `fase-4-recurrentes-y-sistema-visual.md` | Completada — movimientos recurrentes (`0014_recurrences.sql`), `CardHeader` y contraste AA |
| `fase-5-sistema-diseno-y-movil.md` | Completada — recomendaciones del sistema de diseño, contraste AA restante y revisión móvil a 320–414px |
| `sync-saldo-deudas.md` | Implementada — saldo de deudas derivado de sus pagos (store v17, `0020_debts_saldo_base.sql`), anclaje confirmado por el usuario y `debtHistorico` sincronizado. Pendiente: retirar `descuentosDePago` cuando no quede ninguna deuda sin anclar; metas de ahorro en un spec aparte (`sync-aportes-metas.md`, §9); endurecer `hidratarAusentes` (`src/lib/merge.ts`) en general para que no rellene ninguna clave ausente sin mirar `updated_at` — el fix wave de integración cerró el caso concreto (`vincularPagoHistorico`/`desvincularPago`/`updateTransaction` con cambio de `debtId` ya quitan el id de `pendienteHidratar.expenses`), pero `hidratarAusentes` en sí sigue sin esa comprobación para cualquier otro campo; la actualización de `CLAUDE.md` propuesta en el reporte de la Task 8 del plan (reemplazar la descripción de la invariante de deudas en la sección de `financeStore.ts` por el texto que documenta el saldo derivado) sigue sin aplicarse — el spec (§7, Paso 6) exige confirmación explícita del usuario antes de tocar ese archivo |
