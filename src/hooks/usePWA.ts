// ================================================================
// usePWA — PWA install prompt + service worker update notification
// ================================================================

import { useState, useEffect } from 'react';

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [swUpdateReady, setSwUpdateReady] = useState(false);

  useEffect(() => {
    // Capturar evento beforeinstallprompt (dispara cuando el navegador soporta PWA)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Service Worker: detectar actualizaciones
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setSwUpdateReady(true);
            }
          });
        });
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setInstallPrompt(null);
  };

  const handleUpdate = async () => {
    // SKIP_WAITING tiene que ir al worker EN ESPERA, que es el que puede
    // saltarse la espera. Antes se le mandaba a `controller`, que es el worker
    // viejo y activo: ignoraba el mensaje y la recarga volvía a servir la
    // versión anterior, con lo que el botón "Actualizar ahora" no actualizaba.
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // Sin registro accesible solo queda recargar, que es lo que sigue.
      }
    }
    window.location.reload();
  };

  return { showInstallBanner, handleInstall, swUpdateReady, handleUpdate, dismissInstallBanner: () => setShowInstallBanner(false) };
}
