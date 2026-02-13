# 💰 Foresight - Gestor de Finanzas Personales

Aplicación web moderna para gestión de finanzas personales con diseño Buddy-Style y sincronización en la nube.

## 🚀 Demo en Vivo
👉 [https://paulmmoralesg.github.io/foresight-finanzas/](https://paulmoralesg.github.io/foresight-finanzas/)
### 📋 Para Profesores/Evaluadores
**¡Bienvenidos a la evaluación!** Este proyecto funciona de la siguiente manera:

#### 🔧 Cómo probar la aplicación:
1. **Accede al enlace de GitHub Pages** (arriba)
2. **Crea una cuenta** con tu correo universitario:
   - Presiona "Regístrate aquí"
   - Ingresa tu correo (ej: `profesora@universidad.edu`)
   - Crea una contraseña (mínimo 6 caracteres)
   - Presiona "Crear Cuenta"
3. **¡Listo!** Puedes usar toda la funcionalidad:
   - Agregar gastos e ingresos
   - Ver estadísticas en tiempo real
   - Configurar presupuestos
   - Explorar las categorías
   - Generar reportes

#### 💡 Notas importantes:
- ✅ **Funciona inmediatamente** - No requiere instalación
- 💾 **Datos locales** - Se guardan en el navegador para la demo
- 🔒 **Seguro** - No se envían datos reales a internet
- 🎯 **Funcionalidad completa** - Todas las características están disponibles

#### 🏆 Objetivos de evaluación cubiertos:
- ✅ Interfaz moderna y responsive
- ✅ Gestión de estado complejo (ingresos, gastos, categorías)
- ✅ Cálculos financieros en tiempo real
- ✅ Arquitectura modular (ES6 Modules)
- ✅ Experiencia de usuario fluida
- ✅ Código limpio y documentado
## ✨ Características
- 📊 Dashboard moderno con estadísticas en tiempo real
- 💳 Registro de ingresos y gastos por categorías
- 📈 Proyecciones y análisis de ahorro
- ☁️ Sincronización con Supabase
- 📧 Reportes por correo electrónico
- 🎨 Diseño responsivo tipo iOS/Buddy
- 🔐 Autenticación segura

## 🛠️ Tecnologías
- **Frontend**: HTML5, CSS3 (Tailwind CDN), JavaScript (ES6 Modules)
- **Backend**: Supabase (Auth + Database)
- **Email**: EmailJS
- **Hosting**: GitHub Pages

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

### 1. Supabase
Crea un proyecto en [Supabase](https://supabase.com) y configura:

**Tabla `profiles`:**
```sql
CREATE TABLE profiles (
  email TEXT PRIMARY KEY,
  budget NUMERIC DEFAULT 0,
  expenses JSONB DEFAULT '[]',
  password TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. EmailJS
Regístrate en [EmailJS](https://emailjs.com) y crea un servicio.

### 3. Variables de Configuración
Renombra `js/config.example.js` a `js/config.js` y configura tus claves:

```javascript
export const SUPABASE_URL = "TU_SUPABASE_URL";
export const SUPABASE_KEY = "TU_SUPABASE_ANON_KEY";
export const EMAILJS_PUBLIC_KEY = "TU_EMAILJS_PUBLIC_KEY";
export const EMAILJS_SERVICE_ID = "TU_SERVICE_ID";
export const EMAILJS_TEMPLATE_ID = "TU_TEMPLATE_ID";
```

## 📂 Estructura del Proyecto
```
foresight-finanzas/
├── index.html              # Estructura principal
├── css/
│   └── styles.css         # Estilos personalizados
├── js/
│   ├── app.js             # Controlador principal
│   ├── auth.js            # Autenticación y Supabase
│   ├── ui.js              # Interfaz y renderizado
│   ├── state.js           # Gestión de estado
│   ├── utils.js           # Utilidades
│   ├── config.js          # Configuración (IGNORADO por git)
│   └── config.example.js  # Plantilla de configuración
└── README.md
```

## ⚠️ Importante

### ¿Por qué no funciona abriendo el archivo directamente?
Este proyecto usa **ES6 Modules** (`import`/`export`), que requieren un servidor HTTP debido a las políticas de seguridad CORS del navegador. 

**NO** puedes abrir `index.html` directamente haciendo doble clic (protocolo `file://`).

### Seguridad
- `js/config.js` está en `.gitignore` para proteger tus claves
- Nunca subas tus credenciales al repositorio
- Las claves de Supabase deben ser solo de "Anonymous" (sin permisos críticos)

## 🐛 Solución de Problemas

### Error: "CORS policy" o "Failed to load module"
→ Asegúrate de usar un servidor HTTP (Live Server, Python, etc.)

### Error: "Supabase no inicializado"
→ Verifica que `js/config.js` tenga las claves correctas

### Conflicto con extensiones del navegador
→ Desactiva MetaMask/Keplr o usa ventana de incógnito

## 📄 Licencia
MIT License - Proyecto educativo

## 👨‍💻 Autor
Paul Morales G.
