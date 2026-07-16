-- ================================================================
-- MIGRACIÓN: Añadir columna carry_over a la tabla profiles
-- ================================================================
-- PROBLEMA:
--   El commit "Resolver conflictos y agregar mejoras de seguimiento"
--   (38fd5d6) añadió persistencia de "carry_over" (saldo acumulado
--   entre meses) al frontend (js/auth.js -> saveData()), pero la
--   columna equivalente NUNCA se creó en la base de datos.
--
--   Por eso cada saveData() falla con:
--     PGRST204: Could not find the 'carry_over' column of 'profiles'
--     in the schema cache   (HTTP 400)
--
--   Y el usuario ve: "Error al sincronizar con la nube."
--
-- TIPOS:
--   budgets y expenses ya existen como jsonb. Usamos el mismo tipo
--   para carry_over, que guarda un objeto { "YYYY-MM": valor }.
--
-- CÓMO EJECUTAR:
--   1. Panel de Supabase -> SQL Editor -> New query
--   2. Pega este archivo completo y ejecuta (Run).
--   3. Si el schema cache no refresca solo, ejecuta una vez más:
--        NOTIFY pgrst, 'reload schema';
--      o recarga la página del dashboard.
-- ================================================================

-- 1) Añadir la columna (idempotente: no falla si ya existe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name  = 'profiles'
          AND column_name = 'carry_over'
    ) THEN
        ALTER TABLE profiles
            ADD COLUMN carry_over jsonb NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2) Backfill de seguridad: filas existentes con NULL -> '{}'
UPDATE profiles SET carry_over = '{}'::jsonb WHERE carry_over IS NULL;

-- 3) Refrescar el schema cache de PostgREST para que el cambio
--    tenga efecto inmediato en la REST API.
NOTIFY pgrst, 'reload schema';
