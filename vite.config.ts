import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { createRequire } from 'module';

const { version } = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  // Versión única: package.json manda. El pie de Perfil la lee de aquí en vez
  // de tenerla escrita a mano (decía v2.0 con package.json ya en 2.1.0).
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // Sin `includeAssets`: apuntaba a favicon.ico y apple-touch-icon.png en
      // la raíz de public/, y ninguno de los dos existe (el favicon es
      // favicon.png y el de Apple vive en public/icons/), así que no
      // precacheaba nada. Los iconos reales entran por globPatterns.
      manifest: {
        name: 'Foresight Finanzas',
        short_name: 'Foresight',
        description: 'Tus finanzas personales y de negocio, claras y en un solo lugar.',
        theme_color: '#0f6e5c',
        background_color: '#f9f9f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            // Icono APARTE para maskable, no el mismo que `any`.
            //
            // Android no muestra el maskable entero: recorta a la forma del
            // lanzador (círculo, squircle, gota) y AMPLÍA para llenarla, de
            // modo que solo se ve ~66% central. Con el icono normal —flecha
            // casi a sangre— el recorte dejaba una banda blanca de borde a
            // borde entre dos medias lunas azules: leía como un ojo.
            //
            // Este lleva la flecha al 75% y fondo a sangre sin esquinas
            // redondeadas (la forma la pone el sistema). Fuente editable en
            // icons/icon-maskable.svg.
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['finance', 'productivity'],
      },
      workbox: {
        // skipWaiting: false a propósito.
        //
        // Con `true`, workbox mete `self.skipWaiting()` en la instalación: el
        // worker nuevo se activa solo, reclama los clientes, se dispara
        // `controllerchange` y main.tsx recarga la página. En una app donde se
        // escriben importes, eso significa que publicar una versión le puede
        // borrar el formulario a quien esté a media transacción.
        //
        // Con `false`, workbox genera además un listener de `message` que
        // atiende SKIP_WAITING —el que la app ya intentaba usar y que hasta
        // ahora no existía, así que los tres postMessage del código eran
        // no-ops—. El worker nuevo espera y el usuario decide cuándo entrar,
        // desde el banner "Nueva versión disponible".
        skipWaiting: false,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Se precachea todo. Antes había una lista de exclusiones (globIgnores)
        // con los chunks pesados —Sentry 471 KB, jsPDF+html2canvas ~800 KB,
        // StatsPage 405 KB con Recharts— porque precachearlos hacía que el SW
        // descargara ~2.2 MB en cada visita nueva y compitiera con los assets
        // críticos por ancho de banda. Esos chunks ya no existen: Sentry es
        // lib/error-reporter, el PDF es window.print() y StatsPage pesa ~25 KB.
        // Las páginas lazy que quedan (StatsPage, LoginPage, SavingsPage) suman
        // ~55 KB: dejarlas fuera solo las expondría a que un despliegue borrara
        // su chunk mientras el shell viejo lo sigue pidiendo (ver
        // lib/lazy-recovery, que sigue como red de seguridad).
        runtimeCaching: [
          {
            // Chunks con hash (inmutables): CacheFirst, seguros para cachear siempre
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // (Aquí había reglas para fonts.googleapis.com y fonts.gstatic.com.
          //  Eran código muerto: Inter pasó a estar auto-alojada en
          //  /public/fonts —y precacheada por globPatterns vía woff2— y el CSP
          //  de vercel.json no permite esos dominios, así que nunca podían
          //  activarse.)
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'ES2020',
    outDir: 'dist',
    sourcemap: false,
    // Code-splitting: separa vendors estables del bundle principal.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
