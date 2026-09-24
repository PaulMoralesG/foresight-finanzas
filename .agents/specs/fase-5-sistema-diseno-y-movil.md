# Fase 5 — Recomendaciones del sistema de diseño y revisión móvil

Origen: la extracción del sistema de diseño (tokens, contraste y componentes)
y una auditoría automática de las ocho vistas a 320, 360, 375, 390 y 414 px en
claro y oscuro (desbordes horizontales y objetivos táctiles < 44 px).

## Contraste (WCAG AA)
- `slate-500` #7a7872 → #72706a: el placeholder daba 4.4:1 sobre blanco; ahora 4.95:1 (lo que ya afirmaba el comentario de `.saas-input`).
- Confirmación de aviso: texto blanco sobre `amber-500` (2.2:1) → `amber-700` (5.0:1).
- Serie de ingresos en gráficas, tema claro: #1baf7a (2.8:1) → `income-600` #0f7a54 (5.3:1).

## Coherencia de color
- `red-*` / `emerald-*` sueltos de Tailwind → rampas `expense-*` / `income-*` (Toast, ConfirmDialog, píldoras de tipo, formularios de acceso, reporte…). La paleta de categorías no se toca: es elección del usuario.
- `::selection` seguía en azul (blue-600) → `brand-500`.
- Iconos de la PWA y favicon: degradado azul → `brand-500 → brand-800`, el mismo de la pantalla de carga.

## Tipografía
- Títulos (h1–h4) en `font-semibold`: de Fraunces solo se carga la 600 y el 700 se sintetizaba.
- Se carga IBM Plex Mono 700 para las cifras KPI (`font-bold`), en vez de sintetizarla.

## Móvil y compatibilidad entre navegadores
- Alto del viewport: `100vh` → `-webkit-fill-available` → `100dvh` dentro de `@supports`, en ese orden.
- `text-size-adjust: 100%` para que iOS no agrande el texto al girar.
- `CardHeader` con `flex-wrap`: en Cuentas, los dos selectores aplastaban el título a una palabra por línea y desbordaban 80 px.
- Patrimonio neto (Resumen): una columna por debajo de 400 px; las cifras se montaban.
- Botón «Reporte»: solo icono por debajo de 360 px (desbordaba 12 px a 320).
- TabBar: etiquetas a 10 px y truncadas por debajo de 375 px; antes se tocaban.
- Zona táctil de 44 px (`::after` invisible, solo `pointer: coarse`) para el avatar de la cabecera y los chips de las filas de Movimientos.

## Verificación
`tsc --noEmit`, `eslint .`, `vitest run` y `vite build` limpios; auditoría sin desbordes en ningún ancho.
