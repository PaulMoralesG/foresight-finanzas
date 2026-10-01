---
tipo: mapa
tags: [mapa, arquitectura, sync, supabase, auth]
fecha: 2026-09-30
---

# Sync y autenticación

> Página de tipo **mapa** (derivada de `src/lib/sync.ts`, `src/lib/merge.ts`,
> `src/lib/legacy-import.ts`, `src/hooks/useAuth.ts` y del `CLAUDE.md` raíz).
> Puede quedar desactualizada si el código cambia — revisar en cada lint.

Volver a [[mapa-del-proyecto]].

## Dos modos de funcionamiento

- **Offline** (sin `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY`,
  `supabaseAvailable === false` en `src/config/supabase.ts`): la app corre como
  un único `OFFLINE_USER` contra la persistencia local del
  [[stores-zustand|financeStore]]. Es un modo de primera clase, no un
  fallback degradado.
- **Con Supabase**: el motor de sync descrito abajo.

## Los dos hooks de `src/hooks/useAuth.ts`

- `useAuthSession()` — el efecto de arranque de sesión. Se monta **una sola
  vez**, en `src/App.tsx`; un contador avisa en desarrollo si se monta dos
  veces. Montarlo en otro sitio reinicia el ciclo de sesión completo (con
  Supabase: import legacy + pull + merge + push forzado).
- `useAuth()` — estado y acciones (`signIn`, `signOut`, `saveData`,
  `updateProfile`…), sin efectos, seguro en cualquier componente.
  `signOut()` hace `flush()` antes de borrar el estado local; si no pudo subir
  todo, abre el diálogo `cierreConPendientes` del [[stores-zustand|uiStore]].
  "Subido" es `syncService.adjuntado() && flush()`, y `adjuntado()` es falso
  sin usuario **y también en modo `local-only`**: ahí `flush()` resuelve
  `true` sin subir nada, y antes el cierre borraba datos que solo existían en
  el dispositivo.

## Motor de sync — `src/lib/sync.ts`

Singleton `syncService`, inicializado una vez en `src/main.tsx`
(`syncService.init()`).

- **Pull-then-push** con merge por fila; debounce de 800 ms, single-flight
  (un solo ciclo en vuelo, el siguiente se encola), reintentos con backoff.
- **Auto-save**: se suscribe al `financeStore` y agenda un push cuando cambia
  cualquier colección sincronizada.
- **Incremental con marca de agua**: la marca es el inicio del último ciclo
  confirmado, por usuario (`foresight-sync-watermark:<uid>` en
  `localStorage`). Push sube filas con `updated_at >= marca`; pull baja desde
  `marca − 5 min` (margen para relojes desfasados).
- **Ciclos completos** (red de seguridad): `attach` (login), volver a la
  pestaña (`visibilitychange → visible`) y el evento `online`. `pagehide` y
  ocultar la pestaña hacen flush incremental.
- `flush()` resuelve solo cuando no queda nada en vuelo ni agendado.
- Si el esquema de Supabase no está migrado, pasa a `local-only`.

## Merge — `src/lib/merge.ts`

Funciones puras (`mergeById`, `mergeBudgets`, `hidratarAusentes`). Gana la
marca más nueva (`updated_at` del item vivo o `deleted_at` del tombstone);
empates exactos se resuelven por serialización canónica. Un tombstone más
nuevo propaga el borrado; una edición *posterior* al borrado lo resucita.
Invariante de salida: un id está en tombstones si y solo si no está vivo.

## Import legacy — `src/lib/legacy-import.ts`

Migración única de los viejos blobs JSON de `profiles` a las tablas por
entidad. Idempotente: ids UUID v5 deterministas
(`userId:entidad:legacyId`) + upsert que ignora duplicados; tolera datos
sucios (montos como string, enums fuera de rango).

## Antes de tocar esto

Leer la sección "Migración de Supabase" del `README.md` (orden de
`supabase/migrations/*.sql`, requisitos antes/después del deploy, modelo RLS)
y, para revisiones, `.agents/skills/auditoria-tecnica/SKILL.md`.

## Relacionado

- [[stores-zustand]] — tombstones, `primerSyncCompleto`, `materializarRecurrencias`.
- [[testing]] — `sync.test.ts`, `sync-conflictos.test.ts`, `merge.test.ts`, `legacy-import.test.ts`.
