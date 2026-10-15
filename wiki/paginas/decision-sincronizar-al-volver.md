---
tipo: decision
tags: [decision, sync, recurrencias, pwa]
fecha: 2026-10-15
fuentes: [src/lib/sync.ts, src/components/layout/AppLayout.tsx]
---

# Decisión: `syncService.sincronizarAlVolver()` (A1)

Volver a [[mapa-del-proyecto]]. Relacionado: [[sync-y-autenticacion]], [[stores-zustand]].

## Problema

Al volver a la pestaña, `AppLayout` materializaba recurrencias en el
`visibilitychange` **en paralelo** con el ciclo completo de sync que dispara
`syncService.init()`. Si otro dispositivo había editado o borrado una
ocurrencia, la regeneración local (mismo id determinista, `updated_at` más
nuevo) podía ganarle el merge al cambio remoto. Al arrancar ya se evitaba
esperando `primerSyncCompleto`; faltaba el mismo orden al *volver*.

## Decisión

`sincronizarAlVolver()` (en `src/lib/sync.ts`) resuelve cuando termina el ciclo
completo del regreso. `AppLayout` lo espera (solo con Supabase y solo al volver,
no al montar) y después llama a `materializarRecurrencias()`. Si el ciclo falla
(sin red, error de servidor) se materializa igual, como en modo offline.

## Por qué NO `flush(true)` directo

El listener `visibilitychange` de `init()` (registrado antes, en `main.tsx`)
normalmente **ya arrancó** el ciclo completo. Un `flush(true)` desde
`AppLayout` encolaría un *segundo* ciclo completo (pull entero duplicado en
cada regreso). Por eso la función: si hay algo en vuelo o con timer agendado,
solo espera a que no quede nada (bucle sobre `pushInFlight`/`timer`); si no hay
nada, arranca ella misma `flush(true)`.

## Regla que se mantiene

`materializarRecurrencias()` sigue llamándose solo desde el efecto de
`AppLayout` y nunca desde uno que dependa de `expenses`/`recurrences`.
