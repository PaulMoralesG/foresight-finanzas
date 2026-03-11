# Configuración Recomendada de Supabase

Para garantizar la seguridad de Foresight Finanzas, debes asegurarte de aplicar la **seguridad a nivel de filas (RLS)** y **configurar las URLs de redirección** desde el panel de Supabase.

## 1. Seguridad a Nivel de Filas (Row Level Security - RLS)

Dado que usas consultas desde el cliente hacia la base de datos con tu clave pública (`anon` key), en Supabase debes habilitar las políticas de seguridad para que ningún usuario malintencionado pueda leer los datos de otros. 

Ve a **SQL Editor** en tu panel de Supabase y ejecuta este código:

```sql
-- 1. Habilitar la característica RLS en la tabla perfiles
-- Asegúrate de que tu tabla se llame 'profiles'
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Política para SELECT: el usuario solo lee su propio registro
CREATE POLICY "Un usuario puede ver su propio perfil" 
ON profiles FOR SELECT 
USING ( email = auth.jwt()->>'email' );

-- 3. Política para INSERT: solo puede insertar un registro con su email
CREATE POLICY "Un usuario puede insertar su propio perfil" 
ON profiles FOR INSERT 
WITH CHECK ( email = auth.jwt()->>'email' );

-- 4. Política para UPDATE: un usuario solo puede actualizar su información
CREATE POLICY "Un usuario puede actualizar su propio perfil" 
ON profiles FOR UPDATE 
USING ( email = auth.jwt()->>'email' );

-- (Opcional) Política para DELETE si quieres permitirles borrar su cuenta
CREATE POLICY "Un usuario puede borrar su propio perfil" 
ON profiles FOR DELETE 
USING ( email = auth.jwt()->>'email' );
```

*Nota: Dependiendo de cómo creaste el ID (si la llave foránea se une por `id` UUID de auth o por `email`), asegúrate de revisar la lógica de cruce de IDs en el query.*

## 2. Configurar las Redirecciones por Correo (Redirect URLs)

En el código estás usando `emailRedirectTo: window.location.origin` (que lee dinámicamente tu URL: ej. el de GitHub Pages). Para que Supabase permita redirigir de vuelta al usuario cuando confirma su correo, debes configurarlo:

1. Ve a **Authentication** > **URL Configuration**.
2. En la sección **Site URL**, coloca tu dominio principal (Ej. `https://paulmoralesg.github.io`).
3. En la sección **Redirect URLs**, añade específicamente:
   - `http://127.0.0.1:*` y `http://localhost:*` (Para que funcione cuando pruebes localmente).
   - `https://paulmoralesg.github.io/foresight-finanzas/*` (Para tu entorno real de producción).

## 3. Comprobar Expiración de Tu Tokens y Limitaciones
Asegúrate también en **Authentication -> Rate Limits** ajustar tu límite por si la app crece mucho y tienes muchos usuarios creando cuentas al mismo tiempo.