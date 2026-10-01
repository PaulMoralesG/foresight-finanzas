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
| `sync-saldo-deudas.md` | Implementada — saldo de deudas derivado de sus pagos (store v17, `0020_debts_saldo_base.sql`), anclaje confirmado por el usuario y `debtHistorico` sincronizado. Pendiente: retirar `descuentosDePago` cuando no quede ninguna deuda sin anclar; metas de ahorro en un spec aparte (`sync-aportes-metas.md`, §9); endurecer `hidratarAusentes` (`src/lib/merge.ts`) para que no rellene una clave ausente sin mirar `updated_at` — `migrateV17` amplió `pendienteHidratar` a todos los movimientos con `debtId`, así que un `desvincularPago` offline en la ventana entre actualizar a v17 y el primer ciclo completo de sync puede revivir `debtId`/`debtHistorico` desde el remoto y reentrar ese pago en el saldo de una deuda anclada |
