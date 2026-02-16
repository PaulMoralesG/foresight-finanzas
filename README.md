# 💰 Foresight Finanzas

**Tus finanzas personales y de negocio, claras y en un solo lugar**

Aplicación web moderna diseñada para emprendedores y personas que necesitan separar y controlar sus finanzas personales y de negocio. Con lenguaje simple, sin necesidad de conocimientos contables.

## 🎯 ¿Para quién es Foresight?
- 👤 **Emprendedores** que mezclan finanzas personales con las del negocio
- 💼 **Pequeños negocios** que necesitan claridad en sus números
- 📊 **Personas** que quieren ver su crecimiento mes a mes
- 🚀 **Cualquiera** que busque control financiero sin complicaciones

## 🚀 Demo en Vivo
👉 [https://paulmoralesg.github.io/foresight-finanzas/](https://paulmoralesg.github.io/foresight-finanzas/)

### ✨ ¿Qué puedes hacer en Foresight?
- ✅ Registrar ingresos y gastos clasificados por categoría
- ✅ Separar movimientos personales de los de tu negocio
- ✅ Ver al instante si estás ganando o perdiendo dinero
- ✅ Comparar tu crecimiento mes a mes con gráficas claras
- ✅ Generar reportes PDF de tus finanzas
- ✅ Tutorial interactivo que te guía paso a paso
- ✅ Acceso desde cualquier dispositivo con sincronización en la nube

### 📋 Para Profesores/Evaluadores
**¡Bienvenidos a la evaluación!** Esta es la versión **v3.0 (Producción)** del proyecto.

#### 🔧 Cómo probar la aplicación:
1. **Accede al enlace de GitHub Pages** (arriba)
2. **Crea una cuenta Real**:
   - Presiona "Regístrate aquí"
   - Ingresa un correo real (para confirmación) o de prueba.
   - Crea una contraseña.
3. **¡Listo!** Tus datos se sincronizan en tiempo real con la nube (Supabase):
   - Si inicias sesión en otro dispositivo, tus datos te acompañan.
   - Si borras el caché del navegador, tus datos NO se pierden.
   - Gestión completa de perfil y presupuesto en la nube.

#### 💡 Notas importantes (Versión Producción):
- ✅ **Cloud-Native**: Arquitectura 100% basada en la nube.
- 💾 **Persistencia Real**: Base de datos PostgreSQL (Supabase) como fuente de verdad.
- 🔒 **Seguridad**: Autenticación robusta y Row Level Security (RLS).
- 🔄 **Sincronización**: Cambios reflejados al instante.

#### 🏆 Objetivos de evaluación cubiertos:
- ✅ Backend as a Service (BaaS) con Supabase
- ✅ Autenticación de usuarios real con metadata personalizada
- ✅ CRUD completo contra base de datos SQL
- ✅ Manejo de errores y estados de carga (Loading States)
- ✅ Código limpio y modular (ES6 Modules)
- ✅ Despliegue continuo (CD) en GitHub Pages
- ✅ UX/UI optimizada para móviles con tooltips y onboarding
- ✅ Funcionalidades especializadas para el público objetivo
- ✅ Separación de responsabilidades (8 módulos JavaScript)
## ✨ Características Principales

### 💼 Separación Personal vs Negocio
- Clasifica cada movimiento como personal o de negocio
- Filtros inteligentes para ver cada categoría por separado
- Identifica claramente qué gastos corresponden a cada ámbito

### 📊 Calculadora de Utilidades
- **"¿Estoy ganando o perdiendo?"** - Respuesta clara e inmediata
- Visualización del margen de ganancia en porcentaje
- Alertas visuales con emojis y colores (verde = ganando, rojo = perdiendo)

### 📈 Comparación Mes a Mes
- Ve tu crecimiento comparado con el mes anterior
- Porcentajes de crecimiento o decrecimiento
- Mensajes motivacionales en lenguaje simple
- Badges visuales de progreso

### 🎓 Tutorial Interactivo
- Guía paso a paso para nuevos usuarios
- 7 pasos que explican cada funcionalidad
- Tooltips descriptivos en todos los botones
- Diseñado para personas sin conocimientos contables

### 💾 Otras Características
- ☁️ Sincronización automática en la nube (Supabase)
- 📱 Diseño responsivo optimizado para móvil
- 📄 Generación de reportes PDF
- 🔐 Autenticación segura con verificación de email
- 🎨 Interfaz moderna y amigable

## 🛠️ Tecnologías
- **Frontend**: HTML5, CSS3 (Tailwind CDN), JavaScript (ES6 Modules)
- **Backend**: Supabase (PostgreSQL + Auth)
- **Reportes**: jsPDF para generación de PDFs
- **Hosting**: GitHub Pages
- **Arquitectura**: Modular con separación de responsabilidades

## 📦 Instalación Local

### Opción 1: Live Server (Recomendado)
1. Clona el repositorio:
```bash
git clone https://github.com/PaulMoralesG/foresight-finanzas.git
cd foresight-finanzas
```

2. Instala la extensión **Live Server** en VS Code

3. Clic derecho en `index.html` → **Open with Live Server**

### Opción 2: Python HTTP Server
```bash
python -m http.server 8000
# Abre http://localhost:8000
```

### Opción 3: Node.js HTTP Server
```bash
npx http-server -p 8000
# Abre http://localhost:8000
```

## ⚙️ Configuración

### 1. Supabase - Configuración Completa
Crea un proyecto en [Supabase](https://supabase.com) y ejecuta estos pasos:

#### 🚀 MÉTODO RÁPIDO (Recomendado)
1. Ve a tu Dashboard de Supabase → **SQL Editor**
2. Copia y pega TODO el contenido del archivo [`supabase-setup.sql`](supabase-setup.sql)
3. Presiona **RUN** ▶️
4. ✅ ¡Listo! Tu base de datos está configurada

#### 📝 Método Manual (paso a paso)

#### Paso 1: Crear la tabla `profiles`
Ve a **SQL Editor** y ejecuta:

```sql
-- Crear tabla de perfiles
CREATE TABLE profiles (
  email TEXT PRIMARY KEY,
  budget NUMERIC DEFAULT 0,
  expenses JSONB DEFAULT '[]',
  password TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Paso 2: Configurar Row Level Security (RLS)
**IMPORTANTE**: Sin estas políticas, no podrás crear usuarios ni guardar datos.

```sql
-- Habilitar RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política para permitir registro (INSERT público)
CREATE POLICY "Permitir registro público"
ON profiles FOR INSERT
TO public
WITH CHECK (true);

-- Política para que usuarios autenticados lean su propio perfil
CREATE POLICY "Usuarios leen su propio perfil"
ON profiles FOR SELECT
TO authenticated
USING (email = auth.jwt()->>'email');

-- Política para que usuarios autenticados actualicen su propio perfil
CREATE POLICY "Usuarios actualizan su propio perfil"
ON profiles FOR UPDATE
TO authenticated
USING (email = auth.jwt()->>'email')
WITH CHECK (email = auth.jwt()->>'email');

-- Política para borrar (opcional, por seguridad)
CREATE POLICY "Usuarios borran su propio perfil"
ON profiles FOR DELETE
TO authenticated
USING (email = auth.jwt()->>'email');
```

#### Paso 3: Verificar Email Settings
Ve a **Authentication → Settings → Email Auth** y asegúrate de:
- ✅ **Confirm email** esté activo O desactivo según tu preferencia
- ✅ **Site URL** apunte a tu URL de GitHub Pages: `https://TU_USERNAME.github.io/foresight-finanzas`

#### Paso 4: Obtener tus claves
Ve a **Settings → API** y copia:
- `Project URL` → Será tu `SUPABASE_URL`
- `anon/public` key → Será tu `SUPABASE_KEY`

### 2. EmailJS
Regístrate en [EmailJS](https://emailjs.com) y crea un servicio.

### 3. Actualizar Configuración (Opcional)
Si necesitas usar tus propias claves, edita [`js/config.prod.js`](js/config.prod.js):

```javascript
export const SUPABASE_URL = "TU_SUPABASE_URL";
export const SUPABASE_KEY = "TU_SUPABASE_ANON_KEY";  // ⚠️ Solo clave 'anon', NO 'service_role'
export const EMAILJS_PUBLIC_KEY = "TU_EMAILJS_PUBLIC_KEY";
export const EMAILJS_SERVICE_ID = "TU_SERVICE_ID";
export const EMAILJS_TEMPLATE_ID = "TU_TEMPLATE_ID";
```

**🔐 Nota de Seguridad**: La clave `SUPABASE_KEY` debe ser la clave **anon/public**, NO la clave `service_role`. Es seguro exponerla porque la seguridad real está en las políticas RLS de Supabase.



## ⚠️ Importante

### ¿Por qué no funciona abriendo el archivo directamente?
Este proyecto usa **ES6 Modules** (`import`/`export`), que requieren un servidor HTTP debido a las políticas de seguridad CORS del navegador. 

**NO** puedes abrir `index.html` directamente haciendo doble clic (protocolo `file://`).

### Seguridad
- 🔐 **Claves públicas expuestas**: La clave `SUPABASE_KEY` en `config.prod.js` es la clave **anon/public**. Es seguro exponerla.
- 🔒 **Seguridad real**: Row Level Security (RLS) en Supabase protege los datos. Cada usuario solo ve su propia información.
- 🔑 **Contraseñas**: Nunca están en el código. Están hasheadas en Supabase Auth.
- ⚠️ **NUNCA expongas**: La clave `service_role` de Supabase (tiene acceso de administrador total).

## 🐛 Solución de Problemas

### ❌ No puedo crear cuenta / Error al registrarme
**Causa**: Falta configurar las políticas de RLS en Supabase.
**Solución**:
1. Ve a tu proyecto de Supabase
2. Abre **SQL Editor**
3. Ejecuta el archivo completo `supabase-setup.sql` que está en este repositorio
4. Verifica que dice "Success" ✅
5. Intenta registrarte de nuevo

### ❌ Error: "CORS policy" o "Failed to load module"
**Causa**: Intentas abrir el archivo directamente (`file://`)
**Solución**: Usa un servidor HTTP (Live Server, Python, etc.)

### ❌ Error: "Supabase no inicializado" o console muestra "null"
**Causa**: Las claves no están configuradas o son incorrectas.
**Solución**:
1. Verifica que `js/config.prod.js` (para GitHub Pages) tenga tus claves reales
2. Asegúrate de copiar la **anon/public key**, NO la service_role
3. Refresca la página con cache limpio (Ctrl + Shift + R)

### ❌ Puedo registrarme pero no puedo login
**Causa**: Email no confirmado (si tienes confirmación activa en Supabase)
**Solución**:
1. Revisa tu bandeja de entrada (y spam)
2. O desactiva la confirmación: **Authentication → Settings → Email → Confirm email = OFF**

### ⚠️ Conflicto con extensiones del navegador (MetaMask, etc.)
**Causa**: Extensiones inyectan scripts que interfieren con Supabase
**Solución**: Usa ventana de incógnito o desactiva extensiones

## �️ Roadmap - Próximas Funcionalidades

### 🎯 En Desarrollo
- 📊 Exportación a Excel para compartir con contadores
- 🔔 Recordatorios de cobros pendientes
- 🎯 Metas de ingresos mensuales con seguimiento
- 📧 Notificaciones por email de resumen mensual

### 💡 Ideas Futuras
- 📸 Captura de fotos de recibos/facturas
- 🤝 Modo multiusuario (para parejas o equipos)
- 🌐 Multi-idioma (inglés, portugués)
- 📱 Aplicación móvil nativa (React Native)
- 🧾 Categorías personalizadas por usuario
- 📊 Dashboards con más métricas avanzadas

## 🤝 Contribuciones
Este es un proyecto educativo desarrollado para la clase de **Liderazgo, Emprendimiento e Innovación** en UEES.

**Equipo de desarrollo:**
- **Paul Morales** - Desarrollo técnico y arquitectura
- Equipo multidisciplinario de 6 personas

Si encuentras bugs o tienes sugerencias, por favor abre un [Issue](https://github.com/PaulMoralesG/foresight-finanzas/issues).

## 📄 Licencia
MIT License - Proyecto educativo

## 👨‍💻 Autor
**Paul Morales G.**
- GitHub: [@PaulMoralesG](https://github.com/PaulMoralesG)
- Proyecto: [Foresight Finanzas](https://paulmoralesg.github.io/foresight-finanzas/)

---

💙 Desarrollado con pasión para emprendedores que buscan claridad financiera
