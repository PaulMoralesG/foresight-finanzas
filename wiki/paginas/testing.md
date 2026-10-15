---
tipo: mapa
tags: [mapa, arquitectura, testing, vitest]
fecha: 2026-09-30
---

# Testing

> Página de tipo **mapa** (derivada de `vitest.config.ts`, `src/test-setup.ts`,
> `src/__tests__/` y del `CLAUDE.md` raíz). Puede quedar desactualizada si el
> código cambia — revisar en cada lint.

Volver a [[mapa-del-proyecto]].

## Configuración

- **Vitest + Testing Library**, entorno `jsdom`, `globals: true`, config en
  `vitest.config.ts` (alias `@` y `__APP_VERSION__` iguales a
  `vite.config.ts`).
- `src/test-setup.ts` carga `@testing-library/jest-dom`, y simula
  `matchMedia`, `localStorage`, `scrollTo` y `crypto.randomUUID` (con una
  secuencia determinista).
- Todos los tests viven en `src/__tests__/`.

## Qué se cubre

- Una suite por módulo puro de `src/lib/` (ver [[logica-de-negocio-pura]]).
- Store: `financeStore.test.ts`, `finance-migrate-versiones.test.ts` (cada
  `migrateVn` lleva test), `debt-payments-store.test.ts` — ver [[stores-zustand]].
- Sync y auth: `sync*.test.ts`, `merge.test.ts`, `legacy-import.test.ts`,
  `useAuth-*.test.ts`, `materializar-tras-sync.test.tsx` — ver
  [[sync-y-autenticacion]].
- Páginas y componentes: `*-page.test.tsx`, `navigation.test.tsx`,
  `print-*.test.tsx`, `lazy-recovery.test.ts`.

## Convención para mockear stores singleton

Al mockear un módulo que envuelve un store de Zustand (p. ej.
`@/config/supabase`), usar un valor de `vi.hoisted()` leído con un accessor
`get` dentro del factory de `vi.mock()`. **No** `vi.resetModules()` + `import()`
dinámico: re-instancia todos los stores importados transitivamente y rompe el
estado compartido con las utilidades de test importadas estáticamente.
Ejemplos: `sync-conflictos.test.ts`, `materializar-tras-sync.test.tsx`.

## Tests añadidos en la auditoría de octubre 2026

- Nuevos: `useAuth-cuenta.test.ts`, `auth-forms.test.tsx`, `ui-render.test.tsx`,
  `usePWA.test.ts`, `ids.test.ts`, `totales.test.ts`.
- `finance-migrate-versiones.test.ts` ahora prueba los pasos **v9-v13 de forma
  aislada**: `migrate` no exporta cada paso, así que se entra por v8 (aplican
  v9...v17) y se comprueba lo que cada uno garantiza. Hoy el store va en v17.
- Casos nuevos de las correcciones: restaurar sella `updated_at`
  (`financeStore.test.ts`, `debt-payments-store.test.ts`), `deleteDebt`
  desvincula pagos, `deduplicarLineas` (`merge.test.ts`,
  `sync-conflictos.test.ts`) y `sincronizarAlVolver` en
  `materializar-tras-sync.test.tsx`.

## Fechas fijas

Los tests que dependen de "hoy" (`financeStore`, `accounts-page`,
`budgets-page`) fijan la fecha **antes de los imports** con `vi.hoisted()`
y `vi.useFakeTimers({ toFake: ['Date'] })`. Solo se falsea `Date`: falsear
también los timers rompe los debounces y el `waitFor`.

## Cobertura

`vitest.config.ts` define umbrales de coverage conservadores, unos puntos por
debajo de lo medido: global líneas 82 / sentencias 81 / funciones 80 / ramas
73, y `src/lib/**` líneas 95 / sentencias 94 / funciones 94 / ramas 83. Son
una red contra regresiones; súbelos cuando la cobertura suba.

## Windows: correr vitest desde PowerShell

En este repo, en Windows, `vitest` falla desde Git Bash; correrlo desde
PowerShell (`npx vitest run`, `npm test`).

## Comandos

`npm test` (una pasada), `npx vitest run <archivo>`, `npx vitest run -t "<nombre>"`.
Antes de dar algo por terminado: `npx tsc --noEmit`, `npx eslint .`,
`npx vitest run` y `npx vite build`.

## Relacionado

- [[logica-de-negocio-pura]], [[stores-zustand]], [[sync-y-autenticacion]].
