# Foresight Finanzas 💰

Una aplicación web progresiva (PWA) para gestión de finanzas personales con un diseño amigable estilo "buddy".

## ⚠️ ADVERTENCIA DE SEGURIDAD CRÍTICA

**ESTE REPOSITORIO CONTIENE CREDENCIALES EXPUESTAS QUE DEBEN SER ROTADAS INMEDIATAMENTE**

Las siguientes credenciales están hardcodeadas en `index.html` y son visibles públicamente:

1. **Supabase API Key** (línea 292)
2. **Supabase URL** (línea 291)
3. **EmailJS Public Key** (línea 286)
4. **EmailJS Service ID** (línea 287)
5. **EmailJS Template ID** (línea 288)

### Acciones Requeridas URGENTEMENTE:

1. ✅ Rotar todas las credenciales de Supabase
2. ✅ Regenerar claves de EmailJS
3. ✅ Implementar variables de entorno
4. ✅ Habilitar Row Level Security (RLS) en Supabase
5. ✅ Eliminar modo de autenticación legacy (localStorage con contraseñas en texto plano)

## 🔒 Problemas de Seguridad Identificados

### Críticos
- **Credenciales expuestas**: API keys visibles en código fuente
- **Contraseñas en texto plano**: Almacenamiento inseguro en localStorage (modo legacy)
- **Sin validación de entrada**: Vulnerabilidad a inyección XSS

### Altos
- **Sin rate limiting del lado del servidor**: Vulnerable a ataques de fuerza bruta
- **Lógica de autenticación en cliente**: Comparación de contraseñas en el navegador

### Medios
- **Sin sanitización HTML**: Uso de innerHTML con datos de usuario
- **Sin validación de tipos**: Datos de formularios sin validar

## 📋 Características

- 🔐 Autenticación de usuarios (email/contraseña)
- 💰 Seguimiento de presupuesto mensual
- 📊 Categorización de gastos e ingresos
- 💾 Sincronización en la nube con Supabase
- 📧 Alertas por email con EmailJS
- 📱 Soporte PWA (instalable)
- 🎯 12 categorías predefinidas de gastos
- 📈 Indicador de salud financiera
- 📉 Proyecciones de gastos

## 🛠️ Tecnologías

- **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth)
- **Email**: EmailJS
- **Fuentes**: Google Fonts (Nunito)
- **Iconos**: FontAwesome 6.4.0

## 📦 Dependencias (CDN)

Todas las dependencias se cargan via CDN (sin proceso de build):

- Tailwind CSS: `https://cdn.tailwindcss.com`
- FontAwesome: `cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0`
- EmailJS: `cdn.jsdelivr.net/npm/@emailjs/browser@3`
- Supabase: `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`

## 🚀 Instalación (Desarrollo Local)

### Opción 1: Servidor Simple

```bash
# Clonar el repositorio
git clone https://github.com/PaulMoralesG/foresight-finanzas.git
cd foresight-finanzas

# Usar cualquier servidor HTTP local
python3 -m http.server 8000
# O con Node.js
npx serve .
# O con PHP
php -S localhost:8000
```

Luego abrir: `http://localhost:8000`

### Opción 2: Abrir Directamente

Simplemente abrir `index.html` en un navegador moderno.

**Nota**: Algunas funcionalidades PWA requieren HTTPS en producción.

## ⚙️ Configuración de Servicios

### Supabase

