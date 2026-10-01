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

## Comandos

`npm test` (una pasada), `npx vitest run <archivo>`, `npx vitest run -t "<nombre>"`.
Antes de dar algo por terminado: `npx tsc --noEmit`, `npx eslint .`,
`npx vitest run` y `npx vite build`.

## Relacionado

- [[logica-de-negocio-pura]], [[stores-zustand]], [[sync-y-autenticacion]].
