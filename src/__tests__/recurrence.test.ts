// ================================================================
// TESTS — src/lib/recurrence.ts y la materialización del store
//
// Lo que se comprueba aquí es sobre todo lo que NO debe pasar: duplicar
// movimientos, resucitar los borrados, generar hacia el futuro o quedarse
// dando vueltas.
// ================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fechasPendientes, ocurrencia, proximaFecha, describirRegla, MAX_POR_CICLO } from '@/lib/recurrence';
import { useFinanceStore } from '@/stores/financeStore';
import type { Recurrence } from '@/types';

const regla = (o: Partial<Recurrence> = {}): Recurrence => ({
  id: 'r1',
  type: 'expense',
  amount: 500,
  concept: 'Renta',
  category: 'vivienda',
  method: 'transfer',
  businessType: 'personal',
  accountId: null,
  toAccountId: null,
  frecuencia: 'monthly',
  intervalo: 1,
  diaMes: 5,
  desde: '2026-01-05',
  hasta: null,
  activa: true,
  ultimaGenerada: null,
  updated_at: '2026-01-01T00:00:00.000Z',
  ...o,
});

describe('ocurrencia', () => {
  it('mensual recorta el día a la longitud del mes', () => {
    const r = regla({ diaMes: 31, desde: '2026-01-31' });
    expect(ocurrencia(r, 0)).toBe('2026-01-31');
    expect(ocurrencia(r, 1)).toBe('2026-02-28'); // 2026 no es bisiesto
    expect(ocurrencia(r, 2)).toBe('2026-03-31');
    expect(ocurrencia(r, 3)).toBe('2026-04-30');
  });

  it('semanal avanza de siete en siete y respeta el intervalo', () => {
    const r = regla({ frecuencia: 'weekly', desde: '2026-03-02', diaMes: null });
    expect(ocurrencia(r, 1)).toBe('2026-03-09');
    expect(ocurrencia({ ...r, intervalo: 2 }, 1)).toBe('2026-03-16');
  });

  it('diaria cruza el cambio de mes', () => {
    const r = regla({ frecuencia: 'daily', desde: '2026-01-30', diaMes: null });
    expect(ocurrencia(r, 2)).toBe('2026-02-01');
  });
});

describe('fechasPendientes', () => {
  it('devuelve lo que falta hasta hoy, nunca el futuro', () => {
    expect(fechasPendientes(regla(), '2026-03-20')).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });

  it('arranca después de la marca de agua', () => {
    expect(fechasPendientes(regla({ ultimaGenerada: '2026-02-05' }), '2026-03-20')).toEqual(['2026-03-05']);
  });

  it('no devuelve nada si está pausada, si no ha llegado su fecha o si ya terminó', () => {
    expect(fechasPendientes(regla({ activa: false }), '2026-03-20')).toEqual([]);
    expect(fechasPendientes(regla({ desde: '2026-06-05' }), '2026-03-20')).toEqual([]);
    expect(fechasPendientes(regla({ hasta: '2026-02-10', ultimaGenerada: '2026-02-05' }), '2026-12-31')).toEqual([]);
  });

  it('acota la puesta al día: una regla diaria abandonada no genera años de golpe', () => {
    const r = regla({ frecuencia: 'daily', intervalo: 1, desde: '2020-01-01', diaMes: null });
    expect(fechasPendientes(r, '2026-09-22')).toHaveLength(MAX_POR_CICLO);
  });

  it('un intervalo inválido no cuelga el cálculo', () => {
    const r = regla({ frecuencia: 'daily', intervalo: 0, desde: '2026-09-01', diaMes: null });
    const fechas = fechasPendientes(r, '2026-09-10');
    expect(fechas[0]).toBe('2026-09-01');
    expect(fechas[1]).toBe('2026-09-02');
  });
});

describe('proximaFecha y describirRegla', () => {
  it('dice cuándo toca la siguiente', () => {
    expect(proximaFecha(regla({ ultimaGenerada: '2026-03-05' }), '2026-03-20')).toBe('2026-04-05');
    expect(proximaFecha(regla({ activa: false }), '2026-03-20')).toBeNull();
    expect(proximaFecha(regla({ hasta: '2026-03-31', ultimaGenerada: '2026-03-05' }), '2026-03-20')).toBeNull();
  });

  it('describe la regla en una línea', () => {
    expect(describirRegla(regla())).toBe('Cada mes, el 5');
    expect(describirRegla(regla({ frecuencia: 'daily', intervalo: 3 }))).toBe('Cada 3 días');
    expect(describirRegla(regla({ frecuencia: 'weekly', desde: '2026-03-02' }))).toContain('Cada semana');
  });
});

