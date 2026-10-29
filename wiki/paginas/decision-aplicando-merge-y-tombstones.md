---
tipo: decision
tags: [decision, sync, tombstones, store, auditoria]
fecha: 2026-10-29
fuentes: [src/lib/sync.ts, src/stores/financeStore.ts, src/lib/debt-balance.ts, src/hooks/useAuth.ts]
---

# Decisión: `aplicandoMerge`, tombstones en `update*` e `importBackup`

Volver a [[mapa-del-proyecto]]. Relacionado: [[sync-y-autenticacion]],
[[stores-zustand]], [[decision-restaurar-sella-updated-at]]. Salió de la
auditoría técnica de octubre de 2026 (rama `fix/auditoria-tecnica-octubre-2026`).

## 1. Flag `aplicandoMerge` en `sync.ts`

**Problema.** La suscripción al `financeStore` marca "edición del usuario" ante
cualquier cambio. El `setState` con el que `applyMerge` escribe lo traído del
servidor también la disparaba: cada ciclo que bajaba algo agendaba *otro* ciclo
entero, y así hasta que un pull no traía nada nuevo.

**Decisión.** `aplicandoMerge` vale `true` solo mientras `applyMerge` hace ese
`setState`; la suscripción lo ignora para `dirtyDuringSync`/agendar. Es seguro
porque `applyMerge` lee el estado y escribe en el mismo tick síncrono (ninguna
acción del usuario puede intercalarse) y el `pushAll` del mismo ciclo sube el
*resultado del merge*, no el store. Las ediciones del usuario durante el `await`
del pull o del push siguen marcando dirty. `cambiosSinSubir` se pone a `true`
igualmente (conservador: si el push falla, lo mergeado cuenta como sin subir).

**Consecuencia asumida: el saldo derivado no se sube solo.** El recálculo de
`recalcularSaldos` tras el merge no toca `updated_at`, así que el push
incremental no incluye la deuda y un push completo la reenvía con el mismo
`updated_at` (`keep_newest` puede descartarla). El `balance` remoto de una
deuda anclada es una caché posiblemente rancia; la verdad es `saldo_base` + los
pagos, y cada dispositivo la recalcula al mergear. Sellar `updated_at` por un
recálculo haría que dos dispositivos se pisaran la deuda en cada ciclo y podría
ganarle a una edición real.

## 2. `update*` son no-op si el id no está vivo

Antes, `updateTransaction`/`updateDebt` (y los demás) llamaban a
`clearedTombstone` aunque la fila ya no existiera. Un modal abierto sobre algo
borrado (aquí o por sync) quitaba el tombstone sin recrear la fila: el borrado
nunca llegaba al servidor y el siguiente pull la devolvía. Ahora devuelven
`state` tal cual (sin notificar) si no hay registro vivo. Resucitar un borrado
sigue siendo posible, pero solo a propósito: recreando con `add*`/restaurando.

## 3. `importBackup` conserva tombstones ajenos al respaldo

Antes vaciaba `tombstones`, perdiendo borrados pendientes de subir. Ahora
conserva los de ids que el respaldo **no** trae (borrados pendientes) y quita
los de ids que sí trae (el respaldo los restaura). Además reinicia
`pendienteHidratar` y `descuentosDePago`, que describen movimientos/deudas de
antes del respaldo. El import sigue sin borrar nada del servidor: lo que esté en
la nube y no en el respaldo vuelve con el próximo pull.

## Otros cambios de la misma auditoría (sin decisión nueva)

- `useAuthSession`: guard `cargandoPara` (por uid) evita el doble
  `loadProfile`/`attach` por `getSession()` + `INITIAL_SESSION`.
- `useIdleLogout`: al volver a la pestaña comprueba el tiempo transcurrido (el
  navegador congela el intervalo con la pestaña oculta) y cierra si ya pasó el límite.
- `error-reporter`: de los errores planos de PostgREST solo guarda `code` y
  `message`, nunca `details`/`hint` (pueden traer datos de la fila).
- Migración `0021`: revoca `EXECUTE` de `keep_newest()` a `PUBLIC`/`anon`/`authenticated`
  (los triggers no se ven afectados).

## Descartado

- **Índices `(user_id, updated_at)`** para acelerar el pull/push incremental:
  con el volumen actual de datos por usuario no compensan el coste de escritura
  ni una migración más. Revisar si el volumen crece.
- **Cambiar el `reset()` al entrar otra cuenta**: si la cuenta nueva entra con
  datos sin subir de la anterior, `reset()` los borra; conservarlos implicaría
  que la cuenta nueva adoptara datos ajenos. El reset no se cambia, pero ya no
  es silencioso: el login avisa antes (ver
  [[decision-aviso-cambio-de-cuenta-y-carrera]]).
- **Sellar `updated_at` al recalcular saldos derivados** para que viajen por
  sync: ver sección 1.
