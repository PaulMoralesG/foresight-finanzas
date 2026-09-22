// ================================================================
// RECURRENCIAS — cuándo toca cada movimiento repetido
//
// Todo lo de aquí es puro y acotado: dada una regla y la fecha de hoy,
// devuelve las fechas que faltan por registrar. Quien lo llama (el store)
// solo materializa lo que esta función dice.
//
// Tres guardas viven aquí, y son las que evitan que una recurrencia se
// convierta en un bucle:
//   1. Nunca se generan fechas posteriores a hoy (ni a `hasta`).
//   2. Como mucho MAX_POR_CICLO fechas por llamada: una regla diaria
//      abandonada dos años no bloquea el arranque; lo que falte sale en la
//      siguiente pasada.
//   3. El intervalo se fuerza a 1 como mínimo: con 0 el avance no avanzaría
//      y el bucle no terminaría nunca.
// ================================================================

import type { Recurrence } from '@/types';

/** Tope de ocurrencias que se materializan de una vez, por regla. */
export const MAX_POR_CICLO = 60;

/** 'YYYY-MM-DD' de una fecha local (sin pasar por UTC, que corre el día). */
function aClave(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fecha local a partir de 'YYYY-MM-DD'. */
function deClave(clave: string): Date {
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Días que tiene un mes (día 0 del siguiente = último de este). */
function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes + 1, 0).getDate();
}

/**
 * La ocurrencia número `n` (0 = la primera) de una regla.
 *
 * En mensual el día se recorta a la longitud del mes: una regla del 31 cae el
 * 28/29 en febrero y el 30 en abril, en vez de desbordar al mes siguiente
 * —que es lo que hace `setMonth` si se le deja.
 */
export function ocurrencia(regla: Recurrence, n: number): string {
  const intervalo = Math.max(1, Math.floor(regla.intervalo || 1));
  const inicio = deClave(regla.desde);

  if (regla.frecuencia === 'monthly') {
    const mes = inicio.getMonth() + n * intervalo;
    const base = new Date(inicio.getFullYear(), mes, 1);
    const dia = Math.min(regla.diaMes ?? inicio.getDate(), diasDelMes(base.getFullYear(), base.getMonth()));
    return aClave(new Date(base.getFullYear(), base.getMonth(), dia));
  }

  const paso = regla.frecuencia === 'weekly' ? 7 * intervalo : intervalo;
  return aClave(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + n * paso));
}

/**
 * Fechas que faltan por registrar de una regla, hasta `hoy` inclusive.
 *
 * Vacío si la regla está pausada, si todavía no ha llegado su primera fecha o
 * si ya se generó todo lo que tocaba.
 */
export function fechasPendientes(regla: Recurrence, hoy: string): string[] {
  if (!regla.activa) return [];

  const tope = regla.hasta && regla.hasta < hoy ? regla.hasta : hoy;
  if (regla.desde > tope) return [];

  const fechas: string[] = [];
  for (let n = 0; fechas.length < MAX_POR_CICLO; n++) {
    const fecha = ocurrencia(regla, n);
    if (fecha > tope) break;
    // `ultimaGenerada` es la marca de agua: lo anterior o igual ya se registró
    // (o se registró y el usuario lo borró; ver el store).
    if (!regla.ultimaGenerada || fecha > regla.ultimaGenerada) fechas.push(fecha);
    // Sin freno duro, una regla corrupta (fechas que no avanzan) daría vueltas
    // para siempre. `ocurrencia` es estrictamente creciente, pero esto lo deja
    // garantizado aunque alguien cambie la aritmética de arriba.
    if (n > MAX_POR_CICLO * 400) break;
  }
  return fechas;
}

/** La siguiente fecha en que toca, o null si la regla ya terminó. */
export function proximaFecha(regla: Recurrence, hoy: string): string | null {
  if (!regla.activa) return null;
  const desde = regla.ultimaGenerada && regla.ultimaGenerada > hoy ? regla.ultimaGenerada : hoy;
  for (let n = 0; n <= MAX_POR_CICLO * 400; n++) {
    const fecha = ocurrencia(regla, n);
    if (regla.hasta && fecha > regla.hasta) return null;
    if (fecha > desde || (fecha === desde && (!regla.ultimaGenerada || fecha > regla.ultimaGenerada))) return fecha;
  }
  return null;
}

/** Texto corto de la regla, para listarla ("Cada mes el 5"). */
export function describirRegla(regla: Recurrence): string {
  const n = Math.max(1, Math.floor(regla.intervalo || 1));
  if (regla.frecuencia === 'daily') return n === 1 ? 'Cada día' : `Cada ${n} días`;
  if (regla.frecuencia === 'weekly') {
    const dia = deClave(regla.desde).toLocaleDateString('es-MX', { weekday: 'long' });
    return n === 1 ? `Cada semana, ${dia}` : `Cada ${n} semanas, ${dia}`;
  }
  const dia = regla.diaMes ?? deClave(regla.desde).getDate();
  return n === 1 ? `Cada mes, el ${dia}` : `Cada ${n} meses, el ${dia}`;
}
