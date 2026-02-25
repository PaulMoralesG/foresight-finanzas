# 🔄 Actualizar Base de Datos de Supabase

## ⚠️ IMPORTANTE: Si ves errores al guardar transacciones

Si estás viendo errores como **"Error al sincronizar con la nube"** al registrar transacciones, es porque la base de datos necesita actualizarse para soportar presupuestos por mes.

---

## 🛠️ Pasos para actualizar:

### 1. **Ir a Supabase SQL Editor**

1. Ve a tu proyecto en [Supabase](https://supabase.com/dashboard)
2. En el menú izquierdo, haz clic en **SQL Editor**
3. Haz clic en **New Query** (Nueva consulta)

### 2. **Ejecutar el script de actualización**

Copia y pega el siguiente código completo en el editor SQL:

```sql
-- ================================================================
-- ACTUALIZAR TABLA PROFILES PARA PRESUPUESTOS POR MES
-- ================================================================

-- Agregar columna budgets (JSONB) para presupuestos mensuales
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS budgets JSONB DEFAULT '{}'::jsonb;

-- Migrar datos de budget antiguo a budgets (si existe la columna antigua)
DO $$
BEGIN
    -- Verificar si existe la columna budget antigua
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='profiles' AND column_name='budget') THEN
        
        -- Migrar el valor antiguo al mes actual
        UPDATE profiles 
        SET budgets = jsonb_build_object(
            to_char(CURRENT_DATE, 'YYYY-MM'), 
            COALESCE(budget, 0)
        )
        WHERE budgets = '{}'::jsonb AND budget IS NOT NULL;
        
        -- Mensaje de confirmación
        RAISE NOTICE 'Migración completada: budget -> budgets';
    END IF;
END $$;

-- Verificar que expenses sea JSONB (debería serlo ya)
ALTER TABLE profiles 
ALTER COLUMN expenses TYPE JSONB USING expenses::jsonb;

-- ================================================================
-- ✅ ACTUALIZACIÓN COMPLETA
-- ================================================================
-- Ahora tu aplicación puede guardar presupuestos independientes por mes
```

### 3. **Ejecutar la consulta**

1. Haz clic en el botón **Run** (Ejecutar) o presiona `Ctrl + Enter`
2. Espera a que aparezca **"Success. No rows returned"** o similar
3. ✅ **¡Listo!** Tu base de datos está actualizada

### 4. **Verificar la actualización**

Para confirmar que funcionó, ejecuta esta consulta:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name IN ('budgets', 'expenses');
```

Deberías ver:
- `budgets` → `jsonb`
- `expenses` → `jsonb`

---

## 🎯 ¿Qué hace esta actualización?

### Antes:
```javascript
budget: 5000  // Un solo presupuesto para toda la app
```

### Después:
```javascript
budgets: {
  "2026-02": 5000,  // Presupuesto de febrero 2026
  "2026-03": 3000,  // Presupuesto de marzo 2026
  "2026-04": 8000   // Presupuesto de abril 2026
}
```

Cada mes tiene su propio presupuesto independiente.

---

## 💡 Migración de datos existentes

Si ya tenías un presupuesto definido (ej: $5000), este script automáticamente:
1. Lo convierte al formato nuevo
2. Lo asigna al mes actual
3. Los meses anteriores/futuros quedarán sin presupuesto (campo vacío)

**Esto es normal y esperado.** Cada mes comienza limpio.

---

## 🚨 Solución de problemas

### ❌ "column 'budgets' already exists"
**Solución:** La columna ya existe, la actualización ya se hizo. Ignora este error.

### ❌ "permission denied"
**Solución:** Asegúrate de estar usando el proyecto correcto de Supabase y que tengas permisos de administrador.

### ❌ Sigue sin funcionar después de actualizar
**Solución:** 
1. Cierra sesión en la app
2. Refresca la página (F5)
3. Vuelve a iniciar sesión
4. Prueba registrar una transacción

---

## 📞 ¿Necesitas ayuda?

Si después de seguir estos pasos sigues viendo errores:
1. Verifica en Supabase Dashboard → Table Editor → profiles
2. Confirma que existe la columna `budgets` (tipo JSONB)
3. Revisa la consola del navegador (F12) para ver el error exacto
