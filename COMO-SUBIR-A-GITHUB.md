# 📤 Cómo Subir Foresight Finanzas a GitHub

## Opción 1: Desde la Terminal (Recomendado)

### 1. Inicializa Git en tu proyecto
```bash
cd "c:\Users\paul.morales\Downloads\Compressed\foresight-finanzas-main\foresight-finanzas-main"
git init
```

### 2. Agrega todos los archivos
```bash
git add .
```

### 3. Haz el primer commit
```bash
git commit -m "🚀 Versión inicial de Foresight Finanzas - App de control financiero"
```

### 4. Crea un repositorio en GitHub
1. Ve a https://github.com/new
2. Nombre del repositorio: `foresight-finanzas`
3. Descripción: `Control financiero simple para emprendedores - Personal y Negocio`
4. Elige: **Público** o **Privado**
5. ⚠️ **NO** marques "Add README" ni ".gitignore" (ya los tienes)
6. Haz clic en **Create repository**

### 5. Conecta tu repositorio local con GitHub
```bash
git remote add origin https://github.com/TU_USUARIO/foresight-finanzas.git
git branch -M main
git push -u origin main
```

**Reemplaza `TU_USUARIO`** con tu nombre de usuario de GitHub.

---

## Opción 2: Desde GitHub Desktop (Más Fácil)

### 1. Descarga GitHub Desktop
- https://desktop.github.com/

### 2. Abre GitHub Desktop
1. File → Add Local Repository
2. Selecciona la carpeta: `c:\Users\paul.morales\Downloads\Compressed\foresight-finanzas-main\foresight-finanzas-main`
3. Click en "create a repository" si no está inicializado

### 3. Publica a GitHub
1. Click en **"Publish repository"** (arriba)
2. Nombre: `foresight-finanzas`
3. Descripción: `Control financiero simple para emprendedores`
4. Elige si quieres que sea privado o público
5. Click en **Publish**

✅ ¡Listo! Tu código está en GitHub.

---

## ⚙️ Configurar Secrets (IMPORTANTE para producción)

Después de subir, si quieres que otros usen tu app:

### GitHub Pages (Hosting gratuito):
1. Ve a tu repositorio en GitHub
2. Settings → Pages
3. Source: **main** branch
4. Carpeta: **/ (root)**
5. Save

Tu app estará en: `https://TU_USUARIO.github.io/foresight-finanzas/`

### Importante:
- El archivo `js/config.prod.js` contiene las credenciales de Supabase
- ⚠️ Si el repo es público, tus credenciales de Supabase serán visibles
- Considera usar variables de entorno o Supabase Row Level Security

---

## 📝 Comandos Útiles

### Actualizar cambios en GitHub:
```bash
git add .
git commit -m "Descripción de cambios"
git push
```

### Ver estado actual:
```bash
git status
```

### Ver historial:
```bash
git log --oneline
```

---

## 🎉 Próximos Pasos

Una vez en GitHub:
1. Agrega un buen README.md con capturas de pantalla
2. Agrega topics/tags: `finance`, `pwa`, `budgeting`, `javascript`
3. Habilita GitHub Pages para que sea accesible online
4. Comparte el enlace con tus usuarios

---

**¿Necesitas ayuda?** Puedes pedirme que ejecute estos comandos por ti.
