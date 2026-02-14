# 🔄 ACTUALIZACIÓN IMPORTANTE - Base de Datos

## ⚠️ ACCIÓN REQUERIDA

Se agregó la funcionalidad de **Nombre y Apellido** en el registro. Para que funcione correctamente, debes actualizar tu base de datos de Supabase.

## 📋 Pasos para Actualizar Supabase

### 1️⃣ Accede a tu Panel de Supabase
- Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
- Selecciona tu proyecto **Foresight**

### 2️⃣ Abre el SQL Editor
- En el menú lateral, haz clic en **SQL Editor**
- Haz clic en **+ New query**

### 3️⃣ Ejecuta el Comando SQL
Copia y pega estos comandos en el editor:

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_name TEXT;
```

### 4️⃣ Ejecuta el Script
- Haz clic en el botón **RUN** (o presiona Ctrl+Enter)
- Deberías ver el mensaje: **Success. No rows returned**

## ✅ ¡Listo!

Ahora tu aplicación:
- ✅ Muestra campos separados de "Nombre" y "Apellido" al registrarse
- ✅ Saluda al usuario con su nombre completo formateado correctamente
- ✅ Guarda nombre y apellido por separado en la base de datos

---

## 🔍 Verificar que Funcionó

1. Ve a **Table Editor** en Supabase
2. Selecciona la tabla `profiles`
3. Deberías ver dos nuevas columnas: `first_name` y `last_name`

## 🆕 Usuarios Nuevos vs Existentes

- **Nuevos usuarios**: Verán los campos de nombre y apellido al registrarse
- **Usuarios existentes**: Verán su email como nombre hasta que actualicen su perfil

---

📅 Actualización realizada: Febrero 13, 2026
