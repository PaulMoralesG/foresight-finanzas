# 📊 Foresight Finanzas - Guía Rápida

## ✅ Correcciones Aplicadas

### Errores Solucionados:
1. ✅ **Error de sintaxis en pdf-generator.js** - Código basura eliminado
2. ✅ **Funciones duplicadas en ui.js** - Código limpio y optimizado
3. ✅ **Funciones faltantes** - `openReportModal()` y `toggleReportModal()` agregadas
4. ✅ **Separación Personal/Negocio en PDF** - Implementada correctamente
5. ✅ **Service Worker actualizado** - Incluye todos los archivos necesarios

## 🚀 Cómo Usar la Aplicación

### Opción 1: Servidor Local (Recomendado para desarrollo)

1. **Iniciar el servidor:**
   - Haz doble clic en `start-server.ps1` O
   - Abre PowerShell en la carpeta del proyecto y ejecuta:
     ```powershell
     .\start-server.ps1
     ```

2. **Acceder a la aplicación:**
   - Abre tu navegador en: **http://localhost:8080**

3. **Detener el servidor:**
   - Presiona `Ctrl + C` en la ventana de PowerShell

### Opción 2: GitHub Pages (Producción)

1. **Sube los cambios a GitHub:**
   ```bash
   git add .
   git commit -m "Correcciones de sintaxis y PDF mejorado"
   git push origin main
   ```

2. **Accede a tu aplicación:**
   - `https://TU-USUARIO.github.io/proyecto-finanzas/`

## 📱 Funcionalidades Principales

### 1. Login/Registro
- **Iniciar sesión** con email y contraseña
- **Crear cuenta** proporcionando nombre, apellido, email y contraseña
- La confirmación de correo depende de la configuración de Supabase

### 2. Registrar Movimientos
- Click en el botón **+** para agregar transacciones
- Selecciona:
  - **Tipo:** Ingreso o Gasto
  - **Categoría:** Personal o Negocio
  - **Monto** y concepto
  - **Fecha** y método de pago

### 3. Ver Reportes
- **Saldo disponible** actualizado automáticamente
- **Utilidad del mes** (¿estás ganando o perdiendo?)
- **Crecimiento mes a mes** (compara con el mes anterior)

### 4. Exportar PDF Separado por Categoría
**Nueva funcionalidad mejorada:**

1. Click en el botón de reportes
2. Selecciona el tipo de reporte:
   - **PDF Personal** - Solo gastos e ingresos personales
   - **PDF Negocio** - Solo gastos e ingresos del negocio
   - **PDF Completo** - Todos los movimientos

El PDF incluye:
- Separación visual entre Personal y Negocio
- Columna de categoría en la tabla
- Resumen financiero detallado

## 🔧 Solución de Problemas

### Problema: No puedo iniciar sesión

**Verifica:**
1. ✅ Que estés usando **http://localhost:8080** (NO `file://`)
2. ✅ Tu conexión a internet (se conecta a Supabase)
3. ✅ Credenciales correctas
4. ✅ Confirmación de correo (revisa spam)

**Solución:**
- Presiona `Ctrl + Shift + R` para recargar sin caché
- Revisa la consola del navegador (F12) para ver errores específicos

### Problema: Error al cargar módulos

**Solución:**
- Usa siempre el servidor local (`start-server.ps1`)
- NO abras `index.html` directamente haciendo doble click

### Problema: No se genera el PDF

**Verifica:**
- Conexión a internet (carga librerías externas)
- Que tengas al menos 1 movimiento registrado

**Fallback automático:**
- Si falla el PDF, se descarga un archivo `.txt` con el reporte

## 📋 Arquitectura del Proyecto

```
proyecto-finanzas/
├── index.html              # Página principal
├── manifest.json           # PWA manifest
├── service-worker.js       # Cache offline
├── start-server.ps1        # Servidor local
├── css/
│   └── styles.css          # Estilos personalizados
└── js/
    ├── app.js              # Punto de entrada principal
    ├── auth.js             # Autenticación con Supabase
    ├── config-loader.js    # Carga dinámica de configuración
    ├── config.prod.js      # Configuración de producción
    ├── onboarding.js       # Tutorial interactivo
    ├── pdf-generator.js    # ✅ Generación de PDF (MEJORADO)
    ├── state.js            # Estado global de la app
    ├── ui.js               # ✅ Interfaz de usuario (CORREGIDO)
    └── utils.js            # Utilidades generales
```

## 🎯 Próximos Pasos

1. **Prueba el login:**
   - Inicia el servidor local
   - Crea una cuenta o inicia sesión

2. **Registra movimientos:**
   - Agrega ingresos y gastos
   - Separa entre Personal y Negocio

3. **Genera reportes PDF:**
   - Exporta PDFs separados por categoría
   - Verifica que la información sea correcta

4. **Sube a GitHub:**
   - Cuando todo funcione localmente
   - Haz commit y push a GitHub Pages

## 💡 Consejos de Uso

- **Separa siempre** gastos personales de negocio para análisis más claros
- **Registra diariamente** para no olvidar movimientos
- **Revisa mensualmente** tus reportes PDF
- **Compara mes a mes** para ver tu crecimiento

## 🆘 Soporte

Si encuentras algún error:
1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Console"
3. Copia el mensaje de error
4. Comparte el error con detalles específicos

---

**Fecha de última actualización:** Febrero 2026
**Versión:** 2.0 - Corregida y Optimizada
