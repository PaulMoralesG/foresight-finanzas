---
tipo: decision
tags: [decision, auth, sesion, datos-locales, auditoria]
fecha: 2026-10-29
fuentes: [src/hooks/useAuth.ts, src/lib/dueno-datos.ts, src/components/features/auth/LoginForm.tsx, src/lib/exportar-respaldo.ts]
---

# Decisión: aviso antes de que otra cuenta descarte cambios sin subir, y generación de sesión

Volver a [[mapa-del-proyecto]]. Relacionado: [[sync-y-autenticacion]],
[[decision-aplicando-merge-y-tombstones]]. Dos pendientes de la auditoría de
octubre de 2026 (rama `fix/auth-cambio-de-cuenta-y-carrera`).

## 1. Cambio de cuenta con datos sin subir

**Problema.** Si la cuenta A cerró conservando datos (`conservarDatos` en el
dueño de `dueno-datos.ts`: cierre por inactividad o sesión caída con cambios
sin subir) y en ese dispositivo entra la cuenta B, `cargarPerfil` hace
`reset()` y los cambios de A que nunca llegaron al servidor se pierden **sin
aviso**. Antes se había dejado como "aceptado por diseño".

**Lo que no cambia.** El `reset()` sigue ahí (ALT-1): los cambios de A no se
pueden subir con la sesión de B (RLS) ni quedarse mezclados con los de B.

**Decisión.** Avisar *antes* del login, no durante la carga de sesión.
`LoginForm` llama a `datosSinSubirDeOtraCuenta(email)` antes de
`signInWithPassword`: si el dueño guardado tiene `conservarDatos` y su email
(sin distinguir mayúsculas ni espacios) no es el tecleado, abre un
`ConfirmDialog` (`danger`) que nombra la cuenta anterior y dice que esos
cambios se perderán. Opciones: **Cancelar** (no se llama a Supabase, no se toca
nada), **Entrar y descartarlos** (sigue el login normal; `cargarPerfil` hace el
reset de siempre) y **Exportar respaldo** (descarga el JSON del estado local
sin cerrar el aviso; `exportarRespaldoLocal()`, compartido con Ajustes).
`ConfirmDialog` ganó un `children` opcional bajo el mensaje para esa acción
secundaria.

**Por qué ahí.** Es el único punto donde aún no hay sesión de B: cancelar es
gratis. Interceptar en `cargarPerfil` habría obligado a pausar una sesión ya
establecida, cerrarla y volver a pedir credenciales, tocando la máquina de
estados de `useAuthSession`. La señal es `conservarDatos` y no
`syncService.hayCambiosSinSubir()`, porque en la pantalla de login el sync
está desadjuntado y al arrancar marca `true` por precaución.

**Compromisos asumidos.**
- Se compara por email porque el uid de B aún no se conoce. Si A cambió de
  correo en otro dispositivo, el aviso sobra; confirmar no borra nada
  (`cargarPerfil` compara por uid).
- Sin aviso quedan las entradas que no pasan por el formulario: el enlace de
  confirmación de registro o de recuperación de contraseña abierto con la
  sesión en la URL. Ahí la sesión ya existe cuando el código se entera.

## 2. Carrera entre cargas de perfil de dos cuentas

**Problema.** El guard `cargandoPara` es por uid: no frena la carga de otra
cuenta, a propósito. Pero si llegaba un `SIGNED_IN` de B con la carga de A
(`getSession`) aún en vuelo, ambas corrían y **ganaba la última en
terminar**: con A lenta, quedaban `setUser(A)`, dueño A y el sync adjuntado a
A aunque la sesión vigente era la de B. Además, si A fallaba tarde, su `catch`
hacía `syncService.detach()` sobre el sync de B.

**Decisión.** Un contador `generacion` dentro del efecto de
`useAuthSession`. Cada `loadProfile` que arranca lo incrementa y se queda con
su número; `sinSesion` también lo incrementa. `cargarPerfil` comprueba
`obsoleta()` (`cancelled || miGeneracion !== generacion`) tras leer el perfil
(antes de escribir en `profiles`), antes de `setUser`/dueño/`attach` y al
principio del `catch`. Una carga obsoleta sale sin efectos. De paso cubre una
carga que termina después de un `SIGNED_OUT`: ya no resucita la sesión.

**Descartado.** Comparar solo por uid (`uid !== uidVigente`): no distingue
A → B → A (dos cargas de A, la vieja seguiría siendo "válida").

Tests: `useAuth-carrera.test.ts` (A lenta + B rápida → queda B; fallo tardío de
A no desadjunta B; carga tras `SIGNED_OUT`) y `login-cambio-de-cuenta.test.tsx`.
