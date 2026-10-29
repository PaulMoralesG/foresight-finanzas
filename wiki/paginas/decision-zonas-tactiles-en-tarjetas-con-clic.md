---
tipo: decision
tags: [decision, diseno, tactil, movil, accesibilidad]
fecha: 2026-10-29
fuentes: [src/index.css, src/pages/MovementsPage.tsx, src/__tests__/movements-tarjeta-movil.test.tsx]
---

# Decisión: zonas táctiles ampliadas dentro de tarjetas con clic propio

Volver a [[mapa-del-proyecto]]. Relacionado: [[diseno-y-responsive]], [[testing]].
Rama `fix/movimientos-toque-tarjeta-movil`.

## El patrón y el defecto

La tarjeta móvil de Movimientos es un `div role="button"` que abre el editor
al tocarla, y lleva dentro controles anidados (checkbox y tres chips de
filtro con `stopPropagation`). En táctil (`@media (pointer: coarse)`),
`.saas-chip-click` gana un `::after` invisible de `max(100%, 44px)` para
cumplir el mínimo de 44px. Con tres chips pegados en la fila 2, esas zonas
de 44px de alto y ancho cubrían casi la mitad izquierda de la tarjeta,
concepto incluido: el toque en el concepto caía en un filtro, no abría el
editor. En Resumen no pasaba porque su tarjeta no tiene botones anidados.

## Decisión

Dentro de una tarjeta con clic propio **no se amplía la zona táctil de los
controles anidados**: `[data-tarjeta-mov] .saas-chip-click::after { content: none }`.
En su lugar el chip crece de verdad (`px-2 py-1`, ~24px de alto) y la fila
se separa (`mt-2`). El resto de la tarjeta sigue siendo zona del editor.

Regla general: una zona invisible de 44px es válida para un control aislado;
dentro de un contenedor clicable compite con el contenedor y gana siempre
(está encima), así que ahí se dimensiona el control visible, no el `::after`.
Un contenedor nuevo con este patrón debe llevar su propio atributo
`data-*` y su regla análoga en `index.css`.

## Descartado

- Quitar el `stopPropagation` de los chips: el toque en un chip abriría el
  editor además de filtrar.
- Subir los chips a 44px visibles: la tarjeta pasaría de ~72px a ~100px y la
  lista móvil perdería densidad.
- Reducir el `::after` a un tamaño intermedio: sigue solapando con los chips
  vecinos y con el concepto; solo mueve el problema.

## Verificación

jsdom no evalúa `@media (pointer: coarse)`, así que el test
(`movements-tarjeta-movil.test.tsx`) fija el contrato (atributo) y el
comportamiento de clic. El mapa de toque real se comprobó con Chrome headless
emulando móvil táctil 390x844: el concepto resuelve a la tarjeta, los chips
solo responden dentro de su propio recuadro y el toque en la categoría filtra
sin abrir el modal. Otras tarjetas (Deudas, Metas, Cuentas) no tienen
`stopPropagation` ni `.saas-chip-click`; no están afectadas.
