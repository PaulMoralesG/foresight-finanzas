# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@.agents/rules/project-rules.md

Las reglas generales del proyecto (tipado estricto, `unknown` en los `catch`,
Conventional Commits en español, specs en `.agents/specs/` antes de una tarea
grande, `npm test` antes de dar nada por terminado) viven en ese archivo y se
importan aquí; lo que sigue es lo específico de este repositorio.

## Project

Foresight Finanzas — a PWA for tracking personal vs. business finances (React 19 + TypeScript + Vite + TailwindCSS + Zustand + Supabase). Offline-first: works with local storage alone and syncs to Supabase when configured. UI copy, commit messages, and code comments in this repo are in Spanish; keep that convention when editing existing files.

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # vite build (does NOT type-check — run tsc separately)
npm run preview        # preview the production build
npm run lint            # eslint .
npm run test            # vitest run (single pass)
npm run test:watch      # vitest (watch mode)
npm run test:coverage   # vitest run --coverage
npx tsc --noEmit        # type-check only, no build output
```

Run a single test file: `npx vitest run src/__tests__/sync.test.ts`
Run tests matching a name: `npx vitest run -t "nombre del test"`

There is no `typecheck` script in `package.json` — `vite build` does not type-check on its own, so run `npx tsc --noEmit` explicitly before relying on a clean build to mean the types are sound.

## Before pushing

Before considering any change done, this repo's own convention (see recent commit history) is: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` all clean, then `npx vite build` (and remove the resulting `dist/` if not deploying). Feature work goes on a branch, opened as a PR against `main`, merged only once CI (`lint-and-test` + Vercel preview) is green — never push straight to `main`, and never merge/deploy without explicit confirmation from the user.

## Architecture

### Path alias
`@/*` → `src/*` (configured in both `tsconfig.json` and `vite.config.ts`/`vitest.config.ts` — keep them in sync if it ever changes).

### State: three Zustand stores, one job each
- `src/stores/authStore.ts` — current `User` + loading flag. No persistence of its own.
- `src/stores/financeStore.ts` — the actual financial data: `expenses` (incl. transfers between accounts), `accounts`, `debts`, `assets`, `networth` (monthly closes), `budgetLines` (per-category budget + 12-month plan; the legacy `budgets` map is kept only so old clients keep syncing), `recurrences` (templates for repeating movements), `savingsGoals` (each carries its own `saved`), `settings`, custom categories and `tombstones` for logical deletes, plus current month/filter view state. Persisted to `localStorage` via `zustand/middleware`'s `persist` (key `foresight-finance-storage`, **unencrypted by design** — see README's "Datos locales sin cifrar" section; logging out clears it). Every change of shape bumps `version` and adds a chained `migrateVn` with a test. Business invariants live in the store, not in a page: e.g. `deleteAccount` is a no-op while `accountIsUsed()`. `materializarRecurrencias()` turns due recurrences into transactions: it is called from `AppLayout`'s mount effect and on `visibilitychange`, **never from an effect that depends on `expenses`/`recurrences`** (it writes to both — that dependency is a render loop). It is idempotent because each occurrence's id is a deterministic UUID v5 of `(recurrenceId, date)`, it skips ids already in `tombstones` (otherwise a deleted occurrence would come back on every launch) and it advances the rule's `ultimaGenerada` watermark in the same `set()`.
- `src/stores/uiStore.ts` — theme, active tab, modal/toast state, sync status indicator.

### Auth + sync: two hooks, one direction of data flow
`src/hooks/useAuth.ts` exports two hooks that must not be conflated:
- `useAuthSession()` — the session bootstrap effect. **Mounted exactly once**, in `App.tsx`. Re-mounting it elsewhere restarts the whole session cycle (in offline mode it calls `financeStore.reset()`; with Supabase it re-triggers legacy-import + pull + merge + forced push).
- `useAuth()` — state and actions, no effects, safe to call from any component.

When Supabase isn't configured (`supabaseAvailable` in `src/config/supabase.ts` is false — no `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY`), the app runs as a single `OFFLINE_USER` against `financeStore`'s local persistence only — this is a first-class supported mode, not a degraded fallback.

