/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      /**
       * Tipografía: Fraunces para títulos (le da carácter de libro contable),
       * IBM Plex Sans para interfaz e IBM Plex Mono para cifras. Las tres se
       * sirven desde el propio bundle (@fontsource), como ya se hacía con
       * Inter: nada de peticiones a Google Fonts, que rompería el CSP de
       * `vercel.json` y el funcionamiento sin conexión.
       */
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        /**
         * Neutro de papel: un gris con sesgo cálido-verdoso en vez del azul de
         * `slate`. Se redefine la propia escala `slate` a propósito — toda la
         * app la usa, así que cambiarla aquí reviste cada pantalla sin tocar
         * un solo componente. Los tonos mantienen las mismas relaciones de
         * contraste que la escala original (500 sobre blanco = 4.9:1).
         */
        slate: {
          50: '#f9f9f7',
          100: '#f3f2ee',
          200: '#e6e4dd',
          300: '#cfccc2',
          400: '#a3a099',
          500: '#7a7872',
          600: '#5f5e58',
          700: '#4a4944',
          800: '#232320',
          900: '#1a1a19',
          950: '#0d0d0d',
        },
        /** Verde tinta: el acento de la app (botones, estado activo, foco). */
        brand: {
          50: '#e4f1ec',
          100: '#c7e3da',
          200: '#9ccfc1',
          300: '#6bb6a3',
          400: '#38b799',
          500: '#17917a',
          600: '#0f6e5c',
          700: '#0c5949',
          800: '#0a453a',
          900: '#08372f',
          950: '#04211c',
        },
        income: {
          50: '#e9f7f0',
          100: '#cdeade',
          200: '#a3dcc5',
          300: '#6fcba6',
          400: '#34d399',
          500: '#1baf7a',
          600: '#0f7a54',
          700: '#0b5f41',
          800: '#084a33',
          900: '#063a28',
          950: '#032018',
        },
        expense: {
          50: '#fdeceb',
          100: '#fad7d5',
          200: '#f5b3b0',
          300: '#ee8884',
          400: '#f87171',
          500: '#e34948',
          600: '#c23b33',
          700: '#9e2f29',
          800: '#7d2520',
          900: '#631d19',
          950: '#380f0d',
        },
        /** Negocio: terracota, el contrapunto cálido de lo personal. */
        business: {
          50: '#f7e9de',
          100: '#efd4c1',
          200: '#e3b394',
          300: '#d69466',
          400: '#e08a54',
          500: '#c26a33',
          600: '#a8501f',
          700: '#8a4119',
          800: '#6c3314',
          900: '#552810',
          950: '#2c1408',
        },
      },
      /**
       * Dos escalones por debajo de `text-xs` (12px), que es donde acaba la
       * escala de Tailwind.
       *
       * Estaban escritos como valores arbitrarios: `text-[11px]` noventa veces
       * y `text-[9px]` tres, mezclados con la escala normal. Así no había forma
       * de saber si 11px era una decisión o un despiste, ni de cambiarlo sin
       * tocar noventa sitios.
       *
       * Se declaran como cadena y no como par [tamaño, interlineado] a
       * propósito: el valor arbitrario tampoco fijaba interlineado, y ponerlo
       * ahora cambiaría el alto de línea de media aplicación.
       */
      fontSize: {
        '3xs': '9px',
        '2xs': '11px',
      },
      /**
       * Escala de apilado con nombre.
       *
       * Los valores estaban escritos a mano y sin criterio: de `z-30` a
       * `z-[9999]`, con la cabecera y la barra de pestañas empatadas en 30 y
       * tres modales distintos compartiendo `z-[200]`/`z-[201]`. Cuando dos
       * capas empatan, el orden lo decide el DOM, que no es una decisión de
       * diseño. Estos nombres dicen qué va encima de qué y por qué.
       */
      zIndex: {
        base: '0',       // contenido normal en su contexto
        sticky: '30',    // cabecera pegajosa
        nav: '40',       // barra de pestañas, sidebar y FAB
        popover: '50',   // menú de usuario y tooltips del sidebar
        actionbar: '80', // barra de selección múltiple, sobre la de pestañas
        overlay: '200',  // fondo oscuro de un modal
        modal: '201',    // panel del modal
        banner: '250',   // avisos de instalar/actualizar la PWA
        dialog: '300',   // confirmación: va sobre cualquier modal
        toast: '400',    // avisos: siempre visibles, incluso sobre un diálogo
      },
      animation: {
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.3s ease forwards',
        'scale-in': 'scaleIn 0.2s ease forwards',
      },
      keyframes: {
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
