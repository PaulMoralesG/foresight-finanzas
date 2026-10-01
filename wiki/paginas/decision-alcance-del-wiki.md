---
tipo: decision
tags: [wiki, arquitectura-de-proceso]
fecha: 2026-09-30
---

# Decisión: alcance del wiki (exclusivo de foresight-finanzas, versionado en el repo)

## Contexto

Durante una sesión de trabajo se encontró, anidada por error dentro del
propio repo (en `foresight-finanzas/foresight-finanzas/`), una bóveda de
Obsidian vacía creada siguiendo un tutorial. Su existencia disparó la
pregunta de qué hacer con ese espacio: dejarlo, borrarlo, o convertirlo en
algo útil — un wiki de contexto para el proyecto, siguiendo el patrón "LLM
Wiki" (fuentes en bruto inmutables + páginas markdown mantenidas por el
agente + índice + log).

## Opción considerada y descartada: wiki personal multi-proyecto fuera del repo

La primera propuesta de Claude fue sacar el wiki del repo por completo, a
`D:\ProyectosIA\wiki\`, como una base de conocimiento personal que cubriera
múltiples proyectos (organizada por categorías del tipo
`proyectos/finanzas/general`), con su propio control de versiones
independiente del repo de la app.

El razonamiento detrás de esa propuesta: mezclar código de producción de
foresight-finanzas con notas personales de dominios no relacionados (otros
proyectos, ideas generales) ensuciaría tanto el historial de git de la app
como el `CLAUDE.md` raíz, que debe describir solo esta aplicación.

## Decisión del usuario

El usuario corrigió explícitamente esa propuesta: no quiere un wiki
multi-proyecto. Quiere que tanto el wiki (`paginas/`) como las fuentes en
bruto (`raw/`) sean **exclusivos de foresight-finanzas** — nada de notas de
otros proyectos (en particular, nada de la referencia "Balance Dual" que se
usa como fuente de lógica de negocio pero no debe mezclarse aquí) ni notas
genéricas sin relación con este proyecto.

La razón de fondo: el propósito del wiki no es ser una libreta personal de
Claude, sino que **cualquier agente que abra este repo tenga de entrada todo
el contexto del proyecto** — arquitectura, decisiones tomadas y por qué,
contexto de negocio, callejones sin salida ya explorados — sin depender de
que esa información viva dispersa en el historial de chats o en una carpeta
externa que un agente nuevo nunca va a encontrar. Un wiki multi-proyecto
fuera del repo no cumple ese propósito: un agente que clona o abre
foresight-finanzas no tiene por qué saber que existe `D:\ProyectosIA\wiki\`,
ni debería tener que filtrar contenido de otros proyectos para encontrar lo
relevante.

## Resultado final

El wiki quedó dentro del propio repo, en `wiki/` (raíz del proyecto),
**versionado junto con el código** — mismos commits, sin `.git` propio.
Estructura simplificada respecto a la propuesta multi-proyecto: solo
`raw/` (+ `raw/assets/`) y `paginas/` en organización **flat** (sin las
subcarpetas por categoría que tenía sentido para un wiki multi-dominio, pero
no para uno de un solo proyecto), más `index.md`, `log.md` y un `CLAUDE.md`
propio que acota las reglas de mantenimiento a este wiki.

Como puntero, se agregó al `CLAUDE.md` raíz del repo una sección corta
"Wiki de contexto del proyecto" (ubicada antes de "Related agent docs") que
señala la existencia de `wiki/` sin duplicar su contenido.

## Por qué importa esta decisión

Si en el futuro alguien (humano o agente) propone de nuevo "sacar el wiki a
una carpeta separada" o "convertirlo en multi-proyecto" — por ejemplo al
notar que se repite trabajo de documentación entre proyectos — esta página
documenta que ya se consideró y por qué se descartó explícitamente: el
wiki existe para que este repo sea autocontenido, no para centralizar
conocimiento entre proyectos. Si esa necesidad aparece genuinamente, la
respuesta razonable es un wiki separado *adicional*, no migrar o vaciar este.

## Ver también

- `wiki/CLAUDE.md` — reglas de mantenimiento vigentes (estructura `raw/` +
  `paginas/`, flujo de ingesta/consulta/auditoría) que son la consecuencia
  directa de esta decisión.
