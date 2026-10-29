# Índice — wiki de foresight-finanzas

Catálogo de todo lo que hay en `paginas/`. Se actualiza en cada ingesta o
consulta archivada. Ver `CLAUDE.md` para las reglas de mantenimiento y
`log.md` para el historial cronológico.

## Mapa del proyecto (`tipo: mapa`)

Síntesis de la arquitectura derivada del código y del `CLAUDE.md` raíz;
revisar en cada lint.

- [[mapa-del-proyecto]] — hub central: el flujo por capas de la app y el enlace a cada área.
- [[stores-zustand]] — authStore, financeStore (persistencia, migraciones, invariantes de negocio) y uiStore.
- [[sync-y-autenticacion]] — modo offline vs. Supabase, `useAuthSession` vs. `useAuth`, motor de sync incremental, merge e import legacy.
- [[navegacion-y-code-splitting]] — routing por `activeTab`, catálogo de vistas en `views.ts`, ámbito y `lazyConRecuperacion`.
- [[pwa-y-service-worker]] — vite-plugin-pwa en `generateSW`, `skipWaiting: false` y el banner de actualización.
- [[logica-de-negocio-pura]] — funciones puras de `src/lib/` (cuentas, deudas, patrimonio, presupuestos, metas, meses).
- [[diseno-y-responsive]] — breakpoints, reglas responsive, clases `.saas-*` y organización de componentes.
- [[testing]] — Vitest + Testing Library, setup de jsdom y la convención `vi.hoisted()` para mockear stores.

## Decisiones y contexto (`tipo: decision`)

- [[decision-restaurar-sella-updated-at]] — C1: el undo de borrado re-sella `updated_at` para no perder contra el tombstone del servidor.
- [[decision-sincronizar-al-volver]] — A1: `sincronizarAlVolver()` antes de materializar recurrencias y por qué no `flush(true)` directo.
- [[decision-aplicando-merge-y-tombstones]] — flag `aplicandoMerge` en el sync, `update*` no-op si el id no está vivo, `importBackup` conserva tombstones; descartados: índices `(user_id, updated_at)` y cambiar el reset entre cuentas.
- [[decision-aviso-cambio-de-cuenta-y-carrera]] — el login avisa (cancelar / exportar / descartar) antes de que otra cuenta borre cambios sin subir de la anterior; generación de sesión contra la carrera de cargas de perfil.
- [[decision-pendientes-conocidos-octubre-2026]] — deuda técnica conocida y no resuelta tras la auditoría (sync.ts, DebtsPage, avisos de error, uuidv5, E2E).
- [[decision-alcance-del-wiki]] — por qué el wiki quedó exclusivo de foresight-finanzas y versionado dentro del repo (`wiki/`), en vez de un wiki personal multi-proyecto fuera de él.
- [[decision-sync-periodico-app-abierta]] — ciclo incremental cada 60 s (y en `focus`) con la app abierta y visible; por qué polling y no Supabase Realtime, y su coste en peticiones.
- [[decision-zonas-tactiles-en-tarjetas-con-clic]] — por qué dentro de tarjetas con clic propio los chips no llevan zona táctil ampliada (`data-tarjeta-mov`), sino tamaño visible real.

## Recursos fuera del wiki

- `docs/diagramas/` (en la raíz del repo) — siete diagramas archify (arquitectura, stores, sync, sesión, modelo de datos, flujos) generados el 2026-10-29 desde el código; abrir `index.html`. Ver su `README.md`.
