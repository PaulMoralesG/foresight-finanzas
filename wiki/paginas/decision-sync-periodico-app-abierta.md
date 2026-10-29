---
tipo: decision
tags: [decision, sync, supabase, pwa, bateria]
fecha: 2026-10-29
fuentes: [src/lib/sync.ts, src/__tests__/sync-periodico.test.ts]
---

# Decisión: sync periódico con la app abierta (polling incremental, no Realtime)

Volver a [[mapa-del-proyecto]]. Relacionado: [[sync-y-autenticacion]],
[[decision-sincronizar-al-volver]], [[decision-aplicando-merge-y-tombstones]].
Rama `feat/sync-periodico-app-abierta`.

## Problema

El dueño editó un movimiento en el navegador de escritorio (50 → 40) y la PWA
del móvil, abierta en primer plano, no lo recibía ni cambiando de sección. El
pull solo ocurría en `attach` (login), `visibilitychange → visible`, `online`
y dentro de los ciclos que dispara una edición local. Una app que se queda
abierta y visible no volvía a preguntar al servidor. No hay Supabase Realtime
en `src/`.

## Decisión

Mientras haya sesión sincronizada (`userId`, sync no desactivado), la pestaña
esté visible y haya red, `sync.ts` mantiene **un solo `setInterval`**
(`INTERVALO_SYNC_PERIODICO_MS = 60_000`) que lanza un ciclo **incremental**
por el camino de siempre (`performPush`: single-flight, marca de agua,
reintentos con backoff). El evento `focus` de la ventana lanza el mismo ciclo
(volver a la ventana sin cambiar de pestaña no dispara `visibilitychange`).

Reglas del tick (`cicloPeriodico`):

- Si ya hay un ciclo en vuelo o uno agendado (`pushInFlight`/`timer`), no
  hace nada. Llamar a `performPush` con uno en vuelo *encolaría* otro.
- No corre mientras `attach` no termina ni con `primerSyncCompleto` falso.
- No corre tras un error permanente (RLS, JWT rechazado; no de red): si no,
  repetiría reintentos y reportes a `error_log` cada minuto. El próximo
  regreso a la pestaña, `online` o una edición local lo vuelven a probar.
- `actualizarSondeo()` crea o suelta el intervalo según las condiciones: se
  llama en `attach`, `detach`, `disable`, `visibilitychange`, `online` y
  `offline`. Oculta u offline **no hay timer** (no despierta la CPU). Al
  volver visible, el ciclo completo existente cubre lo que pasó mientras tanto.
- El intervalo **no es trabajo programado**: `flush()` y
  `hayCambiosSinSubir()` solo miran `timer`/`pushInFlight`, así que el logout
  no espera al sondeo.
- Lo que trae el pull llega a la UI porque `applyMerge` escribe en el store;
  ese `setState` no agenda un ciclo de rebote gracias a `aplicandoMerge`.
  `materializarRecurrencias` no se toca.

## Coste

Con la app abierta y visible: ~1 ciclo por minuto = 11 `select` incrementales
(uno por tabla, filtrados por `updated_at >= marca − 5 min`, normalmente
vacíos o de pocas filas) más los upserts de lo que haya cambiado (casi
siempre nada: el push también es incremental). Unas 660 peticiones ligeras
por hora de uso activo; cero con la app oculta o sin red.

## Descartado

- **Supabase Realtime** (`postgres_changes`): exige cambios de
  infraestructura en la base — añadir las tablas a la publicación
  `supabase_realtime`, revisar RLS para el canal — y un segundo camino de
  entrada de datos al store que tendría que replicar el merge, los
  tombstones y la marca de agua. El polling reutiliza el motor y su marca de
  agua sin tocar la base, y el retraso (≤ 60 s) es aceptable para una app de
  finanzas personales. Revisar si se necesita colaboración en tiempo real.
- **Intervalo más corto** (10–30 s): más batería y cuota por poco beneficio
  real; además `focus` ya cubre el caso de "vuelvo a mirar la app".
- **Sondear también con la pestaña oculta**: el regreso a la pestaña ya hace
  un ciclo completo; sondear oculta solo gastaría batería.
