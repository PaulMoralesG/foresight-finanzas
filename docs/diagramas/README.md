# Diagramas del proyecto

Diagramas interactivos de Foresight Finanzas, generados con archify el
2026-10-29 a partir del código (commit `452542b`) y de las migraciones de
`supabase/migrations/`, **no de la base de datos viva**.

Cada HTML es autónomo (sin recursos externos). Para verlos, abre
`index.html` con doble clic: agrupa los siete diagramas en pestañas.

| Archivo | Qué muestra |
| --- | --- |
| `arquitectura.html` | Capas de la app: UI, stores, lógica pura, sync y Supabase. |
| `estado-stores.html` | Los tres stores de Zustand y sus acciones e invariantes. |
| `sync-supabase.html` | Ciclo de sincronización: pull, merge, push, tombstones. |
| `sesion-auth.html` | Arranque de sesión, login y modo offline. |
| `modelo-datos.html` | Tablas de Supabase y sus relaciones (ERD). |
| `flujo-movimiento.html` | Qué ocurre al guardar un movimiento (deudas, saldos, sync). |
| `flujo-recurrencias-respaldo.html` | Materialización de recurrencias y respaldo/restauración. |

## Limitaciones conocidas

- `profiles` aparece sin las columnas de email, `first_name` y `last_name`
  (no se pudieron tipar desde las migraciones).
- Se omitieron 10 líneas `user_id` → `auth.users` para no saturar el ERD; una
  tarjeta del diagrama lo explica.
- Las relaciones son lógicas, no claves foráneas reales.
- El índice con pestañas (`index.html`) es manual: no lo genera archify.

## Mantenimiento

Reflejan la arquitectura en el commit indicado. Hay que regenerarlos cuando
cambie la arquitectura (stores, sync, esquema). No se despliegan: `docs/` no
forma parte de `public/` ni de `src/`.
