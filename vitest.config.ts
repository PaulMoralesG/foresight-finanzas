/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';

const { version } = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  plugins: [react()],
  // Mismo `define` que vite.config.ts: sin esto, cualquier test que renderice
  // un componente que lea __APP_VERSION__ falla con "is not defined".
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test-setup.ts',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/**/*.{test,spec}.{ts,tsx}',
      ],
      // Umbrales conservadores, unos puntos por debajo de lo medido (global
      // ≈85 líneas / 77 ramas; src/lib ≈98 líneas / 87 ramas). Son una red
      // contra regresiones, no una meta: súbelos cuando la cobertura suba.
      thresholds: {
        lines: 82,
        statements: 81,
        functions: 80,
        branches: 73,
        'src/lib/**': {
          lines: 95,
          statements: 94,
          functions: 94,
          branches: 83,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
