# Foresight Finanzas

> Control financiero simple para emprendedores. Separa tus finanzas personales de tu negocio, ve tu crecimiento mes a mes.

## ¿Por qué nace?

Muchos emprendedores mezclan sus finanzas personales con las de su negocio porque no existe una herramienta pensada **específicamente para esa dualidad**. Terminan usando hojas de cálculo complicadas, apps genéricas que no distinguen entre lo personal y lo empresarial, o peor aún: no llevan control alguno.

**Foresight Finanzas** resuelve eso. Te permite registrar cada movimiento clasificándolo como *Personal* o *Negocio*, y automáticamente calcula la **utilidad real de tu emprendimiento** — ingresos menos gastos del negocio, margen, y comparación mes a mes.

Todo desde una sola app, instalable en tu celular, que funciona incluso sin conexión.

## Qué incluye

- **Dashboard** — Saldo del mes, ingresos vs gastos, presupuesto configurable y top de categorías
- **Movimientos** — Alta, edición y baja de transacciones. Filtros por tipo, categoría, negocio/personal y búsqueda libre
- **Estadísticas** — Gráfica de tendencia 6 meses, distribución por categoría, día de mayor gasto y promedio diario
- **Exportación** — Reportes en PDF y Excel, ordenados cronológicamente. El PDF sale del diálogo de impresión del navegador ("Guardar como PDF"), con una hoja de estilos de impresión propia; el Excel (CSV) se descarga como archivo en escritorio y en móvil abre el menú nativo para guardar o compartir (WhatsApp, Archivos, AirDrop)
- **Negocio vs Personal** — Cada transacción se etiqueta. El dashboard muestra la utilidad del negocio separada de tus finanzas personales
- **Categorías personalizadas** — Creá, edita y eliminá tus propias categorías de gasto e ingreso
- **Modo oscuro** — Tema claro/oscuro con detección automática de la preferencia del sistema
- **PWA** — Se instala en el celular como una app nativa. Funciona offline con almacenamiento local
- **Nube** — Sincronización con Supabase. Si no hay conexión, sigue funcionando y sincroniza después

## Stack

React · TypeScript · Vite · TailwindCSS · Zustand · Supabase

## Desarrollo local

**Requisitos:** Node 22 (la versión que usa CI, ver `.github/workflows/ci.yml`) y npm.

```bash
git clone https://github.com/PaulMoralesG/foresight-finanzas.git
cd foresight-finanzas
npm ci
npm run dev
```

Con eso ya funciona: la app arranca en modo offline-first (usuario local, sin
login) aunque no exista ningún `.env`. Solo hacen falta variables de entorno
para conectar Supabase (sincronización en la nube y registro de errores) —
copiá `.env.example` a `.env` y completá lo que necesites:

