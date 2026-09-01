// ================================================================
// Recuperación de chunks caídos
//
// Las páginas pesadas se cargan con import() dinámico, y sus chunks llevan
// hash en el nombre. Al publicar una versión, los nombres cambian y los
// anteriores desaparecen del servidor.
//
// El problema: el service worker precachea el shell (index.html + entrada),
// pero `globIgnores` deja fuera los chunks de las páginas lazy, que se sirven
// con CacheFirst. Si el usuario nunca visitó Estadísticas, ese chunk no está
// en caché. Tras un despliegue, el shell viejo —servido desde el precache—
// pide un chunk que ya no existe:
//
//   TypeError: Failed to fetch dynamically imported module: /assets/StatsPage-<hash>.js
//
// y la pantalla entera cae al ErrorBoundary. Es exactamente lo que le pasaba a
// Estadísticas, y le pasaría igual a Planes, al login y al modal de reporte.
//
// El worker nuevo ya está instalado y esperando en ese momento —trae el shell
// correcto y sabe pedir los chunks nuevos—, así que la salida es activarlo y
// recargar. Recargar a secas no basta: el worker viejo seguiría sirviendo el
// mismo shell caducado.
// ================================================================

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Marca de que ya intentamos recuperarnos, para no entrar en bucle de recargas. */
const CLAVE_INTENTO = 'foresight-recuperacion-chunk';

/**
 * ¿El fallo es "no pude descargar el módulo" y no un error de render?
 *
 * Las tres primeras frases son como Chrome/Safari envuelven CUALQUIER fallo
 * de red de un import() dinámico, MIME incorrecto incluido. Pero el fallo más
 * probable en este proyecto no es de red: es el rewrite catch-all de
 * `vercel.json` (`/(.*) → /index.html`, necesario para el ruteo de la SPA).
 * Cuando el chunk pedido —con el hash de un deploy anterior— ya no existe en
 * el deploy actual, Vercel no responde 404: cae al fallback y sirve
 * `index.html` con `Content-Type: text/html` y código 200. El navegador
 * intenta ejecutar HTML como módulo JS y lo rechaza por tipo MIME.
 *
 * Chrome normaliza ese caso bajo el mismo "Failed to fetch..." de arriba, así
 * que ya estaba cubierto. Firefox (y potencialmente otros) reportan el motivo
 * real por separado, sin que ninguna de las tres frases anteriores aparezca —
 * y como el error no encaja en `esFalloDeCarga`, la app no activa la
 * recuperación: se queda en el estado roto que dejó el import() fallido.
 */
function esFalloDeCarga(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('unsupported MIME type') ||
    msg.includes('Failed to load module script') ||
    msg.includes('MIME type mismatch')
  );
}

function leerIntento(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_INTENTO) === '1';
  } catch {
    return false; // modo privado o almacenamiento bloqueado
  }
}

function marcarIntento(v: boolean) {
  try {
    if (v) sessionStorage.setItem(CLAVE_INTENTO, '1');
    else sessionStorage.removeItem(CLAVE_INTENTO);
  } catch {
    /* sin sessionStorage nos quedamos sin guardia: mejor eso que no recuperar */
  }
}

/**
 * Espera a que aparezca un worker EN ESPERA, hasta `limiteMs`.
 *
 * `registration.update()` resuelve cuando termina la comprobación, no cuando
 * el worker nuevo acaba de instalarse: mirando `waiting` una sola vez justo
 * después, casi siempre está vacío todavía. Sin esta espera, la recuperación
 * caía a una recarga que volvía a servir el mismo shell caducado —y encima
 * gastaba el único intento permitido—.
 */
function esperarWorkerEnEspera(
  registro: ServiceWorkerRegistration,
  limiteMs = 8000,
): Promise<ServiceWorker | null> {
  if (registro.waiting) return Promise.resolve(registro.waiting);

  return new Promise((resolve) => {
    let resuelto = false;
    const terminar = (w: ServiceWorker | null) => {
      if (resuelto) return;
      resuelto = true;
      clearInterval(sondeo);
      clearTimeout(limite);
      resolve(w);
    };

    // `updatefound` da el momento exacto; el sondeo cubre el caso en que la
    // instalación ya estuviera en curso antes de llegar aquí.
    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing;
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && registro.waiting) terminar(registro.waiting);
      });
    });

    const sondeo = setInterval(() => {
      if (registro.waiting) terminar(registro.waiting);
    }, 250);
    const limite = setTimeout(() => terminar(null), limiteMs);
  });
}

/**
 * Intenta dejar la app en una versión coherente. Devuelve true si va a
 * recargar, en cuyo caso quien llama no debe hacer nada más.
 */
async function recuperar(): Promise<boolean> {
  if (leerIntento()) return false; // ya lo intentamos en esta pestaña

  if ('serviceWorker' in navigator) {
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      if (registro) {
        registro.update().catch(() => {});
        const enEspera = await esperarWorkerEnEspera(registro);
        if (enEspera) {
          // Solo ahora se gasta el intento: hay un worker que de verdad puede
          // arreglar la situación. Al activarse reclama los clientes y
          // main.tsx recarga por `controllerchange`, así que no recargamos
          // aquí para no hacerlo dos veces.
          marcarIntento(true);
          enEspera.postMessage({ type: 'SKIP_WAITING' });
          return true;
        }
      }
    } catch {
      /* seguimos a la recarga normal */
    }
  }

  // Sin worker nuevo a la vista: puede ser un fallo de red puntual. Una
  // recarga es lo único que queda, y sí gasta el intento.
  marcarIntento(true);
  window.location.reload();
  return true;
}

/**
 * `React.lazy` que sobrevive a un despliegue.
 *
 * Ante un fallo de descarga del módulo activa el worker en espera y recarga.
 * Ante cualquier otro error —uno de render, por ejemplo— no toca nada y deja
 * que lo vea el ErrorBoundary: recargar en bucle sería peor que el fallo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyConRecuperacion<T extends ComponentType<any>>(
  cargar: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const modulo = await cargar();
      // Cargó bien: la pestaña está sana y puede volver a intentarlo si algún
      // día hace falta.
      marcarIntento(false);
      return modulo;
    } catch (err) {
      if (esFalloDeCarga(err)) {
        const recargando = await recuperar();
        if (recargando) {
          // Promesa que nunca resuelve: la página se va a recargar de todos
          // modos y así no parpadea el ErrorBoundary por el camino.
          return await new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }
  });
}
