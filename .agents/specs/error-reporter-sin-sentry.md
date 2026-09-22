# Fase 2.1 — Quitar Sentry, reportador propio a Supabase

## Objetivo
Eliminar `@sentry/react` (156 KB gzip diferidos, el chunk más pesado de la app)
y sustituirlo por un reportador mínimo que inserte los errores en una tabla
`error_log` de Supabase. Sin telemetría de rendimiento ni replay: solo errores.

## Qué hace Sentry hoy (y qué se conserva)
| Comportamiento actual | Con el reportador propio |
|---|---|
| `main.tsx`: `Sentry.init` diferido tras el primer render, solo en PROD; captura `window.onerror` y `unhandledrejection` | `initErrorReporter()` en PROD: registra `error` y `unhandledrejection` en `window`. Sin diferir: son dos listeners, no un chunk |
| `ErrorBoundary.componentDidCatch`: `captureException` con `componentStack`, solo PROD | `reportarError(error, { tag: 'render', componentStack })` |
| `sync.ts#reportarErrorSync`: `captureException` con tag `sync_failure`, solo PROD | `reportarError(err, { tag })` con los mismos tags (`reintentos-agotados`, `esquema-no-migrado`, `attach-fallo`) |
| Tracing 10 %, Replay enmascarado | **Se pierde.** No tiene equivalente y no era el objetivo |
| Dedupe de eventos repetidos | Set de huellas `tag+mensaje` por sesión; cupo de 20 envíos por sesión |

## Módulo `src/lib/error-reporter.ts`
- `reportarError(err: unknown, ctx?: { tag?: string; componentStack?: string }): void`
  - No-op si `!import.meta.env.PROD`, si `supabase` es `null`, o si no hay sesión
    (RLS solo permite insert a `authenticated`; en offline no hay a quién atribuirlo).
  - Nunca lanza ni devuelve promesa rechazada: un fallo al reportar no puede
    tumbar la app. `try/catch` con `unknown`.
  - Normaliza: `Error` → `message`/`stack`; string → mensaje; otro → `String(err)`.
    Recorta mensaje a 1 000 y stack a 8 000 caracteres (el CHECK de la tabla lo
    exige, y así no se manda un stack de megabytes por un bucle).
  - Fila: `{ user_id, message, stack, tag, url, user_agent, app_version, context }`.
    `context` = `{ componentStack }` cuando existe.
- `initErrorReporter(): void` — instala los listeners globales (idempotente).

## Migración `0008_error_log.sql`
```
create table public.error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (length(message) <= 1000),
  stack text check (length(stack) <= 8000),
  tag text check (length(tag) <= 64),
  url text check (length(url) <= 2048),
  user_agent text check (length(user_agent) <= 512),
  app_version text check (length(app_version) <= 32),
  context jsonb
);
```
- RLS habilitado. Política **solo de insert** para `authenticated` con
  `with check ((select auth.uid()) = user_id)`.
- `grant insert on public.error_log to authenticated` — obligatorio: la 0004
  revocó los privilegios por defecto a `anon, authenticated` en tablas nuevas.
- **Sin política ni grant de select**: nadie lee por la API. "Select solo para mí"
  = desde el SQL Editor / dashboard de Supabase (rol `postgres`, salta RLS).
  Si algún día se quiere ver desde la app, se añade una política con el uid
  del administrador; hoy no hace falta y evita hardcodear un id en el repo.
- Índice por `created_at` para purgar/consultar por fecha.

## Limpieza
- `package.json`: quitar `@sentry/react`.
- `vite.config.ts`: quitar `'vendor-monitoring'` de `manualChunks` y de
  `globIgnores`; actualizar el comentario de pesos.
- `vercel.json`: quitar `https://*.ingest.sentry.io https://*.ingest.us.sentry.io`
  del `connect-src`.
- `.env.example`, `vite-env.d.ts`, `README.md`, `CLAUDE.md`: quitar
  `VITE_SENTRY_*` y la mención a Sentry; documentar la 0008 en la tabla de
  migraciones del README.

## Tests (`src/__tests__/error-reporter.test.ts`)
Mock de `@/config/supabase` con `vi.hoisted` + accessor `get`, como en
`sync.test.ts`. `vi.stubEnv('PROD', true)` para pasar la puerta.
1. Sin PROD → no llama a `from`.
2. `supabase === null` → no-op.
3. Sin sesión → no-op.
4. Con sesión: `from('error_log').insert(fila)` con `user_id`, `message`,
   `stack`, `tag`, `url`, `user_agent`, `context.componentStack`.
5. Recorta mensaje/stack a los límites.
6. Dedupe: mismo error dos veces → un solo insert.
7. Si `insert` rechaza → no lanza.
8. `initErrorReporter`: `window.dispatchEvent(new ErrorEvent('error', …))` y
   `unhandledrejection` disparan un insert cada uno.

## Verificación
`npx tsc --noEmit && npx eslint . && npx vitest run && npx vite build && npm run peso`.
Esperado: carga inicial ≈ 112 KB (sin cambio), diferido 525 → ≈ 369 KB
(desaparece `vendor-monitoring`).
