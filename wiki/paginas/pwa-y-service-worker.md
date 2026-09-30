---
tipo: mapa
tags: [mapa, arquitectura, pwa, service-worker]
fecha: 2026-09-30
---

# PWA y service worker

> Página de tipo **mapa** (derivada de `vite.config.ts`, `src/hooks/usePWA.ts`,
> `src/lib/lazy-recovery.ts` y del `CLAUDE.md` raíz). Puede quedar
> desactualizada si el código cambia — revisar en cada lint.

Volver a [[mapa-del-proyecto]].

## Configuración

`vite-plugin-pwa` en modo `generateSW` (Workbox), configurado en
`vite.config.ts`:

- **`skipWaiting: false` a propósito.** La app tiene formularios a medio
  llenar (importes de una transacción); si la versión nueva se activara sola,
  la recarga borraría lo que el usuario está escribiendo. El worker nuevo
  queda en espera y el usuario decide cuándo actualizar desde el banner
  "Nueva versión disponible" (`usePWA`, pintado en `src/App.tsx`), que le
  manda `SKIP_WAITING`.
- `clientsClaim: true`.
- **Se precachea todo** (`globPatterns` de js/css/html/ico/png/svg/woff2). Antes
  había exclusiones para chunks pesados (Sentry, jsPDF/html2canvas, Recharts),
  pero esas dependencias se eliminaron; el comentario en `vite.config.ts`
  guarda la historia.
- Runtime caching `CacheFirst` para `/assets/` (chunks con hash, inmutables).
- La fuente Inter está auto-alojada en `/public/fonts`.

## Red de seguridad

Aunque todo se precachea, `lazyConRecuperacion` se conserva: un precache
incompleto (cuota agotada, instalación interrumpida) volvería a dejar un
chunk expuesto tras un deploy. Ver [[navegacion-y-code-splitting]].

## Relacionado

- [[navegacion-y-code-splitting]] — qué se carga lazy y cómo se recupera.
- [[sync-y-autenticacion]] — el flush en `pagehide` es parte de cerrar bien la app instalada.
