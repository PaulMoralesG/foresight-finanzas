---
tipo: mapa
tags: [mapa, arquitectura, navegacion, routing]
fecha: 2026-09-30
---

# Navegación y code-splitting

> Página de tipo **mapa** (derivada de `src/App.tsx`, `src/config/views.ts`,
> `src/lib/lazy-recovery.ts` y del `CLAUDE.md` raíz). Puede quedar
> desactualizada si el código cambia — revisar en cada lint.

Volver a [[mapa-del-proyecto]].

## Sin router

No hay librería de routing. `src/App.tsx` hace un `switch` sobre
`uiStore.activeTab` (ver [[stores-zustand]]) y renderiza la página
correspondiente de `src/pages/`. Antes de eso: si `isLoading`, un skeleton; si
no hay usuario, `LoginPage`.

## Catálogo de vistas — `src/config/views.ts`

Una sola lista (`VIEWS`) con id, etiqueta, icono, sección y una línea de
descripción. Ocho vistas en dos secciones:

- **Día a día**: Resumen (`home`), Movimientos (`movements`), Presupuestos (`budgets`).
- **Patrimonio**: Deudas (`debts`), Metas (`goals`), Patrimonio (`networth`),
  Cuentas (`accounts`), Ajustes (`settings`).

`Sidebar`, `TabBar` y `Header` (en `src/components/layout/`) leen de aquí.
`MOBILE_TABS` define las cuatro pestañas de la barra móvil; el resto va en la
hoja "Más". `normalizarTabId()` traduce ids viejos persistidos (`stats`,
`savings`, `profile`).

El `Header` muestra además el control de **ámbito** (`AmbitoSegmentado`), que
filtra Resumen, Movimientos, Presupuestos, Deudas y Metas mediante los hooks
de `src/hooks/useAmbito.ts`. Cuentas, Patrimonio y Ajustes no tienen ámbito.

## Code-splitting

- Las ocho vistas se importan **estáticamente**: cambiar de pestaña nunca
  muestra un skeleton.
- Solo `LoginPage` y `ReportModal` son lazy, y con `lazyConRecuperacion`
  (`src/lib/lazy-recovery.ts`), no con `React.lazy` a secas: si tras un deploy
  el shell viejo pide un chunk que ya no existe, activa el service worker en
  espera y recarga en vez de caer al `ErrorBoundary`. Toda página lazy nueva
  debe usarlo. Relación directa con [[pwa-y-service-worker]].
- `vite.config.ts` separa `vendor-react` y `vendor-supabase` con
  `manualChunks`.

## Relacionado

- [[diseno-y-responsive]] — layout (`AppLayout`, sidebar de 212 px, tope de 1440 px).
- [[pwa-y-service-worker]] — por qué puede haber un chunk que ya no existe.
