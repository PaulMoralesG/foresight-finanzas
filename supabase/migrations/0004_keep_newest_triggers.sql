-- ============================================================
-- Foresight Finanzas — Migración 0004: rechazar escrituras rancias
-- APLICADA en producción el 19/08/2026 vía SQL Editor de Supabase.
--
-- Contexto (auditoría C-1): pushAll() en src/lib/sync.ts hace upsert
-- incondicional de todas las filas vivas. El merge determinista de
-- src/lib/merge.ts resuelve conflictos EN EL CLIENTE, con el snapshot
-- que ese cliente descargó — pero el servidor aceptaba cualquier
-- escritura sin comparar updated_at. Resultado: last-writer-wins por
-- reloj de red, no por marca de modificación.
--
-- Escenario que esto corrige:
--   t0  móvil y escritorio hacen pull; ambos ven el gasto X (updated_at = t0)
--   t1  en el móvil editás X: 500 → 1200. El móvil pushea. DB: X = 1200
--   t2  el escritorio, que nunca vio el cambio, pushea su set completo,
--       incluyendo X con amount = 500, updated_at = t0
--   →   sin este trigger, la DB queda en 500 y la corrección se pierde
--       en silencio, sin error para ninguno de los dos dispositivos.
--
-- Con el trigger, la escritura vieja se descarta y el upsert del cliente
-- se vuelve idempotente: "gana la marca más nueva" pasa a ser una
-- garantía del servidor en vez de una convención del cliente.
-- ============================================================

create or replace function public.keep_newest()
returns trigger language plpgsql as $$
begin
  if old.updated_at is not null
     and new.updated_at is not null
     and new.updated_at < old.updated_at then
    return old;   -- la escritura vieja no se aplica
  end if;
  return new;
end $$;

drop trigger if exists expenses_keep_newest on public.expenses;
create trigger expenses_keep_newest before update on public.expenses
  for each row execute function public.keep_newest();

drop trigger if exists reminders_keep_newest on public.reminders;
create trigger reminders_keep_newest before update on public.reminders
  for each row execute function public.keep_newest();

drop trigger if exists categories_keep_newest on public.categories;
create trigger categories_keep_newest before update on public.categories
  for each row execute function public.keep_newest();

drop trigger if exists savings_goals_keep_newest on public.savings_goals;
create trigger savings_goals_keep_newest before update on public.savings_goals
  for each row execute function public.keep_newest();

drop trigger if exists budgets_keep_newest on public.budgets;
create trigger budgets_keep_newest before update on public.budgets
  for each row execute function public.keep_newest();

-- ── Hardening preventivo ──
-- No afecta a las 6 tablas actuales (todas ya tienen RLS activo, verificado
-- el 19/08/2026). Protege a las FUTURAS: si alguien crea una tabla en public
-- y se olvida de habilitarle RLS, PostgREST no la expondrá a la anon key
-- —que es pública por diseño, va en el bundle del navegador—.
alter default privileges in schema public revoke all on tables from anon, authenticated;
