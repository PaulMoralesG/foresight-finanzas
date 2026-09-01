-- ============================================================
-- Foresight Finanzas — Migración 0007
--   (a) RLS: evitar reevaluación por fila de auth.uid() (advisor de performance)
--   (b) keep_newest(): fijar search_path (advisor de seguridad)
--   (c) handle_new_user(): revocar EXECUTE público (advisor de seguridad)
--   (d) Versionar en el repo dos CHECK y un índice que ya existían en
--       producción, aplicados a mano y nunca documentados aquí
--
-- Ninguno de estos cambios borra ni modifica filas existentes: son
-- metadata (políticas, funciones, permisos, constraints/índice ya
-- vigentes, revalidados contra los datos actuales sin tocarlos).
--
-- Ya aplicada en producción (2026-09-01) vía auditoría del backend.
-- Advisors verificados antes/después: de 4 WARN de seguridad a 1 (queda
-- solo "Leaked Password Protection", que es un toggle del dashboard de
-- Auth, no de SQL) y de 6 a 1 en performance (queda solo el índice sin
-- uso de (d), dejado a propósito — ver nota abajo).
-- ============================================================

-- ── (a) RLS: (select auth.uid()) en vez de auth.uid() ──
-- auth.uid() se reevalúa por cada fila cuando aparece directo en la
-- política; envuelto en subquery, Postgres lo evalúa una sola vez por
-- consulta. Mismo efecto de seguridad, mejor plan de ejecución.

drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all on public.profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists expenses_owner_all on public.expenses;
create policy expenses_owner_all on public.expenses
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists categories_owner_all on public.categories;
create policy categories_owner_all on public.categories
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists savings_goals_owner_all on public.savings_goals;
create policy savings_goals_owner_all on public.savings_goals
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists budgets_owner_all on public.budgets;
create policy budgets_owner_all on public.budgets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- ── (b) keep_newest(): search_path fijo ──
create or replace function public.keep_newest()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if old.updated_at is not null
     and new.updated_at is not null
     and new.updated_at < old.updated_at then
    return old;
  end if;
  return new;
end $$;


-- ── (c) handle_new_user(): solo el trigger puede ejecutarla ──
-- SECURITY DEFINER + sin REVOKE dejaba la función invocable por cualquiera
-- vía /rest/v1/rpc/handle_new_user (anon incluido). El trigger de
-- auth.users la sigue pudiendo ejecutar igual: el disparo de un trigger no
-- pasa por el chequeo de EXECUTE de la API de PostgREST.
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- ── (d) Versionar lo que ya estaba aplicado a mano en producción ──
-- Ya existían en la base (confirmado vía pg_constraint antes de esta
-- migración); esto solo los deja documentados y reproducibles en un
-- entorno nuevo. drop+add es metadata, revalida contra las filas vivas
-- sin modificarlas — y ya las cumplen, así que no hay impacto.
alter table public.expenses drop constraint if exists expenses_amount_positive;
alter table public.expenses add constraint expenses_amount_positive
  check (amount is null or amount > 0);

alter table public.savings_goals drop constraint if exists savings_goals_target_positive;
alter table public.savings_goals add constraint savings_goals_target_positive
  check (target is null or target > 0);

-- Índice sin uso según el advisor de performance (nunca se filtra por
-- created_at desde el cliente). Se deja documentado en vez de borrarlo:
-- es una decisión aparte que no correspondía tomar sola dentro de esta
-- migración de hardening.
create index if not exists idx_profiles_created_at on public.profiles (created_at);
