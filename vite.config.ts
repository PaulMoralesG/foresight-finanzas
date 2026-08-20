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
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['finance', 'productivity'],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Precache solo el shell esencial. Los chunks pesados (PDF, charts, Sentry,
        // páginas lazy) se cachean on-demand vía runtimeCaching — precachearlos
        // hacía que el SW descargara ~2.2 MB en cada visita nueva y compitiera
        // con los assets críticos por ancho de banda (FCP/LCP peores en móvil).
        globIgnores: [
          '**/vendor-monitoring-*.js',
          '**/html2canvas*.js',
          '**/index.es-*.js',
          '**/purify*.js',
          '**/ReportModal-*.js',
          '**/StatsPage-*.js',
          '**/SavingsPage-*.js',
          '**/LoginPage-*.js',
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
