// ================================================================
// POLÍTICA DE CONTRASEÑAS — fuente única para registro y cambio
// ================================================================

/**
 * Longitud mínima. Estaba en 6 (el piso histórico de Supabase), que no es
 * defendible para una app que guarda el detalle financiero de un negocio.
 *
 * ⚠️ Este valor debe coincidir con el configurado en el panel de Supabase
 * (Authentication → Policies → Minimum password length). El cliente solo
 * da retroalimentación temprana; quien valida de verdad es el servidor.
 */
export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordStrength {
  score: number;
  label: string;
  /** Clases del segmento del medidor (elemento gráfico: WCAG pide 3:1) */
  barClass: string;
  /** Clases de la etiqueta (texto: WCAG pide 4.5:1) */
  textClass: string;
}

/**
 * Clases de Tailwind, no colores literales: el color va inline en un `style` no
 * puede reaccionar al tema, y las variantes pensadas para fondo claro (700)
 * fallaban todas sobre el fondo oscuro — entre 3.12:1 y 4.10:1, por debajo del
 * 4.5:1 que pide AA. Las variantes 400 rinden entre 7:1 y 13:1 en oscuro.
 */
const LEVELS: Omit<PasswordStrength, 'score'>[] = [
  { label: 'Muy débil', barClass: 'bg-red-500 dark:bg-red-400',         textClass: 'text-red-700 dark:text-red-400' },
  { label: 'Débil',     barClass: 'bg-orange-500 dark:bg-orange-400',   textClass: 'text-orange-700 dark:text-orange-400' },
  { label: 'Aceptable', barClass: 'bg-yellow-500 dark:bg-yellow-400',   textClass: 'text-yellow-700 dark:text-yellow-400' },
  { label: 'Buena',     barClass: 'bg-green-500 dark:bg-green-400',     textClass: 'text-green-700 dark:text-green-400' },
  { label: 'Excelente', barClass: 'bg-emerald-500 dark:bg-emerald-400', textClass: 'text-emerald-700 dark:text-emerald-400' },
];

/** Clases del segmento aún no alcanzado por la puntuación. */
export const STRENGTH_TRACK_CLASS = 'bg-slate-200 dark:bg-slate-700';

/** Evalúa la fortaleza de una contraseña (0-4). */
export function passwordStrength(pw: string): PasswordStrength {
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z\d]/.test(pw)) score++;
  return { score, ...LEVELS[score] };
}

/**
 * Valida una contraseña nueva. Devuelve el mensaje de error, o `null` si pasa.
 * Rechaza también las contraseñas más usadas: un mínimo de 8 caracteres no
 * sirve de nada si el resultado es "password" o "12345678".
 */
const COMMON_PASSWORDS = new Set([
  'password', 'contrasena', 'contraseña', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyui', 'iloveyou', 'admin123', 'password1', 'abc12345',
  'football', 'baseball', 'sunshine', 'princess', 'welcome1', '11111111',
]);

export function validateNewPassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return 'Esa contraseña es demasiado común. Elige otra.';
  }
  return null;
}