`src/lib/sync.ts` is the actual sync engine when Supabase *is* configured: a singleton (`syncService`, initialized once in `main.tsx`) doing pull-then-push with deterministic per-row merge (`updated_at` wins; `deleted_at` tombstones propagate deletes without resurrecting them). Debounced 800ms, single-flight, retries with backoff. Both pull and push are **incremental** against one watermark (the start of the last confirmed cycle, per user in `localStorage`; the pull subtracts a 5-minute margin for skewed clocks). `attach` (login), returning to the tab (`visibilitychange → visible`) and `online` run a **full** cycle as the safety net; `pagehide`/hidden flush incrementally. `flush()` resolves only when nothing is in flight or scheduled — `signOut()` wipes local state right after it, so a queued cycle must not be left behind. `src/lib/merge.ts` holds the pure merge-set logic; `src/lib/legacy-import.ts` handles the one-time migration of the old JSON-blob profile format into the per-entity tables (idempotent via deterministic UUID v5 ids).

If you touch `sync.ts`, `merge.ts`, or the Supabase schema assumptions, read the "Migración de Supabase" section of `README.md` first — it documents the migration ordering constraints (`supabase/migrations/*.sql`, must run in numeric order, two of them have a specific before/after-deploy requirement) and the RLS/security model.

### Routing and code-splitting
No router library — `App.tsx` switches on `uiStore.activeTab` and renders the matching page from `src/pages/`. The eight views live in one catalogue, `src/config/views.ts` (id, section, label, icon), in two sections: *Día a día* (Resumen `home`, Movimientos `movements`, Presupuestos `budgets`) and *Patrimonio* (Deudas `debts`, Metas `goals`, Patrimonio `networth`, Cuentas `accounts`, Ajustes `settings`). `Sidebar`, `TabBar` (4 tabs + "Más" sheet on mobile) and `Header` read from it; `normalizarTabId()` maps ids persisted before the restructuring. The `Header` also shows the view's one-line `descripcion` and the global **ámbito** segmented control (Todo / Personal / Negocio, `AmbitoSegmentado`), which lives in `financeStore.ambito` and filters Resumen, Movimientos, Presupuestos, Deudas and Metas through the `useAmbito` hooks (`src/hooks/useAmbito.ts`) — Cuentas, Patrimonio and Ajustes have no ámbito. `<main>` caps content at 1440px. All eight views are imported statically so switching tabs never shows a skeleton; only `LoginPage` and `ReportModal` are lazy-loaded via `lazyConRecuperacion` (`src/lib/lazy-recovery.ts`), not plain `React.lazy` — after a deploy, stale service-worker precache can request a chunk hash that no longer exists on the server; this wrapper detects that failure and activates the waiting service worker instead of crashing to the `ErrorBoundary`. Keep using it for any new lazy page.

### PWA / service worker
`vite-plugin-pwa` in `generateSW` mode, `skipWaiting: false` deliberately — the app has mid-transaction forms, so a new version doesn't force-activate and wipe unsaved input; the user opts in via the "Nueva versión disponible" banner (`usePWA` hook). Every chunk is precached now (the heavy ones — Sentry, jsPDF/html2canvas, Recharts — were removed); `vite.config.ts` has an inline comment with the history, and `lazyConRecuperacion` stays as a safety net.

### Pure business logic (`src/lib/`)
Every calculation ported from the Balance Dual reference is a pure function with its own test file, written before the UI: `accounts.ts` (balance per account, transfers), `debts.ts` (snowball/avalanche projection), `networth.ts`, `budget-lines.ts` (plan vs. actual, annual report, migration of the global budget), `goals.ts` (months left, monthly contribution), `month-keys.ts` (`YYYY-MM` helpers). Add new arithmetic there, not inside a page.

### Responsive rules
Breakpoints in use: `sm` 640 (chips/segmented inline), `md` 768 (tablet: KPI rows at 3–4 columns, two-column card grids, FAB hidden on Movimientos), `lg` 1024 (sidebar). Money in KPIs never truncates: values use a fluid size (`text-[clamp(...)]`) and `whitespace-nowrap`. Charts drawn as SVG measure their container with `useAnchoContenedor` (never a fixed `viewBox` scaled to `width="100%"`, which makes axis labels unreadable on phones). Tables wider than their card go inside `.saas-table-scroll` with the first column marked `.saas-col-fija`. Chips in a flex row use `.saas-chip-filter`, not `.saas-cell-filter` (whose negative margins are for table cells). `text-2xs` (11px) is for uppercase labels only; content text is `text-xs` or larger.

