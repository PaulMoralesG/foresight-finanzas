import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { syncService } from './lib/sync';
import { initErrorReporter } from './lib/error-reporter';
import { IconSprite } from './components/ui/icons.generated';
import './index.css';

// Inicializar listeners de ciclo de vida del servicio de sincronización
syncService.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sprite de iconos: cada <Icon> hace <use> contra estos <symbol>. Va
        fuera de <App> para que exista aunque la app caiga al ErrorBoundary. */}
    <IconSprite />
    <App />
  </StrictMode>
);

// ================================================================
// Monitoreo de errores en producción — reportador propio (lib/error-reporter)
// Antes esto era Sentry, cargado diferido porque su chunk pesaba 156 KB
// gzip. El reportador son dos listeners sobre window y un insert en
// Supabase, así que se instala en el arranque sin esperar al idle.
// Solo actúa en PROD: la función se protege sola con import.meta.env.PROD.
// ================================================================
initErrorReporter();

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

      // Aquí NO se fuerza la activación. Quien decide cuándo entra la versión
      // nueva es el usuario, desde el banner que muestra usePWA: activar por
      // nuestra cuenta dispara `controllerchange` y recarga la página, lo que
      // en mitad de una transacción le borra el formulario.
      //
      // (Antes había dos postMessage de SKIP_WAITING aquí. No hacían nada: con
      // `skipWaiting: true` en workbox el sw.js generado ni siquiera incluía
      // un listener de `message`.)

      // Verificar updates periódicamente (cada 5 min) como fallback
      setInterval(checkForUpdate, 5 * 60 * 1000);

      // Verificar al inicio (por si el SW registrado tiene update pendiente)
      checkForUpdate();
    } catch (err) {
      console.error('SW registration failed:', err);
    }
  });
}
