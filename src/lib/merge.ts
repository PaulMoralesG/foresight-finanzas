// ================================================================
// MERGE — Función pura de merge determinista por fila (sin React/Supabase)
// Resuelve conflictos entre dos dispositivos: gana la marca más nueva.
// ================================================================

export interface MergeSet<T> {
  live: T[]; // items con { id: string; updated_at: string }
  tombstones: Record<string, string>; // id → deleted_at ISO
}

/**
 * Merge determinista por id entre el estado local y el remoto.
 *
 * Reglas (en orden):
 * 1. La "marca efectiva" de cada lado es el timestamp del item vivo
 *    (updated_at) o del tombstone (deleted_at).
 * 2. Un solo lado tiene el id → ese lado gana (creación o borrado nuevo).
 * 3. Ambos lados → gana la marca más nueva. Item vivo más nuevo sobre un
 *    tombstone → resurrección (la edición post-borrado es la intención
 *    más reciente). Tombstone más nuevo → borrado propagado.
 * 4. Empate exacto de marcas → serialización canónica (claves ordenadas),
 *    gana la mayor lexicográficamente; idéntico → gana remote.
 * 5. Invariante de salida: id ∈ tombstones ⇔ id ∉ live.
 */
export function mergeById<T extends { id: string; updated_at?: string }>(
  local: MergeSet<T>,
  remote: MergeSet<T>,
): MergeSet<T> {
  const localLive = new Map(local.live.map((i) => [i.id, i]));
  const remoteLive = new Map(remote.live.map((i) => [i.id, i]));

  const ids = new Set<string>([
    ...localLive.keys(),
    ...remoteLive.keys(),
    ...Object.keys(local.tombstones),
    ...Object.keys(remote.tombstones),
  ]);

  const live: T[] = [];
  const tombstones: Record<string, string> = {};

  for (const id of ids) {
    const localItem = localLive.get(id);
    const remoteItem = remoteLive.get(id);
    // '' = sin marca (item sin updated_at) → siempre pierde contra cualquier ISO
    const localMark = localItem ? (localItem.updated_at ?? '') : (local.tombstones[id] ?? null);
    const remoteMark = remoteItem ? (remoteItem.updated_at ?? '') : (remote.tombstones[id] ?? null);

    let winner: { kind: 'live'; item: T } | { kind: 'deleted'; at: string };

    // Un item vivo sin marca ('' porque updated_at es opcional en Category)
    // no es "sin datos": es una fila real. Antes caía en el `continue` de
    // abajo cuando no tenía contraparte remota y desaparecía del resultado.
    if (!localMark && !remoteMark) {
      if (localItem) live.push(localItem);
      else if (remoteItem) live.push(remoteItem);
      continue;
    }

    if (!localMark) {
      winner = remoteItem
        ? { kind: 'live', item: remoteItem }
        : { kind: 'deleted', at: remote.tombstones[id] };
    } else if (!remoteMark) {
      winner = localItem
        ? { kind: 'live', item: localItem }
        : { kind: 'deleted', at: local.tombstones[id] };
    } else if (localMark > remoteMark) {
      winner = localItem
        ? { kind: 'live', item: localItem }
        : { kind: 'deleted', at: local.tombstones[id] };
    } else if (remoteMark > localMark) {
      winner = remoteItem
        ? { kind: 'live', item: remoteItem }
        : { kind: 'deleted', at: remote.tombstones[id] };
    } else {
      // Empate: comparación canónica determinista; idéntico → remote.
      // Nota: un lado borrado serializa como '' → en empates sobrevive el vivo.
      const localStr = localItem ? canonicalJson(localItem) : '';
      const remoteStr = remoteItem ? canonicalJson(remoteItem) : '';
      winner = localStr > remoteStr
        ? { kind: 'live', item: localItem as T }
        : remoteItem
          ? { kind: 'live', item: remoteItem }
          : { kind: 'deleted', at: remote.tombstones[id] };
    }

    if (winner.kind === 'live') {
      live.push(winner.item);
    } else {
      tombstones[id] = winner.at;
    }
  }

  return { live, tombstones };
}

/**
 * Rellena en los items locales las claves que les faltan y que el servidor sí
 * tiene. Evita que una copia local escrita por un cliente viejo (sin las
 * columnas nuevas) pise con `null` los valores del servidor en el merge/push.
 *
 * - Solo actúa sobre los items cuyo id esté en `ids` y tenga fila remota.
 * - Solo copia claves ausentes en local (undefined/null) y presentes en remoto;
 *   nunca pisa un valor local.
 * - No toca `updated_at` ni muta las entradas: devuelve copias nuevas solo de
 *   los items modificados.
 */
