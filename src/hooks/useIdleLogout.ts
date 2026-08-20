// ================================================================
// useIdleLogout — cierre de sesión por inactividad
// ================================================================

import { useEffect, useRef, useState } from 'react';

/** Minutos sin actividad antes de cerrar la sesión. */
export const IDLE_MINUTES = 30;
/** Segundos de aviso previo, para poder seguir conectado. */
export const IDLE_WARN_SECONDS = 60;

/** Eventos que cuentan como "el usuario sigue ahí". */
const ACTIVIDAD = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

interface Opciones {
  /** Desactivar en modo offline: no hay sesión que proteger. */
  enabled: boolean;
  onTimeout: () => void;
}

/**
 * Cierra la sesión tras un periodo sin interacción.
 *
 * Sin esto la sesión duraba indefinidamente: `persistSession: true` la guarda
 * en localStorage y `autoRefreshToken: true` renueva el token para siempre, de
 * modo que una pestaña abierta en un portátil prestado seguía autenticada
 * semanas después. Para una app que muestra el detalle financiero de un
 * negocio, eso es demasiado.
 *
 * El reloj se lleva con una marca de tiempo y UN intervalo que comprueba cada
 * pocos segundos, en vez de reprogramar un `setTimeout` en cada pulsación:
 * miles de eventos de teclado no deben traducirse en miles de timers.
 *
 * Devuelve el estado del aviso para que la interfaz pueda ofrecer "seguir
 * conectado" antes de cerrar sin previo aviso.
 */
export function useIdleLogout({ enabled, onTimeout }: Opciones) {
  const [avisando, setAvisando] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(IDLE_WARN_SECONDS);

  // Se inicializan a 0 y se fijan dentro del efecto: llamar a Date.now()
  // durante el render es impuro y React lo marca como error.
  const ultimaActividad = useRef(0);
  const yaCerrado = useRef(false);

  // En una ref para que el intervalo no dependa de la identidad de la función,
  // y asignada en un efecto (escribir en una ref durante el render también
  // está prohibido: el render debe ser puro).
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!enabled) return;

    yaCerrado.current = false;
    ultimaActividad.current = Date.now();

    const marcar = () => {
      ultimaActividad.current = Date.now();
    };
    for (const ev of ACTIVIDAD) {
      window.addEventListener(ev, marcar, { passive: true });
    }

    // Volver a la pestaña cuenta como actividad: el usuario está de vuelta.
    const alVolver = () => {
      if (document.visibilityState === 'visible') marcar();
    };
    document.addEventListener('visibilitychange', alVolver);

    const limiteMs = IDLE_MINUTES * 60_000;
    const avisoMs = limiteMs - IDLE_WARN_SECONDS * 1000;

    const intervalo = setInterval(() => {
      const inactivo = Date.now() - ultimaActividad.current;

      if (inactivo >= limiteMs) {
        if (yaCerrado.current) return;
        yaCerrado.current = true;
        setAvisando(false);
        onTimeoutRef.current();
        return;
      }

      if (inactivo >= avisoMs) {
        setAvisando(true);
        setSegundosRestantes(Math.ceil((limiteMs - inactivo) / 1000));
      } else {
        setAvisando(false);
      }
    }, 1000);

    return () => {
      clearInterval(intervalo);
      for (const ev of ACTIVIDAD) window.removeEventListener(ev, marcar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [enabled]);

  return { avisando, segundosRestantes };
}
