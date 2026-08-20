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
  /** Color del medidor (elemento gráfico: WCAG pide 3:1) */
  color: string;
  /** Color de la etiqueta (texto sobre fondo claro: WCAG pide 4.5:1) */
  textColor: string;
}

const LEVELS: Omit<PasswordStrength, 'score'>[] = [
  { label: 'Muy débil', color: '#ef4444', textColor: '#b91c1c' },
  { label: 'Débil',     color: '#f97316', textColor: '#c2410c' },
  { label: 'Aceptable', color: '#eab308', textColor: '#a16207' },
  { label: 'Buena',     color: '#22c55e', textColor: '#15803d' },
  { label: 'Excelente', color: '#10b981', textColor: '#047857' },
];

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
