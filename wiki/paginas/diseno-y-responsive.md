---
tipo: mapa
tags: [mapa, arquitectura, diseno, responsive, ui]
fecha: 2026-09-30
---

# Diseño y responsive

> Página de tipo **mapa** (derivada de `tailwind.config.js`, `src/index.css`,
> `src/components/` y del `CLAUDE.md` raíz). Puede quedar desactualizada si el
> código cambia — revisar en cada lint.

Volver a [[mapa-del-proyecto]].

## Breakpoints en uso

- `sm` 640 — chips y controles segmentados en línea.
- `md` 768 — tablet: KPIs a 3–4 columnas, tarjetas a dos columnas, FAB oculto
  en Movimientos (`md:hidden` en `TabBar`).
- `lg` 1024 — aparece el sidebar fijo (`hidden lg:flex`, 212 px).

## Reglas que se repiten

- El dinero en KPIs nunca se trunca: tamaño fluido (`text-[clamp(...)]`) +
  `whitespace-nowrap`.
- Gráficos SVG miden su contenedor con `useAnchoContenedor`
  (`src/hooks/useAnchoContenedor.ts`), nunca un `viewBox` fijo escalado.
- Tablas más anchas que su tarjeta: `.saas-table-scroll` con la primera
  columna `.saas-col-fija`.
- Chips en fila: `.saas-chip-filter` (no `.saas-cell-filter`, cuyos márgenes
  negativos son para celdas de tabla).
- `text-2xs` (11 px, definido en `tailwind.config.js`) solo para etiquetas en
  mayúsculas; el contenido va en `text-xs` o mayor.
- El contenido de `<main>` tiene tope de 1440 px (`AppLayout`).

## Sistema de diseño

- Tokens y rampas de color `brand` y `business`, escala de fuentes y
  `zIndex` en `tailwind.config.js`.
- Clases `.saas-*` en `src/index.css` (`saas-card`, `saas-btn*`,
  `saas-input*`, `saas-badge*`, `saas-table*`, `saas-chip-*`, `saas-hit`…),
  con comentarios que explican cada decisión.

## Componentes

- `src/components/ui/` — primitivas genéricas. `ModalSheet` concentra overlay,
  panel y focus-trap de los modales: un modal nuevo lo compone, no lo duplica.
- `src/components/features/<dominio>/` — componentes de cada dominio.
- `src/components/layout/` — `AppLayout`, `Header`, `Sidebar`, `TabBar`,
  `MonthNav`, `AmbitoSegmentado`. El `Sidebar` copia el `.sidebar` de Balance
  Dual: 212 px fijos, sin colapsar, un solo borde a la derecha.

Antes de un cambio visual significativo, el `CLAUDE.md` raíz pide invocar la
skill `frontend-design`.

## Relacionado

- [[navegacion-y-code-splitting]] — qué vistas pinta el layout.
- [[testing]] — tests de páginas y componentes con Testing Library.
