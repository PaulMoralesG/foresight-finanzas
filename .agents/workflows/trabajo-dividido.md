---
description: Workflow para dividir el trabajo en paralelo entre Antigravity y Claude Code
---

# Workflow: Desarrollo Dividido

1. **Paso 1 (Especificación)**:
   - Crear un archivo borrador en `.agents/specs/[nombre-feature].md`.
   - Definir interfaces de TypeScript, contratos de datos (Supabase/stores) y lista de verificación de tareas (Checklist).

2. **Paso 2 (División por Agentes)**:
   - **Antigravity (GUI)**: se encarga del Frontend y componentes visuales en `src/components/` y `src/pages/`.
   - **Claude Code (CLI / Terminal)**: se encarga de la lógica de datos y Supabase en `src/lib/` y `src/stores/`, hooks en `src/hooks/`, refactorización profunda y pruebas unitarias en `src/__tests__/`.

3. **Paso 3 (Sincronización y Continuidad)**:
   - Cada agente debe marcar sus tareas en el Checklist del archivo de Spec al finalizar su módulo y ejecutar `npm test`.
   - Si la cuota de Claude Code se agota, continuar en el chat de Antigravity indicando: "Revisa `.agents/specs/` y continúa con el siguiente paso pendiente".
