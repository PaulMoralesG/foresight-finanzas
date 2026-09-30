---
tipo: mapa
tags: [mapa, arquitectura, hub]
fecha: 2026-09-30
---

# Mapa del proyecto

> Página de tipo **mapa**: sintetiza la arquitectura leyendo el código y el
> `CLAUDE.md` raíz. Puede quedar desactualizada si el código cambia — revisar
> en cada auditoría (lint) contra el `CLAUDE.md` raíz y `src/`.

Foresight Finanzas es una PWA para llevar las finanzas personales y las del
negocio por separado (React 19 + TypeScript + Vite + Tailwind + Zustand +
Supabase). Es *offline-first*: funciona solo con `localStorage` y sincroniza
con Supabase cuando está configurado. Este es el punto de entrada del grafo:
cada área tiene su página, y todas enlazan de vuelta aquí.

## Cómo fluye todo, en una línea por capa

1. **Arranque** — `src/main.tsx` inicializa el singleton de sync; `src/App.tsx`
   monta la sesión una sola vez y elige qué vista pintar.
   → [[navegacion-y-code-splitting]]
2. **Sesión y datos remotos** — `useAuthSession()` decide modo offline u
   online; con Supabase, `syncService` hace pull → merge → push.
   → [[sync-y-autenticacion]]
3. **Estado** — tres stores de Zustand; `financeStore` guarda los datos y sus
   invariantes de negocio. → [[stores-zustand]]
4. **Cálculos** — funciones puras en `src/lib/`, cada una con su test.
   → [[logica-de-negocio-pura]]
5. **Presentación** — layout, breakpoints y clases `.saas-*`.
   → [[diseno-y-responsive]]
6. **Distribución** — service worker con actualización opt-in.
   → [[pwa-y-service-worker]]
7. **Red de seguridad** — Vitest + Testing Library. → [[testing]]

## Páginas del mapa

| Página | Área | Archivos clave |
|---|---|---|
| [[stores-zustand]] | Estado y reglas de negocio del store | `src/stores/*.ts` |
| [[sync-y-autenticacion]] | Motor de sync, merge, import legacy, hooks de auth | `src/lib/sync.ts`, `src/lib/merge.ts`, `src/lib/legacy-import.ts`, `src/hooks/useAuth.ts` |
| [[navegacion-y-code-splitting]] | Vistas, tabs, lazy-loading | `src/App.tsx`, `src/config/views.ts`, `src/lib/lazy-recovery.ts` |
| [[pwa-y-service-worker]] | vite-plugin-pwa, `skipWaiting: false` | `vite.config.ts`, `src/hooks/usePWA.ts` |
| [[logica-de-negocio-pura]] | Cálculos financieros testeados | `src/lib/accounts.ts`, `debts.ts`, `networth.ts`, `budget-lines.ts`, `goals.ts`, `month-keys.ts` |
| [[diseno-y-responsive]] | Breakpoints, sistema de diseño | `tailwind.config.js`, `src/index.css`, `src/components/` |
| [[testing]] | Vitest, jsdom, mocks de stores | `vitest.config.ts`, `src/test-setup.ts`, `src/__tests__/` |

## Decisiones y contexto

Las páginas de mapa describen *qué hay*; las de decisión explican *por qué*
algo es como es y no se deriva del código.

- [[decision-alcance-del-wiki]] — por qué este wiki es exclusivo del proyecto
  y vive versionado dentro del repo; es también la razón de ser de este mapa
  (que cualquier agente que abra el repo tenga el contexto de entrada).

## Fuera del mapa (a propósito)

- La migración de Supabase (`supabase/migrations/*.sql`, orden numérico,
  modelo RLS) está documentada en la sección "Migración de Supabase" del
  `README.md`; no se resume aquí para no tener dos versiones del orden de
  ejecución.
- La auditoría técnica tiene su propio procedimiento en
  `.agents/skills/auditoria-tecnica/SKILL.md`.