export function hidratarAusentes<T extends { id: string }>(
  local: readonly T[],
  remotos: readonly T[],
  ids: Iterable<string>,
  claves: ReadonlyArray<keyof T>,
): T[] {
  const objetivo = new Set(ids);
  if (objetivo.size === 0) return [...local];
  const remotoPorId = new Map(remotos.map((r) => [r.id, r]));

  return local.map((item) => {
    if (!objetivo.has(item.id)) return item;
    const remoto = remotoPorId.get(item.id);
    if (!remoto) return item;

    let copia: T | null = null;
    for (const clave of claves) {
      const valorLocal = item[clave];
      const valorRemoto = remoto[clave];
      if (
        (valorLocal === undefined || valorLocal === null) &&
        valorRemoto !== undefined &&
        valorRemoto !== null
      ) {
        copia ??= { ...item };
        copia[clave] = valorRemoto;
      }
    }
    return copia ?? item;
  });
}

/**
 * Merge de presupuestos por mes (sin tombstones: no existe delete de presupuestos).
 * Gana el updated_at más nuevo; empate → mayor monto; empate total → local.
 */
export function mergeBudgets(
  local: Record<string, number>,
  localUpdatedAt: Record<string, string>,
  remote: Array<{ month: string; amount: number; updated_at: string }>,
): { budgets: Record<string, number>; updatedAt: Record<string, string> } {
  const budgets: Record<string, number> = {};
  const updatedAt: Record<string, string> = {};
  const remoteByMonth = new Map(remote.map((r) => [r.month, r]));

  const months = new Set<string>([...Object.keys(local), ...remoteByMonth.keys()]);

  for (const month of months) {
    const lAmount = local[month];
    const lAt = localUpdatedAt[month];
    const r = remoteByMonth.get(month);

    if (lAmount === undefined && !r) continue;
    if (lAmount === undefined) {
      budgets[month] = r!.amount;
      updatedAt[month] = r!.updated_at;
      continue;
    }
    if (!r) {
      budgets[month] = lAmount;
      updatedAt[month] = lAt ?? '';
      continue;
    }
    if (!lAt || r.updated_at > lAt) {
      budgets[month] = r.amount;
      updatedAt[month] = r.updated_at;
      continue;
    }
    if (lAt > r.updated_at) {
      budgets[month] = lAmount;
      updatedAt[month] = lAt;
      continue;
    }
    // Empate: mayor monto gana
    budgets[month] = Math.max(lAmount, r.amount);
    updatedAt[month] = lAt;
  }

  return { budgets, updatedAt };
}

/** Lo mínimo de una línea de presupuesto que necesita `deduplicarLineas`. */
export interface LineaDeduplicable {
  id: string;
  tag: string;
  kind: string;
  categoryId: string;
  plan: Record<string, number>;
  updated_at: string;
}

/**
 * Deduplicación semántica de líneas de presupuesto por (tag, kind,
 * categoryId): dos dispositivos que crean la misma línea a la vez dejan dos
 * filas con ids distintos. Queda una por clave.
 *
 * - Gana la de `updated_at` más nuevo; empate → el id menor (lexicográfico).
 *   El desempate por id hace que todos los dispositivos elijan la MISMA
 *   ganadora: sin él, cada uno podía conservar una distinta y tombstonear la
 *   del otro, y tras sincronizar no quedaba ninguna.
 * - Las perdedoras aportan los meses del plan que a la ganadora le faltan
 *   (de la más nueva a la más vieja) y quedan en tombstone con `ahora`.
 * - La ganadora se re-sella con `ahora` solo si su plan cambió de verdad.
 * - Sin duplicados devuelve las mismas referencias, en el orden de entrada.
 */
export function deduplicarLineas<T extends LineaDeduplicable>(
  lineas: readonly T[],
  ahora: string,
): { live: T[]; tombstones: Record<string, string> } {
  const porClave = new Map<string, T[]>();
  for (const linea of lineas) {
    const clave = `${linea.tag}|${linea.kind}|${linea.categoryId}`;
    const grupo = porClave.get(clave);
    if (grupo) grupo.push(linea);
    else porClave.set(clave, [linea]);
  }

  const live: T[] = [];
  const tombstones: Record<string, string> = {};
  for (const grupo of porClave.values()) {
    if (grupo.length === 1) {
      live.push(grupo[0]);
      continue;
    }
    const ordenado = [...grupo].sort((a, b) => {
      const ua = a.updated_at ?? '';
      const ub = b.updated_at ?? '';
      if (ua !== ub) return ua > ub ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const [ganadora, ...perdedoras] = ordenado;
    const plan = { ...(ganadora.plan ?? {}) };
    let cambiado = false;
    for (const perdedora of perdedoras) {
      for (const [mes, monto] of Object.entries(perdedora.plan ?? {})) {
        if (!(mes in plan)) {
          plan[mes] = monto;
          cambiado = true;
        }
      }
      tombstones[perdedora.id] = ahora;
    }
    live.push(cambiado ? { ...ganadora, plan, updated_at: ahora } : ganadora);
  }
  return { live, tombstones };
}

/** JSON.stringify con claves ordenadas recursivamente (comparación determinista). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
