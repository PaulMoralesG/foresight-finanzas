-- ================================================================
-- MIGRACIÓN: profiles — de email-based a id-based (UUID)
-- ================================================================
-- Corre antes de desplegar el nuevo código.
-- Seguro para correr múltiples veces (idempotente).
-- ================================================================

-- Paso 1: Agregar columna id UUID (nullable temporalmente)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS id UUID;

-- Paso 2: Poblar id desde auth.users donde email coincide
-- Esto vincula los perfiles existentes con su UUID de autenticación.
UPDATE public.profiles p
SET id = u.id
FROM auth.users u
WHERE p.email = u.email
  AND p.id IS NULL;

-- Paso 3: Para perfiles huérfanos (sin match en auth.users),
-- generar un UUID nuevo (no deberían existir, pero por seguridad)
UPDATE public.profiles
SET id = gen_random_uuid()
WHERE id IS NULL;

-- Paso 4: Hacer id NOT NULL
ALTER TABLE public.profiles
ALTER COLUMN id SET NOT NULL;

-- Paso 5: Agregar restricción UNIQUE en id
ALTER TABLE public.profiles
ADD CONSTRAINT IF NOT EXISTS profiles_id_unique UNIQUE (id);

-- Paso 6: Crear índice en id
CREATE INDEX IF NOT EXISTS profiles_id_idx ON public.profiles (id);

-- Paso 7: Establecer id como PRIMARY KEY
-- (Primero dropeamos la PK vieja si existe — típicamente es email)
DO $$
BEGIN
  -- Intentar dropear PK vieja (puede llamarse de varias formas)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_pkey' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_pkey;
  END IF;

  -- Si había una PK basada en email, eliminarla
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_email_key' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_email_key;
  END IF;
END $$;

-- Crear nueva PK en id
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

-- Paso 8: Asegurar que email siga siendo único (no duplicados)
-- Mantenemos el constraint unique en email para prevenir registros duplicados
ALTER TABLE public.profiles
ADD CONSTRAINT IF NOT EXISTS profiles_email_unique UNIQUE (email);

-- Paso 9: Política RLS — actualizar para usar auth.uid() = id
-- Si ya tienes políticas RLS, ajústalas. Ejemplo:
--   USING (auth.uid() = id)
--   WITH CHECK (auth.uid() = id)
-- Recreamos las políticas básicas:

-- Habilitar RLS si no está habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Dropear políticas viejas (por nombre común)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for users" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;

-- Política: ver tu propio perfil
CREATE POLICY "view_own_profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Política: actualizar tu propio perfil
CREATE POLICY "update_own_profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Política: insertar tu propio perfil
CREATE POLICY "insert_own_profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- ================================================================
-- VERIFICACIÓN (ejecuta después de la migración):
-- ================================================================
-- SELECT id, email, first_name FROM public.profiles;
-- Deberías ver id poblado para todos los registros.
-- ================================================================
