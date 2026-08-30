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

    // Service Worker: avisar cuando hay una versión nueva ESPERANDO.
    //
    // La señal correcta es `registration.waiting`, no `installing`: un worker
    // recién instalado puede seguir instalándose. Y hay que mirarlo también al
    // arrancar, porque si la versión nueva llegó en una visita anterior ya
    // está en espera y `updatefound` no vuelve a dispararse: el banner no
    // aparecía nunca para ese caso.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.waiting) setSwUpdateReady(true);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            // `controller` presente = ya había un SW activo, así que esto es
            // una actualización y no la primera instalación.
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

  /**
   * Entrar en la versión nueva, a petición del usuario.
   *
   * SKIP_WAITING va al worker EN ESPERA, que es el único que puede saltarse la
   * espera: antes se le mandaba a `controller` —el worker viejo y activo—, que
   * además ni siquiera escuchaba mensajes, así que el botón no actualizaba.
   *
   * Tras activarse, el worker reclama los clientes y main.tsx recarga al
   * recibir `controllerchange`. No se recarga aquí para no hacerlo dos veces;
   * el temporizador es la red por si el evento no llega.
   */
  const handleUpdate = async () => {
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => window.location.reload(), 2000);
        return;
      }
    } catch {
      // Sin registro accesible solo queda recargar.
    }
    window.location.reload();
  };

  return { showInstallBanner, handleInstall, swUpdateReady, handleUpdate, dismissInstallBanner: () => setShowInstallBanner(false) };
}
