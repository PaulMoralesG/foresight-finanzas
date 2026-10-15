---
tipo: decision
tags: [decision, sync, store, bug]
fecha: 2026-10-15
fuentes: [src/stores/financeStore.ts, src/lib/merge.ts]
---

# Decisión: `restoreTransactions` sella `updated_at` (C1)

Volver a [[mapa-del-proyecto]]. Relacionado: [[stores-zustand]], [[sync-y-autenticacion]].

## Contexto

El "Deshacer" de un borrado llama a `restoreTransactions` (`src/stores/financeStore.ts`),
que antes devolvía los movimientos con su `updated_at` original.

## El bug

Si el borrado ya había subido su tombstone al servidor, el `deleted_at` del
tombstone era **más nuevo** que el `updated_at` original del movimiento. En el
siguiente merge ([[sync-y-autenticacion]]: gana la marca más nueva, y una
edición *posterior* al borrado resucita), el tombstone ganaba y la fila
restaurada se volvía a borrar: el undo "se revertía" tras sincronizar. En una
deuda **no anclada** el pago restaurado se había vuelto a descontar del
`balance` (`aplicarCambioDePagos`), y al borrarse otra vez por sync el saldo
quedaba descontado dos veces.

## Decisión

Al restaurar se conservan `id` y `created_at`, pero se **sella
`updated_at = nowIso()`**. Restaurar es una edición posterior al borrado, y la
regla de merge ya la lee como la intención más reciente. Los ajustes de deuda
(`ajustarDeudas`) se calculan sobre los movimientos ya re-sellados.

## Descartado

No tocar el merge para que "gane el vivo": rompería la propagación de borrados
entre dispositivos, que es la invariante central del tombstone.
