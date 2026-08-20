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
- **Exportación** — Reportes en PDF y Excel con previsualización, descarga directa y compartir por WhatsApp
- **Negocio vs Personal** — Cada transacción se etiqueta. El dashboard muestra la utilidad del negocio separada de tus finanzas personales
- **Categorías personalizadas** — Creá, edita y eliminá tus propias categorías de gasto e ingreso
- **Recordatorios de pago** — Alertas de vencimientos próximos para no pagar tarde
- **Modo oscuro** — Tema claro/oscuro con detección automática de la preferencia del sistema
- **PWA** — Se instala en el celular como una app nativa. Funciona offline con almacenamiento local
- **Nube** — Sincronización con Supabase. Si no hay conexión, sigue funcionando y sincroniza después

## Stack

React · TypeScript · Vite · TailwindCSS · Zustand · Supabase · Recharts

## Migración de Supabase (v2.1)

La v2.1 reemplaza el almacenamiento en blobs JSON de `profiles` por **tablas por entidad**
(`expenses`, `reminders`, `categories`, `savings_goals`, `budgets`) con RLS por fila
(`user_id = auth.uid()`) y `profiles` claveado por `id` (auth.uid).

**Orden de deploy (importante):**

1. Ejecutar `supabase/migrations/0001_entities_and_rls.sql` en el **SQL Editor** de Supabase (una sola vez).
   Crea las tablas, habilita RLS, migra `profiles` a `id uuid` y agrega el trigger de perfil automático.
2. Desplegar el código nuevo.

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

### Migración 0005 (claves compuestas)

`supabase/migrations/0005_composite_pks_and_date_index.sql` pasa `expenses`, `reminders`
y `savings_goals` a PK `(user_id, id)`, alineándolas con `categories`. Ejecutarla en el
SQL Editor **antes** de desplegar el código que la acompaña: los `onConflict` del cliente
ya usan `'user_id,id'`.

## Seguridad

- **RLS** en las seis tablas con `USING` y `WITH CHECK` (`auth.uid() = user_id`).
- **Cambio de contraseña con reautenticación**: exige la contraseña actual. Conviene
  además activar *Secure password change* en Supabase → Authentication → Providers.
- **Política de contraseñas** en `src/lib/password.ts` (mínimo 8 caracteres). El valor
  debe coincidir con el configurado en el panel de Supabase; el cliente solo da
  retroalimentación temprana, quien valida de verdad es el servidor.
- **CSP** estricto en `vercel.json`, con hash de script en vez de `unsafe-inline`.

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
