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
