// ================================================================
// IDS — Generación de identificadores únicos (UUID v4) y timestamps
// ================================================================

/** Genera un UUID v4. Fallback determinista por si crypto.randomUUID no existe. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: UUID v4 a partir de Math.random (entornos sin Web Crypto)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Timestamp ISO actual (UTC, con milisegundos). */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * UUID v5 determinista (RFC 4122, SHA-1) — mismo seed → mismo id.
 * Usado por el import legacy para que sea idempotente ante reintentos
 * y doble ejecución desde dos dispositivos.
 */
export async function uuidv5(seed: string): Promise<string> {
  const data = new TextEncoder().encode(seed);
  let hash: ArrayBuffer;
  try {
    hash = await crypto.subtle.digest('SHA-1', data);
  } catch {
    return fallbackUuidv5(seed);
  }
  const bytes = new Uint8Array(hash);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Fallback determinista (djb2 doble) si Web Crypto no está disponible. */
function fallbackUuidv5(seed: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 + (c ^ 0x5f)) >>> 0;
  }
  const hex8 = (n: number) => n.toString(16).padStart(8, '0');
  const s = hex8(h1) + hex8(h2) + hex8((h1 ^ h2) >>> 0) + hex8((h1 + h2) >>> 0);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-5${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
