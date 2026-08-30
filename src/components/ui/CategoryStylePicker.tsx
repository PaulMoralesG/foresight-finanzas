// ================================================================
// Selectores de icono y color de una categoría
//
// El mismo par de rejillas está en el formulario de alta rápida del modal de
// transacción y en el gestor de categorías del perfil. Eran copias literales,
// incluidas las etiquetas para lector de pantalla, así que cualquier arreglo
// de accesibilidad había que hacerlo dos veces o se quedaba a medias.
// ================================================================

import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/config/categories';

/** Los ocho primeros de la paleta: los que caben en una fila sin apretar. */
const COLORES = CATEGORY_COLORS.slice(0, 8);

export function IconPicker({
  value,
  onChange,
  size = 'md',
}: {
  value: string;
  onChange: (emoji: string) => void;
  /** `sm` para la edición en línea de una categoría, donde va apretado. */
  size?: 'sm' | 'md';
}) {
  const compacto = size === 'sm';
  return (
    <div className={`flex flex-wrap ${compacto ? 'gap-0.5' : 'gap-1'}`}>
      {CATEGORY_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onChange(emoji)}
          aria-label={`Usar el ícono ${emoji}`}
          aria-pressed={value === emoji}
          className={`flex items-center justify-center rounded leading-none transition-all ${
            compacto ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-base'
          } ${
            value === emoji
              ? 'ring-2 ring-brand-500 bg-white dark:bg-slate-700'
              : 'hover:bg-white dark:hover:bg-slate-700'
          }`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <>
      {COLORES.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Usar el color ${i + 1} de ${COLORES.length}`}
          aria-pressed={value === c}
          // El color de fondo es la primera clase del par 'bg-… text-…'
          className={`w-5 h-5 rounded-full border-2 transition-all ${c.split(' ')[0]} ${
            value === c
              ? 'ring-2 ring-brand-500 scale-110 border-white dark:border-slate-900'
              : 'border-transparent'
          }`}
        />
      ))}
    </>
  );
}
