# Fase 4 — Movimientos recurrentes y sistema visual

Estado: en curso.

## Objetivo

Cerrar los hallazgos de la auditoría de diseño y heurística del 22/09/2026 en
dos frentes:

1. **Sistema visual**: jerarquía tipográfica, contraste AA y una cabecera de
   tarjeta única en vez de 18 encabezados escritos a mano.
2. **Recurrentes**: plantillas de movimientos que se materializan solas
   (diario / semanal / mensual), sin duplicar ni resucitar nada.

Y, de camino, retirar el código muerto que aparezca y dejar el proyecto sin
avisos de tipos, lint ni tests.

## 1. Sistema visual

| Hallazgo | Arreglo |
| --- | --- |
| Título de página a 16px y título de tarjeta a 14px: sin salto de jerarquía (la referencia usa 24px / 15.7px) | `h1` de la cabecera a `text-xl md:text-2xl`; títulos de tarjeta a `text-[0.95rem]` |
| `text-slate-500` como secundario da 4.19:1 en claro (AA pide 4.5:1) y `text-slate-400`, 2.54:1 | Par estándar `text-slate-600 dark:text-slate-400` (6.3:1 / 6.7:1) |
| `text-2xs` (11px) usado para contenido, no solo para rótulos en mayúsculas | Subtítulos de tarjeta y textos de apoyo a `text-xs` |
| 18 encabezados de tarjeta repetidos con espaciados distintos | Componente `CardHeader` (`src/components/ui/CardHeader.tsx`) |

Regla que queda en CLAUDE.md: el texto secundario va en el par
`text-slate-600 dark:text-slate-400`; `text-2xs` solo para rótulos en
mayúsculas.

## 2. Movimientos recurrentes

### Modelo

```ts
export type Frecuencia = 'daily' | 'weekly' | 'monthly';

export interface Recurrence {
  id: string;
  // Plantilla del movimiento que se va a crear
  type: TransactionType;
  amount: number;
  concept: string;
  category: string;
  method: PaymentMethod;
  businessType: BusinessType;
  accountId?: string | null;
  toAccountId?: string | null;
  // Regla
  frecuencia: Frecuencia;
  intervalo: number;          // cada N días/semanas/meses
  diaMes: number | null;      // 1–31 en mensual; 31 = último día del mes
  desde: string;              // 'YYYY-MM-DD', primera ocurrencia posible
  hasta: string | null;       // fin opcional, inclusive
  activa: boolean;
  ultimaGenerada: string | null; // marca de agua: última fecha materializada
  updated_at: string;
}
```

El día de la semana no se guarda aparte: en `weekly` lo fija `desde`, que ya
cae en el día elegido. Una regla menos que mantener sincronizada.

### Materialización idempotente

`src/lib/recurrence.ts` es puro y tiene su test:

- `fechasPendientes(regla, hoy)` → lista acotada de fechas `YYYY-MM-DD`
  posteriores a `ultimaGenerada` (o a `desde`) y no posteriores a `hoy`.
  Tope duro `MAX_POR_CICLO = 60`; en mensual, el día se recorta a la longitud
  del mes (31 → 28/29/30 cuando toca).
- `idOcurrencia(recurrenceId, fecha)` → UUID v5 determinista con el mismo
  namespace que `legacy-import.ts`.

`financeStore.materializarRecurrencias()` aplica las cuatro guardas:

1. **Id determinista** → volver a ejecutar sobrescribe la misma fila; nunca
   duplica. Dos dispositivos generan el mismo id y el merge los colapsa.
2. **Tombstones** → si la ocurrencia fue borrada, no se recrea, pero la marca
   de agua avanza igual (si no, reaparecería en cada arranque).
3. **Tope y sin futuro** → como mucho 60 ocurrencias por regla y ejecución, y
   nunca fechas posteriores a hoy.
4. **Sin reentrada** → bandera a nivel de módulo, y la llamada vive donde ya
   vive `ensureCurrentMonth()` (montaje de `AppLayout` y vuelta a la pestaña),
   nunca en un `useEffect` que dependa del estado que escribe.

Los movimientos creados llevan `recurrenceId` para poder distinguirlos, y se
insertan junto con el avance de la marca de agua en un único `set()`.

### Sincronización

Tabla `recurrences` (migración `0014_recurrences.sql`) con el mismo patrón que
`budget_lines`: PK `(user_id, id)`, RLS por `user_id`, `updated_at`, borrado
lógico por tombstone. Se añade a `TableName`, al pull incremental, al push y al
merge.

### Interfaz

- Modal de movimiento: fila «Repetir» (No / Diario / Semanal / Mensual) y,
  si se elige una, «cada N» y «hasta» opcional.
- Movimientos: sub-pestaña «Recurrentes» (mismo patrón que las sub-pestañas de
  Presupuestos) con pausar/reanudar, editar, eliminar y «omitir esta vez».
- Resumen: tarjeta «Próximos cargos» a 30 días.

No se añade una novena vista: el catálogo de 8 (`src/config/views.ts`) se
queda como está.

## Verificación

`npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx vite build` (y
borrar `dist/`), más capturas de las secciones tocadas en 390 y 1366, claro y
oscuro.