| Variable | Para qué | Obligatoria |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` | Sincronización con Supabase y registro de errores de producción en `error_log` | No — sin ellas, la app corre 100% local |

Si configurás Supabase, hay que aplicar las migraciones de `supabase/migrations/`
antes de desplegar — ver la sección siguiente.

**Scripts:**

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Build de producción (`dist/`) — **no** type-checka por su cuenta |
| `npm run preview` | Sirve el build de producción localmente |
| `npm run lint` | ESLint |
| `npm run test` | Suite completa de tests (Vitest, una pasada) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests con reporte de cobertura |
| `npx tsc --noEmit` | Type-check (no está en `package.json`; correrlo aparte) |

**Despliegue:** Vercel, automático en cada push a una rama con PR abierto
(preview) y en cada merge a `main` (producción) — configuración en
`vercel.json`. CI (`.github/workflows/ci.yml`) corre type-check, lint, tests
y build en cada push/PR contra `main`.

## Migración de Supabase (v2.1)

La v2.1 reemplaza el almacenamiento en blobs JSON de `profiles` por **tablas por entidad**
(`expenses`, `categories`, `savings_goals`, `budgets`) con RLS por fila
(`user_id = auth.uid()`) y `profiles` claveado por `id` (auth.uid).

**Orden de deploy (importante):**

Las migraciones se ejecutan **en orden numérico** en el *SQL Editor* de Supabase, una sola
vez cada una. Para un entorno nuevo hay que aplicarlas todas:

| Archivo | Qué hace | Cuándo |
|---|---|---|
| `0001_entities_and_rls.sql` | Crea las tablas, habilita RLS, migra `profiles` a `id uuid` y añade el trigger de perfil automático | Antes de desplegar |
| `0002_fix_categories_pk_and_trigger.sql` | PK compuesta en `categories` y metadata de nombre/apellido en el trigger | Antes de desplegar |
| `0003_drop_legacy_profile_blobs.sql` | Elimina los blobs JSON de `profiles` | **Solo** tras verificar que no queda ningún import pendiente (la consulta está en el propio archivo) |
| `0004_keep_newest_triggers.sql` | Trigger `keep_newest`: el servidor rechaza escrituras más viejas que la fila actual | Antes de desplegar |
| `0005_composite_pks_and_date_index.sql` | PK compuesta en `expenses`, `reminders` y `savings_goals` + índices por fecha | **Antes** de desplegar (el cliente ya usa `onConflict: 'user_id,id'`) |
| `0006_drop_reminders_and_fix_profile_timestamps.sql` | Elimina la tabla `reminders` y unifica los timestamps de `profiles` a `timestamptz` | **Después** de desplegar (el cliente nuevo ya no consulta `reminders`) |
| `0007_rls_perf_and_security_hardening.sql` | RLS con `(select auth.uid())`, `search_path` fijo en `keep_newest`, revoca `EXECUTE` público de `handle_new_user`, y versiona dos `CHECK` + un índice que ya estaban aplicados a mano en producción | Cualquier momento (no rompe compatibilidad con ningún cliente) |
| `0008_error_log.sql` | Tabla `error_log` donde el cliente registra los errores de producción (sustituye a Sentry). RLS: insert del usuario autenticado sobre su propio `user_id`; sin select por la API — se consulta desde el SQL Editor | **Antes** de desplegar (si no, el cliente nuevo intenta insertar en una tabla que no existe; el fallo se traga, pero no se registra nada) |
| `0009_accounts.sql` | Tabla `accounts` (cuentas: efectivo, banco, tarjeta, ahorros) con RLS, grant y trigger `keep_newest`; columnas `account_id`/`to_account_id` en `expenses` y el tipo `transfer` en su `CHECK` | **Antes** de desplegar (el cliente nuevo hace pull de `accounts`; sin la tabla cae a modo local-only) |
| `0010_debts_and_settings.sql` | Tablas `debts` (deudas: saldo, interés, mínimo, día de pago) y `settings` (una fila por usuario: método de deuda, aporte extra, meta de patrimonio), con RLS, grant y `keep_newest` | **Antes** de desplegar (el cliente hace pull de ambas) |

Fíjate en el orden de la `0005` y la `0006`: una va antes del deploy y la otra después.
Invertirlo deja al cliente pidiendo algo que ya no existe, o escribiendo con una clave
que aún no está.

**Migración de datos automática:** en el primer login post-migración, el cliente importa
los blobs JSON legacy a las tablas nuevas **una sola vez** (ids UUID v5 deterministas — el
import es idempotente) y limpia los blobs. Si el SQL no se ejecutó, la app sigue funcionando
en modo local-only y lo indica en consola.

**Sync:** pull-then-push con merge determinista por fila (`updated_at` más nuevo gana;
borrados lógicos con `deleted_at` para propagar eliminaciones sin resurrecciones).
Flush automático en `pagehide` / `visibilitychange` / `online` y antes de cerrar sesión.

El **push es incremental**: solo viajan las filas modificadas desde el último push
confirmado. El **pull sigue siendo completo** a propósito — leer de menos dejaría al
cliente con un snapshot parcial y el merge podría interpretar filas ausentes como
inexistentes. Cada login fuerza un push completo que reconcilia cualquier divergencia.

### Recordatorios de pago (retirados en la 0006)

Existió una tabla `reminders` con su lógica de store, pero **ninguna pantalla llegó a
usarla**: solo estaba cableado el lado de lectura (un badge y un aviso), así que no había
forma de crear un recordatorio. Mientras tanto costaba tabla, RLS, índice, tombstones y un
viaje de ida y vuelta en cada sincronización.

No se retiró por considerarla una mala función —los avisos de vencimiento son estándar en
la categoría—, sino porque una versión inalcanzable no compensa su coste. Si se retoma,
el diseño correcto son gastos recurrentes con aviso real (notificaciones push), no lo que
había. El código sigue en el historial de git.

## Seguridad

- **RLS** en las cinco tablas con `USING` y `WITH CHECK` (`auth.uid() = user_id`).
- **Cambio de contraseña con reautenticación**: exige la contraseña actual. Conviene
  además activar *Secure password change* en Supabase → Authentication → Providers.
- **Política de contraseñas** en `src/lib/password.ts` (mínimo 8 caracteres). El valor
  debe coincidir con el configurado en el panel de Supabase; el cliente solo da
  retroalimentación temprana, quien valida de verdad es el servidor.
- **CSP** estricto en `vercel.json`, con hash de script en vez de `unsafe-inline`.
- **Cierre por inactividad**: 30 minutos sin interacción cierran la sesión, con aviso
  60 segundos antes (`src/hooks/useIdleLogout.ts`). `persistSession` + `autoRefreshToken`
  mantenían la sesión viva indefinidamente: una pestaña abierta en un portátil prestado
  seguía autenticada semanas después. El cierre hace flush del sync antes de invalidar el
  token, así que no se pierde ningún cambio pendiente, y borra la copia local.

### Datos locales sin cifrar (decisión consciente)

El historial financiero se persiste en `localStorage` en texto plano, bajo
`foresight-finance-storage`. Es el compromiso que exige el modo offline-first: cifrarlo
de verdad requeriría una clave derivada de la contraseña, que no está disponible sin
conexión ni tras recargar la página.

La mitigación es que **cerrar sesión borra la copia local** (`persist.clearStorage()` en
las tres rutas de cierre), que es lo que impide que la siguiente cuenta que inicie sesión
en el mismo navegador vea datos ajenos. Queda el residuo de quien cierra la pestaña sin
desloguear: los datos siguen en disco, legibles por cualquier extensión del navegador.

Si el producto pasa a manejar datos de terceros, esto hay que revisarlo.

## Licencia

MIT
