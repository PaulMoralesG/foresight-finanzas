// ================================================================
// TEST SETUP — Configuración global para Vitest
// ================================================================

import '@testing-library/jest-dom/vitest';

// Mock de matchMedia (no existe en jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock de localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock de scrollTo
window.scrollTo = () => {};

// Polyfill de crypto.randomUUID (jsdom no siempre lo expone).
// Secuencia determinista para que los tests sean estables.
if (!globalThis.crypto?.randomUUID) {
  let seq = 0;
  const uuidMock = {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  };
  Object.defineProperty(globalThis, 'crypto', {
    value: uuidMock,
    configurable: true,
  });
}
