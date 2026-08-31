# Claude Code Workflow

Convenciones para trabajar en este repo con Claude Code, en la misma línea que
`AGENTS.md` (workflow "Superpowers", genérico para agentes) y `GEMINI.md`
(Gemini CLI). Esto cubre lo específico de Claude Code: una skill y un
conector MCP.

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
100% seguro del uso actual (Supabase JS, Recharts, Vite/vite-plugin-pwa,
Zustand, Tailwind, jsPDF, Vitest/Testing Library), consultar Context7 en vez
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
