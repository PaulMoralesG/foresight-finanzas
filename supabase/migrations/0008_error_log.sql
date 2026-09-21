-- ============================================================
-- Foresight Finanzas — Migración 0008
--   Tabla `error_log`: registro de errores de producción.
--   Sustituye a Sentry (src/lib/error-reporter.ts hace el insert).
--
-- No toca ninguna tabla existente. Aplicar ANTES de desplegar el cliente
-- que la usa: si la tabla no existe el insert falla en silencio (el
-- reportador se traga el error a propósito), pero no queda registro.
--
-- Modelo de acceso:
--   - INSERT: solo `authenticated`, y solo filas con su propio user_id.
--   - SELECT/UPDATE/DELETE por la API: nadie. No hay política ni grant.
--     Se consulta desde el SQL Editor del dashboard (rol postgres, que
--     no pasa por RLS). Si algún día hace falta leer desde la app, se
--     añade una política acotada al uid del administrador; hoy no hay
--     motivo para poner ese id en el repositorio.
--   - La 0004 revocó los privilegios por defecto a anon/authenticated en
--     tablas nuevas, así que el GRANT de abajo es imprescindible: sin él
--     PostgREST responde 42501 aunque la política exista.
-- ============================================================

create table if not exists public.error_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Los CHECK de longitud acotan lo que un cliente puede volcar aquí. El
  -- reportador recorta a estos mismos límites antes de enviar.
  message     text not null check (length(message) <= 1000),
  stack       text check (length(stack) <= 8000),
  -- Motivo: 'render' (ErrorBoundary), 'window.error', 'unhandledrejection',
  -- o los tags de sync ('reintentos-agotados', 'esquema-no-migrado', 'attach-fallo').
  tag         text check (length(tag) <= 64),
  url         text check (length(url) <= 2048),
  user_agent  text check (length(user_agent) <= 512),
  app_version text check (length(app_version) <= 32),
  -- Extras opcionales (hoy: { componentStack } cuando viene del ErrorBoundary).
  context     jsonb
);

comment on table public.error_log is
  'Errores de producción reportados por el cliente (src/lib/error-reporter.ts). Solo insert desde la API; lectura desde el dashboard.';

-- Para consultar "qué pasó esta semana" y para purgar por antigüedad.
create index if not exists idx_error_log_created_at on public.error_log (created_at desc);
-- Para ver todo lo que le pasó a un usuario concreto.
create index if not exists idx_error_log_user_id on public.error_log (user_id);

alter table public.error_log enable row level security;

drop policy if exists error_log_owner_insert on public.error_log;
create policy error_log_owner_insert on public.error_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant insert on public.error_log to authenticated;

-- Verificación (debe devolver una fila con rowsecurity = true y una sola
-- política, de tipo INSERT):
--   select relrowsecurity from pg_class where oid = 'public.error_log'::regclass;
--   select policyname, cmd from pg_policies where tablename = 'error_log';
