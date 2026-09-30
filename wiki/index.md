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

- [[decision-alcance-del-wiki]] — por qué el wiki quedó exclusivo de foresight-finanzas y versionado dentro del repo (`wiki/`), en vez de un wiki personal multi-proyecto fuera de él.
