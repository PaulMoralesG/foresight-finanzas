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
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Foresight Finanzas',
        short_name: 'Foresight',
        description: 'Tus finanzas personales y de negocio, claras y en un solo lugar.',
        theme_color: '#2563eb',
        background_color: '#ffffff',
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
        // Precache solo el shell esencial. Los chunks pesados (PDF, charts, Sentry,
        // páginas lazy) se cachean on-demand vía runtimeCaching — precachearlos
        // hacía que el SW descargara ~2.2 MB en cada visita nueva y compitiera
        // con los assets críticos por ancho de banda (FCP/LCP peores en móvil).
        // Fuera del precache solo lo que pesa de verdad y se pide bajo demanda
        // explícita (exportar un reporte) o en segundo plano (telemetría):
        //
        //   vendor-monitoring 471 KB · pdf-generator 414 KB
        //   html2canvas       197 KB · index.es      155 KB · purify 28 KB
        //   StatsPage         405 KB  (arrastra Recharts entero)
        //
        // LoginPage (19 KB), SavingsPage (13 KB) y ReportModal (6 KB) SÍ se
        // precachean: 38 KB entre los tres. Estaban fuera y eso los dejaba
        // expuestos a que un despliegue borrara su chunk del servidor mientras
        // el shell viejo seguía pidiéndolo; por 38 KB no compensa.
        //
        // StatsPage se queda fuera por su tamaño, así que su chunk sí puede
        // caducar: de eso se encarga lazyConRecuperacion en src/App.tsx.
        globIgnores: [
          '**/vendor-monitoring-*.js',
          '**/html2canvas*.js',
          '**/index.es-*.js',
          '**/purify*.js',
          '**/StatsPage-*.js',
          '**/pdf-generator-*.js',
        ],
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
    // NOTA: NO poner jspdf/recharts en manualChunks — Rollup los hoistea como
    // imports estáticos al entry (rompe el lazy de ReportModal/StatsPage).
    // Con esos módulos lazy, jspdf/recharts quedan en sus chunks dinámicos.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-monitoring': ['@sentry/react'],
        },
      },
    },
  },
});
