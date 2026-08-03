import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App';
import './index.css';

// ================================================================
// SENTRY — Monitoreo de errores en producción
// ================================================================
if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || '',
    environment: import.meta.env.VITE_SENTRY_ENV || 'production',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Prevenir gestos de navegación izquierda/derecha en iOS (tanto Safari como PWA)
document.documentElement.style.overscrollBehaviorX = 'none';
document.body.style.overscrollBehaviorX = 'none';

// ================================================================
// Service Worker — auto-update con verificación periódica y al volver a la app
// ================================================================
if ('serviceWorker' in navigator) {
  let refreshing = false;
  let swRegistration: ServiceWorkerRegistration | null = null;

  // Detecta cuando un nuevo SW toma el control y recarga la página
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // Fuerza una verificación de update del SW
  const checkForUpdate = () => {
    if (swRegistration) {
      swRegistration.update().catch(() => {});
    }
  };

  // Verifica actualizaciones cuando el usuario vuelve a la app (PWA foreground)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate();
    }
  });

  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      // Si ya hay un SW esperando (instalado pero no activado),
      // skipWaiting ya lo activará → controllerchange se disparará → recarga
      if (swRegistration.waiting) {
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Escuchar nuevos SW que quedan en espera
      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration?.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // Nueva versión lista — forzar activación
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // Verificar updates periódicamente (cada 5 min) como fallback
      setInterval(checkForUpdate, 5 * 60 * 1000);

      // Verificar al inicio (por si el SW registrado tiene update pendiente)
      checkForUpdate();
    } catch (err) {
      console.error('SW registration failed:', err);
    }
  });
}
