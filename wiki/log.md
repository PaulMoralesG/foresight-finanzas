# Log

Registro cronológico, solo-apendice. Formato de cada entrada:
`## [YYYY-MM-DD] tipo | Título` (tipo: `ingest` | `query` | `lint`).

## [2026-09-30] lint | Creación del wiki (acotado a foresight-finanzas)

Se movió la bóveda de Obsidian que había quedado anidada por error dentro del
propio repo (`foresight-finanzas/foresight-finanzas/`) a `wiki/` en la raíz
del repo. Se descartó la idea inicial de un wiki personal multi-proyecto:
por decisión explícita del usuario, este wiki es exclusivo de
foresight-finanzas. Estructura final: `raw/` (+ `raw/assets/`) + `paginas/`
(flat, con wikilinks) + `index.md` + `log.md` + `CLAUDE.md`, versionado junto
con el resto del repo (sin `.git` propio).

## [2026-09-30] ingest | Decisión sobre el alcance del wiki

Primera ingesta real de contenido: se documentó en
[[decision-alcance-del-wiki]] el razonamiento completo detrás de la entrada
de lint anterior — la propuesta descartada de un wiki personal
multi-proyecto fuera del repo, la corrección explícita del usuario (wiki y
`raw/` exclusivos de foresight-finanzas, sin notas de otros proyectos como
Balance Dual), y por qué el wiki vive versionado dentro del propio repo.
Se evaluó crear también una página `estructura-del-wiki.md`, pero se
descartó por redundante con `wiki/CLAUDE.md`, que ya cubre esa estructura.

## [2026-09-30] ingest | Mapa completo de arquitectura del proyecto

A pedido explícito del usuario —que el índice del wiki "esté relacionado con
todas las cosas del proyecto" desde ya ("mapa completo ya mismo")— se
cambió la regla de `CLAUDE.md` que prohibía duplicar lo derivable del código:
ahora hay dos tipos de página, `tipo: mapa` (síntesis de arquitectura,
revisadas en cada lint contra el código y el `CLAUDE.md` raíz) y
`tipo: decision` (lo que no se deriva del código). Se crearon, verificando
contra `src/` y las configs: [[mapa-del-proyecto]] (hub),
[[stores-zustand]], [[sync-y-autenticacion]],
[[navegacion-y-code-splitting]], [[pwa-y-service-worker]],
[[logica-de-negocio-pura]], [[diseno-y-responsive]] y [[testing]]. El hub
enlaza también a [[decision-alcance-del-wiki]] para que el grafo quede
conectado. No se creó nada en `raw/`: es una síntesis del propio código, no
una fuente externa.

## [2026-09-30] ingest | Correcciones de la auditoría técnica

La auditoría técnica (skill `auditoria-tecnica`) cambió dos contratos ya
mapeados: `accountIsUsed()`/`deleteAccount` ahora también cuentan las
recurrencias ([[stores-zustand]], [[logica-de-negocio-pura]]) y
`syncService.adjuntado()` es falso en modo `local-only`, así `signOut()` ya no
borra datos no subidos en ese modo ([[sync-y-autenticacion]]). Tercer cambio,
sin página de mapa: `error-reporter.ts` deja de guardar query y fragmento de
la URL (podían llevar tokens de sesión). Sin páginas nuevas: `index.md` sigue
vigente.

## [2026-10-01] lint | Saldo de deudas anclado (PR #33) desactualizado en el wiki y en el `CLAUDE.md` raíz

Una auditoría técnica posterior al merge del PR #33 (`.agents/specs/sync-saldo-deudas.md`)
detectó que [[stores-zustand]] y [[logica-de-negocio-pura]] seguían
describiendo la invariante vieja de deudas: `balance` ajustado siempre por
delta directo vía `src/lib/debt-payments.ts`, sin mencionar el anclaje. Esa
invariante cambió con el PR #33: una deuda puede quedar **anclada**
(`saldoBase`/`contadoBase`, desde `addDebt` o vía `confirmarSaldoDeuda`), y
en ese caso el `balance` pasa a ser *derivado* por `recalcularSaldos`
(`src/lib/debt-balance.ts`), excluyendo los pagos marcados `debtHistorico`
(vinculados con `vincularPagoHistorico`). Una deuda sin anclar sigue el
camino viejo de `src/lib/debt-payments.ts`. Se corrigieron ambas páginas y el
bullet equivalente del `CLAUDE.md` raíz (sección de `financeStore.ts` y la
lista de `src/lib/`). Sin páginas nuevas: `index.md` sigue vigente.
