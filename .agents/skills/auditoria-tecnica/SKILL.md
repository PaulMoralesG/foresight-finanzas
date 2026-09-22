---
name: auditoria-tecnica
description: Auditoría de seguridad, integridad y rendimiento de Foresight (RLS de Supabase, motor de sync, store global, autenticación). Usar cuando pidan "auditar", "revisión técnica", "revisar seguridad/accesos", o antes de un release con cambios en sync.ts, merge.ts, financeStore.ts, useAuth.ts o supabase/migrations/.
---

# Auditoría técnica de Foresight

Revisión acotada a lo que puede filtrar datos, perderlos o degradar la app.
Se omiten estilos, configuración genérica y componentes puramente visuales.

## 1. Qué leer (y nada más)

| Área | Archivos |
|---|---|
| Esquema y accesos | `supabase/migrations/*.sql` (RLS, grants, triggers), `README.md` § Migración |
| Sincronización | `src/lib/sync.ts`, `src/lib/merge.ts`, `src/lib/legacy-import.ts` |
| Estado global | `src/stores/financeStore.ts` (acciones, `migrate`, `persist`) |
| Autenticación | `src/hooks/useAuth.ts`, `src/hooks/useIdleLogout.ts`, `src/config/supabase.ts` |
| Aritmética de negocio | `src/lib/accounts.ts`, `debts.ts`, `networth.ts`, `budget-lines.ts`, `goals.ts`, `utils.ts` |
| Telemetría | `src/lib/error-reporter.ts` (qué termina en `error_log`) |

Primero los advisors en vivo del proyecto (`sphmdtlvxbypckhavhgb`), que
detectan tablas sin RLS y políticas rotas sin leer una línea:
`mcp__claude_ai_Supabase__get_advisors` con `type: security` y `type: performance`.

## 2. Qué comprobar

### Accesos (fugas)
- Toda tabla en `public` tiene RLS activo y una política `for all using ((select auth.uid()) = user_id) with check (...)`. `profiles` compara contra `id`.
- Tabla nueva ⇒ `grant select, insert, update, delete ... to authenticated` explícito: la 0004 revocó los privilegios por defecto.
- Tabla con `updated_at` ⇒ trigger `keep_newest` (sin él, un cliente con snapshot viejo pisa ediciones ajenas).
- `error_log`: solo `insert`; sin política de `select`.
- Funciones `security definer` con `search_path` fijo y sin `execute` público.
- Nada sensible en `error-reporter.ts` más allá de mensaje/stack/url/user-agent.

### Integridad (carreras y escrituras sin control)
- `flush()` no resuelve hasta que **no queda nada en vuelo ni agendado**: `signOut()` borra el estado local justo después (`useAuth.ts`). Test: `sync.test.ts` "flush no resuelve hasta que el ciclo encolado…".
- Single-flight: `performPush` con `pushInFlight` encola (`queuedAfterPush`/`queuedFull`) y el `finally` arranca el encolado; `dirtyDuringSync` cubre las ediciones durante un ciclo.
- Marca de agua: se toma **antes** del pull, se guarda solo tras éxito; `attach`, `visibilitychange → visible` y `online` fuerzan ciclo completo.
- Tombstones: solo se podan los confirmados por el servidor; `mergeById` mantiene `id ∈ tombstones ⇔ id ∉ live`.
- Invariantes del store viven en el store, no en una pantalla: `deleteAccount` es no-op si `accountIsUsed`. Cualquier regla nueva del mismo tipo va al mismo sitio.
- Migraciones de estado persistido (`migrateVn`) encadenadas y con test; `version` sube con cada cambio de forma.
- Todo bloque `async` con `try/catch` y `err: unknown` con *narrowing* (regla del proyecto).

### Rendimiento (backend y hot paths)
- Pull y push **incrementales** por `updated_at` (pull con margen de 5 min); paginado estable (`order` + `range`) por encima de 1000 filas.
- `applyMerge` no dispara `setState` sin cambios reales (`igualEstructural`, sin `JSON.stringify` del estado completo).
- Un solo ciclo por ráfaga de ediciones (debounce 800 ms); nada resincroniza en `TOKEN_REFRESHED` ni al montar componentes (`useAuthSession` se monta una vez).
- `npm run peso` no sube sin justificación; iconos no usados fuera del sprite (`scripts/generar-iconos.mjs`).

## 3. Formato del reporte

Cada hallazgo con etiqueta y ubicación `archivo:línea`:

- **[CRÍTICO]** pérdida de datos, fuga entre usuarios o corrupción del estado. Con el fragmento actual y la corrección propuesta.
- **[ADVERTENCIA]** invariante frágil, regla en la capa equivocada, coste que crece con el uso, ajuste pendiente en el panel de Supabase.
- **[OPTIMIZACIÓN]** mejora sin riesgo funcional.

Cerrar con "lo que se verificó y está bien", para que nadie reabra lo ya cubierto.

## 4. Cierre

Al aplicar correcciones: test que reproduce el fallo **antes** del fix, luego
`npx tsc --noEmit && npx eslint . && npx vitest run && npx vite build` (y
borrar `dist/`), actualizar `README.md`/`CLAUDE.md` si cambió un contrato, y
commit en Conventional Commits en español. Lo que dependa del panel de Supabase
(p. ej. *Leaked password protection*) se deja anotado para el usuario, no se
asume hecho.
