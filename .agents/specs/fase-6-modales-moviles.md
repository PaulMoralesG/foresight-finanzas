# Fase 6 — Modales en móvil (iPhone con Dynamic Island, Android) y objetivos táctiles

Origen: en un iPhone 14 Pro el botón de cerrar de los modales quedaba oculto.
Se reprodujo con un banco de pruebas que simula las zonas seguras de cuatro
dispositivos (iPhone 14 Pro 393×852 · 59/34 px, iPhone SE 375×667 · 20/0,
Galaxy S23 360×780 · 24/16, Pixel 7 412×915 · 24/16), abre los 11 modales,
los rellena y los envía, y mide cada control.

## Causas
1. Foco automático en un campo al abrir: sale el teclado, el navegador
   desplaza el visual viewport y la cabecera fija (con «Cerrar») sale de la
   pantalla.
2. Botón de cerrar de 28×28 px en la esquina, junto al radio de la pantalla.
3. El panel no reservaba el indicador de inicio (34 px): el botón de enviar
   quedaba debajo.
4. `ReportModal`: el botón de cerrar vivía dentro del área con scroll.

## Cambios
- `ModalSheet` es hoja inferior en móvil (`.modal-sheet` en `index.css`):
  alto según contenido con tope en la parte visible, zonas seguras arriba y
  abajo, asa, cierre de 44 px con fondo. En escritorio, tarjeta centrada.
- `useVisualViewport`: publica `--vv-height`/`--vv-bottom` y la hoja se ancla
  sobre el teclado.
- En `pointer: coarse` no se enfoca ningún campo al abrir; el foco va al panel.
- Cabecera del reporte fuera del scroll; banners de instalar/actualizar con
  zonas seguras.
- Objetivos táctiles de 44 px en táctil: controles de formulario dentro de
  diálogos, campos de página, y zona invisible (`::after`) para segmentados
  (`[role=group] > button`), subpestañas (`[role=tab]`), interruptores
  (`[role=switch]`), enlaces «Ver todo», el mes del stepper, las casillas de
  Movimientos y el botón de limpiar búsqueda.
- Mayúscula solo al inicio: «Nuevo movimiento», «Registrar movimiento»,
  «Reporte mensual», «PDF completo».

## Verificación
Banco de pruebas: 0 problemas en los 4 dispositivos (11 modales + 8 vistas).
Tests de regresión en `src/__tests__/modal-sheet.test.tsx`.