1. Crear cuenta en [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Configurar tabla `profiles`:

```sql
create table profiles (
  email text primary key,
  budget numeric default 0,
  expenses jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilitar Row Level Security
alter table profiles enable row level security;

-- Política: usuarios solo acceden sus propios datos
create policy "Users can only access their own profile"
  on profiles for all
  using (auth.email() = email);
```

4. Obtener:
   - Project URL
   - Anon/Public Key

### EmailJS

1. Crear cuenta en [emailjs.com](https://www.emailjs.com/)
2. Configurar servicio de email (Gmail, etc.)
3. Crear plantilla con variables:
   - `{{to_email}}`
   - `{{user_name}}`
   - `{{total_spent}}`
   - `{{budget_limit}}`
   - `{{financial_status}}`
   - `{{projected_balance}}`
4. Obtener:
   - Public Key
   - Service ID
   - Template ID

### Variables de Entorno (PENDIENTE)

**Actualmente las credenciales están hardcodeadas. DEBE implementarse:**

Crear archivo `.env` (NO COMMITEAR):

```env
VITE_SUPABASE_URL=tu_url_aqui
VITE_SUPABASE_ANON_KEY=tu_key_aqui
VITE_EMAILJS_PUBLIC_KEY=tu_key_aqui
VITE_EMAILJS_SERVICE_ID=tu_service_id_aqui
VITE_EMAILJS_TEMPLATE_ID=tu_template_id_aqui
```

## 📱 PWA (Progressive Web App)

La aplicación es instalable en dispositivos móviles:

1. Abrir en Chrome/Safari móvil
2. Menú → "Agregar a pantalla de inicio"
3. La app se instala como aplicación nativa

**Requisitos para PWA:**
- HTTPS (excepto localhost)
- `manifest.json` válido ✅
- Service Worker (PENDIENTE - mejoraría offline mode)

## 🧪 Testing

**Estado Actual**: Sin infraestructura de testing.

**Recomendado implementar:**

```bash
# Instalar herramientas
npm init -y
npm install -D jest @testing-library/dom @testing-library/user-event

# Agregar tests
npm test
```

## 📊 Estructura del Proyecto

```
foresight-finanzas/
├── index.html          # Aplicación completa (900+ líneas)
├── manifest.json       # Configuración PWA
├── .gitignore         # (vacío actualmente)
└── README.md          # Este archivo
```

**Nota**: Todo el código está en un solo archivo HTML. Refactorización recomendada.

## 🔧 Mejoras Recomendadas

### Prioridad Alta
1. ✅ Mover credenciales a variables de entorno
2. ✅ Implementar validación de entrada
3. ✅ Sanitizar HTML antes de insertar contenido de usuario
4. ✅ Eliminar modo legacy (localStorage con contraseñas)
5. ✅ Configurar RLS en Supabase

### Prioridad Media
6. ✅ Refactorizar en múltiples archivos (separación de concerns)
7. ✅ Agregar TypeScript para type safety
8. ✅ Implementar build system (Vite recomendado)
9. ✅ Agregar ESLint + Prettier
10. ✅ Implementar testing (Jest + Testing Library)

### Prioridad Baja
11. ✅ Agregar Service Worker para modo offline
12. ✅ Implementar CI/CD
13. ✅ Agregar monitoring/logging
14. ✅ Optimizar rendimiento con listas grandes

## 📝 Uso

1. **Login/Registro**: Ingresar email y contraseña
2. **Configurar Presupuesto**: Establecer límite mensual
3. **Agregar Transacciones**: 
   - Click en botón `+`
   - Seleccionar tipo (gasto/ingreso)
   - Elegir categoría
   - Ingresar monto y concepto
4. **Ver Resumen**: Click en "Ver resumen"
5. **Recibir Alertas**: Click en "Enviar reporte"

## 🤝 Contribuir

1. Fork el proyecto
2. Crear branch (`git checkout -b feature/mejora`)
3. Commit cambios (`git commit -m 'Agregar mejora'`)
4. Push al branch (`git push origin feature/mejora`)
5. Abrir Pull Request

**Importante**: NO commitear credenciales al hacer contribuciones.

## 📄 Licencia

Este proyecto es de código abierto. Ver licencia en el repositorio.

## 👤 Autor

**Paul Morales G.**
- GitHub: [@PaulMoralesG](https://github.com/PaulMoralesG)

## 🆘 Soporte

Para reportar problemas o solicitar características, abrir un issue en GitHub.

---

**Última actualización**: Febrero 2026
**Estado del Proyecto**: ⚠️ Prototipo funcional con problemas de seguridad críticos
