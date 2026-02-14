# 🔄 ACTUALIZACIÓN IMPORTANTE - Base de Datos

## ⚠️ ACCIÓN REQUERIDA

Se agregó la funcionalidad de **Nombre Completo** en el registro. Para que funcione correctamente, debes actualizar tu base de datos de Supabase.

## 📋 Pasos para Actualizar Supabase

### 1️⃣ Accede a tu Panel de Supabase
- Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
- Selecciona tu proyecto **Foresight**

### 2️⃣ Abre el SQL Editor
- En el menú lateral, haz clic en **SQL Editor**
- Haz clic en **+ New query**

### 3️⃣ Ejecuta el Comando SQL
Copia y pega este comando en el editor:

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS name TEXT;
```

### 4️⃣ Ejecuta el Script
- Haz clic en el botón **RUN** (o presiona Ctrl+Enter)
- Deberías ver el mensaje: **Success. No rows returned**

## ✅ ¡Listo!

Ahora tu aplicación:
- ✅ Muestra el campo "Nombre completo" al registrarse
- ✅ Saluda al usuario por su nombre en el dashboard
- ✅ Guarda el nombre en la base de datos

---

## 🔍 Verificar que Funcionó

1. Ve a **Table Editor** en Supabase
2. Selecciona la tabla `profiles`
3. Deberías ver una nueva columna llamada `name`

## 🆕 Usuarios Nuevos vs Existentes

- **Nuevos usuarios**: Verán el campo de nombre al registrarse
- **Usuarios existentes**: Verán su email como nombre hasta que actualicen su perfil

---

📅 Actualización realizada: Febrero 13, 2026
