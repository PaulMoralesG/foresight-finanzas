-- ================================================================
-- CONFIGURACIÓN COMPLETA DE SUPABASE PARA FORESIGHT
-- ================================================================
-- Ejecuta este script completo en el SQL Editor de Supabase
-- (Dashboard → SQL Editor → New Query → Pega y ejecuta)
-- ================================================================

-- 1. ACTUALIZAR TABLA DE PERFILES (SIN BORRAR DATOS)
-- ================================================================
-- Este script agregará las columnas faltantes sin perder tus datos existentes

-- Agregar columnas nuevas si no existen
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Agregar columna budgets (JSONB) para presupuestos por mes
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS budgets JSONB DEFAULT '{}'::jsonb;

-- Migrar datos de budget antiguo a budgets (si existe)
-- Esto convertirá el valor numérico en un objeto JSON con el mes actual
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='profiles' AND column_name='budget') THEN
        UPDATE profiles 
        SET budgets = jsonb_build_object(
            to_char(CURRENT_DATE, 'YYYY-MM'), 
            COALESCE(budget, 0)
        )
        WHERE budgets = '{}'::jsonb AND budget IS NOT NULL;
    END IF;
END $$;

-- Actualizar valores de created_at para registros existentes que no lo tengan
UPDATE profiles 
SET created_at = NOW() 
WHERE created_at IS NULL;

UPDATE profiles 
SET updated_at = NOW() 
WHERE updated_at IS NULL;

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)
-- ================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. ELIMINAR POLÍTICAS ANTIGUAS (si existen)
-- ================================================================
DROP POLICY IF EXISTS "Permitir registro público" ON profiles;
DROP POLICY IF EXISTS "Usuarios leen su propio perfil" ON profiles;
DROP POLICY IF EXISTS "Usuarios actualizan su propio perfil" ON profiles;
DROP POLICY IF EXISTS "Usuarios borran su propio perfil" ON profiles;

-- 4. CREAR POLÍTICAS DE SEGURIDAD
-- ================================================================

-- Permitir a CUALQUIERA crear un perfil (necesario para registro)
CREATE POLICY "Permitir registro público"
ON profiles FOR INSERT
TO public
WITH CHECK (true);

-- Permitir a usuarios autenticados leer SOLO su propio perfil
CREATE POLICY "Usuarios leen su propio perfil"
ON profiles FOR SELECT
TO authenticated
USING (email = auth.jwt()->>'email');

-- Permitir a usuarios autenticados actualizar SOLO su propio perfil
CREATE POLICY "Usuarios actualizan su propio perfil"
ON profiles FOR UPDATE
TO authenticated
USING (email = auth.jwt()->>'email')
WITH CHECK (email = auth.jwt()->>'email');

-- Permitir a usuarios autenticados borrar SOLO su propio perfil
CREATE POLICY "Usuarios borran su propio perfil"
ON profiles FOR DELETE
TO authenticated
USING (email = auth.jwt()->>'email');

-- 5. ÍNDICES PARA MEJORAR RENDIMIENTO (opcional pero recomendado)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at DESC);

-- ================================================================
-- ✅ CONFIGURACIÓN COMPLETA
-- ================================================================
-- Ahora tu aplicación debería permitir:
-- ✅ Registro de nuevos usuarios
-- ✅ Login con credenciales
-- ✅ Guardar y cargar datos del usuario
-- ✅ Seguridad: usuarios solo ven/editan su propia información
-- ================================================================
