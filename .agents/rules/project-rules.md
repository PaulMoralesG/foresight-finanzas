---
description: Reglas de arquitectura, calidad de código y asignación de modelos de IA
---

# 1. Reglas Generales de Código
- **Lenguaje/Stack**: TypeScript (Strict Mode), Vite, React 19, Tailwind CSS.
- **Componentes**: Utilizar funciones nombradas con exportación explícita (evitar `default export`). El proyecto ya sigue esta convención en todo `src/`.
- **Manejo de Errores**: Todo bloque asíncrono debe incluir `try/catch`, capturando el error como `unknown` y aplicando *type narrowing* antes de usarlo (evitar `any`).
- **Pruebas**: Antes de dar por finalizada una tarea, ejecutar `npm test` (Vitest).

# 2. Asignación de Modelos por Agente y Tarea (Model Routing)

## Google Antigravity (Ecosistema Gemini)
- **Consultas Breves y Edición Mínima**: usar el modelo Gemini más ligero/rápido disponible en Antigravity.
- **UI, Maquetación y Ayuda General**: usar el modelo Gemini de balance velocidad/calidad disponible en Antigravity.
- **Análisis de Proyecto Completo y Arquitectura**: usar el modelo Gemini de razonamiento avanzado (mayor ventana de contexto) disponible en Antigravity.
- Nota: los nombres exactos de versión cambian con frecuencia; verificar en el selector de modelos de Antigravity antes de fijar un nombre específico en este documento.

## Claude Code CLI (Ecosistema Anthropic)
- **Respuestas Rápidas y Scripts Ligeros**: usar `Haiku 4.5` (máxima velocidad).
- **Tareas Diarias, Módulos y Refactorización**: usar `Sonnet 5` (más eficiente para el desarrollo cotidiano).
- **Lógica Compleja, Algoritmos y Bugs Difíciles**: usar `Opus 5` con esfuerzo de razonamiento alto.

# 3. Flujo de Trabajo y Edición
- **Persistencia**: Toda tarea grande debe diseñarse e iterarse primero en `.agents/specs/`.
- **Commits**: Usar el formato Conventional Commits (`feat:`, `fix:`, `refactor:`) redactados en español.