describe('materializarRecurrencias', () => {
  beforeEach(() => {
    useFinanceStore.getState().reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20)); // 20 de marzo de 2026
  });
  afterEach(() => vi.useRealTimers());

  const alta = () =>
    useFinanceStore.getState().addRecurrence({
      type: 'expense',
      amount: 500,
      concept: 'Renta',
      category: 'vivienda',
      method: 'transfer',
      businessType: 'personal',
      accountId: null,
      toAccountId: null,
      frecuencia: 'monthly',
      intervalo: 1,
      diaMes: 5,
      desde: '2026-01-05',
      hasta: null,
      activa: true,
    });

  it('crea lo que faltaba y avanza la marca de agua', async () => {
    alta();
    const creadas = await useFinanceStore.getState().materializarRecurrencias();
    expect(creadas).toBe(3);
    const s = useFinanceStore.getState();
    expect(s.expenses.map((e) => e.date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
    expect(s.expenses.every((e) => e.recurrenceId === s.recurrences[0].id)).toBe(true);
    expect(s.recurrences[0].ultimaGenerada).toBe('2026-03-05');
  });

  it('volver a ejecutarla no duplica nada', async () => {
    alta();
    await useFinanceStore.getState().materializarRecurrencias();
    const segunda = await useFinanceStore.getState().materializarRecurrencias();
    expect(segunda).toBe(0);
    expect(useFinanceStore.getState().expenses).toHaveLength(3);
  });

  it('el id de cada ocurrencia es determinista: dos dispositivos generan el mismo', async () => {
    alta();
    await useFinanceStore.getState().materializarRecurrencias();
    const ids = useFinanceStore.getState().expenses.map((e) => e.id);

    // Mismo id de regla, estado limpio: el segundo "dispositivo" debe producir
    // exactamente los mismos ids, que es lo que hace que el merge los colapse.
    const regla0 = useFinanceStore.getState().recurrences[0];
    useFinanceStore.getState().reset();
    useFinanceStore.setState({ recurrences: [{ ...regla0, ultimaGenerada: null }] });
    await useFinanceStore.getState().materializarRecurrencias();
    expect(useFinanceStore.getState().expenses.map((e) => e.id)).toEqual(ids);
  });

  it('no resucita una ocurrencia que el usuario borró', async () => {
    alta();
    await useFinanceStore.getState().materializarRecurrencias();
    const borrado = useFinanceStore.getState().expenses[1];
    useFinanceStore.getState().deleteTransaction(borrado.id);
    expect(useFinanceStore.getState().expenses).toHaveLength(2);

    // Retrocedemos la marca de agua como si el movimiento borrado no se
    // hubiera registrado nunca: aun así no debe volver.
    useFinanceStore.setState((st) => ({
      recurrences: st.recurrences.map((r) => ({ ...r, ultimaGenerada: '2026-01-05' })),
    }));
    await useFinanceStore.getState().materializarRecurrencias();
    expect(useFinanceStore.getState().expenses.find((e) => e.id === borrado.id)).toBeUndefined();
    expect(useFinanceStore.getState().expenses).toHaveLength(2);
  });

  it('una regla pausada no genera nada', async () => {
    const id = alta();
    useFinanceStore.getState().updateRecurrence(id, { activa: false });
    expect(await useFinanceStore.getState().materializarRecurrencias()).toBe(0);
    expect(useFinanceStore.getState().expenses).toHaveLength(0);
  });

  it('borrar la regla deja tombstone y no toca los movimientos ya creados', async () => {
    const id = alta();
    await useFinanceStore.getState().materializarRecurrencias();
    useFinanceStore.getState().deleteRecurrence(id);
    const s = useFinanceStore.getState();
    expect(s.recurrences).toHaveLength(0);
    expect(s.tombstones[id]).toBeTruthy();
    expect(s.expenses).toHaveLength(3);
  });
});
