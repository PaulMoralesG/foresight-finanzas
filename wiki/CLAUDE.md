# CLAUDE.md — Wiki de contexto de foresight-finanzas

Esta carpeta es una base de conocimiento **exclusiva de foresight-finanzas**,
mantenida por Claude siguiendo el patrón "LLM Wiki": las fuentes en bruto se
leen una vez y se integran en un wiki de markdown interconectado sobre este
proyecto (arquitectura, decisiones, contexto de negocio, notas de diseño),
que se mantiene solo y va acumulando valor en vez de re-derivarse en cada
pregunta.

No es un wiki personal genérico — no mezclar aquí contenido de otros
proyectos (ej. balance-dual) ni notas sin relación con foresight-finanzas.
Se edita con Obsidian (bóveda apuntando a esta carpeta `wiki/`) y se versiona
junto con el resto del repo — no tiene su propio git.

## Relación con el `CLAUDE.md` raíz del repo

El `CLAUDE.md` de la raíz documenta las convenciones y la arquitectura *tal
como son ahora* (se lee del código) y es la fuente de verdad sobre ellas. El
wiki tiene **dos tipos de página** en `paginas/`, distinguidos por el campo
`tipo` del frontmatter:

- **Páginas de mapa/arquitectura** (`tipo: mapa`) — sintetizan la
  arquitectura real del proyecto para navegar rápido por el grafo de
  Obsidian. Se derivan *a propósito* del código y del `CLAUDE.md` raíz (por
  pedido explícito del usuario: que el índice esté relacionado con todas las
  áreas del proyecto desde el principio). Reglas:
  - Resumir con palabras propias, no copiar texto literal del `CLAUDE.md` raíz.
  - Verificar contra el código antes de afirmar algo concreto, y citar rutas
    reales (ej. `src/stores/financeStore.ts`).
  - Enlazar con wikilinks entre sí y de vuelta a `[[mapa-del-proyecto]]`, la
    página hub.
  - Llevar al inicio una nota de que pueden quedar desactualizadas si el
    código cambia: son candidatas fijas a revisión en cada auditoría (lint).
  - Si una página de mapa contradice al `CLAUDE.md` raíz o al código, manda
    el código; la página se corrige (y la discrepancia con el `CLAUDE.md`
    raíz se reporta, no se arregla en silencio desde aquí).
- **Páginas de decisión/contexto** (`tipo: decision`) — documentan lo que
  **no** se deriva leyendo el código: el porqué de una decisión, contexto de
  negocio, aprendizajes de un bug, ideas descartadas y por qué, investigación
  previa a una feature (ej. [[decision-alcance-del-wiki]]). Estas no
  envejecen con el código; si una decisión se revierte, se anota en la
  página en vez de borrarla.

## Las dos capas

- **`raw/`** — fuentes en bruto sobre este proyecto (specs descartadas,
  capturas de conversaciones, artículos de referencia, transcripciones).
  **Inmutables**: Claude las lee pero nunca las edita ni las borra. Adjuntos
  e imágenes van en `raw/assets/`. Es la fuente de verdad.
- **`paginas/`** — páginas markdown generadas y mantenidas por Claude:
  resúmenes, páginas de entidad/concepto (ej. una página por cada store de
  Zustand, por el motor de sync, por una decisión de arquitectura), síntesis.
  Organización flat con wikilinks (`[[Nombre de la página]]`) y frontmatter
  (`tags`, `fecha`, `fuentes`) en vez de subcarpetas rígidas — a este tamaño
  de wiki (un solo proyecto) alcanza con el grafo de Obsidian y `index.md`
  para navegar; si en el futuro crece mucho, se puede introducir subcarpetas
  por tema y documentarlo aquí.

## index.md y log.md

- **`index.md`** — catálogo de todas las páginas de `paginas/`, con enlace y
  resumen de una línea cada una. Se actualiza en cada ingesta. Al responder
  una consulta, Claude lee primero `index.md` para encontrar páginas
  relevantes antes de abrirlas.
- **`log.md`** — registro cronológico, solo-apendice. Cada entrada empieza
  con el prefijo `## [YYYY-MM-DD] tipo | Título` (tipo: `ingest` | `query` |
  `lint`), así queda grepeable (`grep "^## \[" log.md | tail -5`).

## Operaciones

**Ingerir** una fuente nueva sobre este proyecto:
1. Colocar el archivo original en `raw/` (o `raw/assets/` si es una
   imagen/adjunto) sin modificarlo.
2. Leerlo y discutir los puntos clave con el usuario si aplica.
3. Escribir o actualizar la página de resumen correspondiente en `paginas/`.
4. Actualizar las páginas de entidad/concepto relacionadas ya existentes,
   señalando explícitamente si la fuente nueva contradice o refuerza algo
   anterior (no lo pises en silencio — dejá constancia de la tensión).
5. Actualizar `index.md`.
6. Añadir una entrada a `log.md` con prefijo `## [YYYY-MM-DD] ingest | <título>`.

**Consultar** el wiki:
1. Leer `index.md` para ubicar páginas relevantes.
2. Leer esas páginas y sintetizar una respuesta con referencias a las páginas
   fuente (no a `raw/` directamente salvo que haga falta el detalle exacto).
3. Si la respuesta tiene valor duradero (una comparación, un análisis, una
   conexión nueva sobre el proyecto), ofrecer archivarla como página nueva en
   `paginas/` en vez de dejarla perderse en el historial de chat.
4. Si se archiva, actualizar `index.md` y añadir entrada a `log.md` con
   prefijo `## [YYYY-MM-DD] query | <título>`.

**Auditar** (lint) — cuando el usuario lo pida, o si se detecta al ingerir:
- Revisar **todas** las páginas `tipo: mapa` contra el estado actual del
  código (`src/`, configs) y del `CLAUDE.md` raíz: rutas de archivo que ya
  no existen, funciones renombradas, invariantes o números que cambiaron
  (versión del store, debounce, breakpoints, vistas del catálogo).
- Contradicciones entre páginas, o entre una página y el `CLAUDE.md` raíz
  actual del repo (señal de que el código cambió y la página quedó vieja).
- Áreas nuevas de la arquitectura que aparecieron en el código o en el
  `CLAUDE.md` raíz y aún no están en `[[mapa-del-proyecto]]`.
- Páginas huérfanas (sin enlaces entrantes).
- Conceptos del proyecto mencionados varias veces que aún no tienen página
  propia.
- Referencias cruzadas faltantes.
Reportar los hallazgos y, si el usuario confirma, corregir y registrar en
`log.md` con prefijo `## [YYYY-MM-DD] lint | <alcance>`.

## Convenciones

- Idioma: español, igual que el resto del repo.
- Enlaces entre páginas con sintaxis wikilink de Obsidian (`[[Nombre de la página]]`).
- Frontmatter YAML en cada página de `paginas/`: `tipo` (`mapa` | `decision`,
  obligatorio), más `tags`, `fecha` y `fuentes` cuando apliquen — habilita
  consultas con el plugin Dataview si se instala.
- `index.md` agrupa las páginas por tipo: "Mapa del proyecto" y
  "Decisiones y contexto".
- Nunca borrar ni mover archivos de `raw/`. Si una fuente queda obsoleta, se
  anota en la página correspondiente de `paginas/`, no se elimina la fuente.
- Este wiki se versiona junto con el código del repo (mismo git, mismos
  commits en Conventional Commits en español si se toca algo aquí) — no
  tiene su propio `.git`.
