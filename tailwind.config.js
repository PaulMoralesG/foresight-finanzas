/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        income: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        expense: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        business: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
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
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
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
        skeleton: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
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