### Components
- `src/components/ui/` — generic, reusable primitives (`ModalSheet`, `ConfirmDialog`, `EmptyState`, `Toast`, `Skeleton`, etc.). `ModalSheet` owns the shared overlay/panel/focus-trap chrome for both the transaction and savings-goal modals — don't duplicate that scaffolding in a new modal, compose `ModalSheet` instead.
- `src/components/features/<domain>/` — feature-specific components (auth, categories, movements, report).
- `src/components/layout/` — app chrome (`AppLayout`, `Header`, `Sidebar`, `TabBar`, `MonthNav`). The `Sidebar` copies `.sidebar` from the Balance Dual reference: fixed 212px, no collapse toggle, the page background rather than a surface of its own, and a single rule — the right border — with no dividers around the brand or the footer.
- Design system conventions (`.saas-*` classes, icon-size scale, shadow hierarchy, the `business`/`brand` color ramps) live in `tailwind.config.js` and `src/index.css`, with comments documenting the reasoning — read those before introducing a new visual pattern, and see the "Diseño de UI" section below before any visually-significant change.

### Testing
Vitest + Testing Library, config in `vitest.config.ts` (setup file `src/test-setup.ts`, jsdom environment). Tests live in `src/__tests__/`. When mocking a module that wraps a Zustand store singleton (e.g. `@/config/supabase`), prefer a `vi.hoisted()` value read through a `get` accessor in the `vi.mock()` factory over `vi.resetModules()` + dynamic `import()` — the latter re-instantiates every store singleton transitively imported by the re-imported module, breaking state sharing with statically-imported test utilities.

## Diseño de UI — skill `frontend-design`

Antes de tocar el aspecto visual de una pantalla —maquetar algo nuevo,
rediseñar un componente existente, o cualquier cambio donde la decisión
importa más que el código en sí (jerarquía, tipografía, espaciado, dirección
estética)— invocar la skill `frontend-design` (`Skill(skill: "frontend-design")`)
antes de escribir JSX/CSS. Da una segunda opinión sobre intención visual antes
de comprometerse a una dirección, en vez de aplicar el primer patrón que
venga a la mente.

No hace falta para arreglos mecánicos (alinear un icono al tamaño que ya usa
el resto de la app, corregir un valor de padding que rompe la escala) — ahí
basta con seguir la convención ya establecida en `tailwind.config.js` y
`src/index.css` (clases `.saas-*`, escala de iconos, jerarquía de sombras;
ver el historial de commits de las auditorías de diseño para el razonamiento
detrás de cada convención).

## Documentación de librerías — Context7

Antes de escribir código contra una API de una librería de la que no se está
100% seguro del uso actual (Supabase JS, Vite/vite-plugin-pwa,
Zustand, Tailwind, Vitest/Testing Library), consultar Context7 en vez
de fiarse de memoria de entrenamiento:

1. `resolve-library-id` con el nombre oficial de la librería.
2. `query-docs` con el ID resuelto y una pregunta concreta y acotada a un solo
   tema (no "Supabase auth", sino "cómo detectar un cambio de email pendiente
   antes de confirmarlo con signInWithPassword y updateUser").

Especialmente importante para `@supabase/supabase-js` (el proyecto ya se
topó una vez con un campo del SDK — `session.user.new_email`— que no era
obvio sin mirar los tipos) y para cualquier API de Vite/vite-plugin-pwa,
donde el comportamiento cambia entre versiones (`skipWaiting`, `generateSW`,
`globIgnores`).

No hace falta para el código propio del proyecto (componentes de
`src/components/`, stores de Zustand ya escritos aquí, utilidades de
`src/lib/`) — eso se lee directamente del repo, no de documentación externa.

## Auditoría técnica — skill `auditoria-tecnica`

Para revisar seguridad (RLS/grants), integridad del sync y del store, autenticación
y rendimiento, seguir `.agents/skills/auditoria-tecnica/SKILL.md` (también invocable
como `/auditoria-tecnica`): lista los archivos que importan, las invariantes que hay
que comprobar y el formato [CRÍTICO]/[ADVERTENCIA]/[OPTIMIZACIÓN] del reporte.
Correr los advisors de Supabase antes de leer código.

## Related agent docs

`AGENTS.md` documents the generic "Superpowers" skill workflow (`.agents/skills/`) for any agent CLI. `GEMINI.md` covers Gemini-CLI-specific conventions. Both are versioned in this repo alongside this file.
