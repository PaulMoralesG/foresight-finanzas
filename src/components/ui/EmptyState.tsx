// ================================================================
// EmptyState — Tarjeta de "aquí todavía no hay nada"
//
// Había cinco variantes escritas a mano por la app (dos en HomePage, una en
// MovementsPage, otra en SavingsPage y varias sueltas en StatsPage), con el
// mismo círculo de 48px y distinto tamaño de texto en cada una. El estado
// vacío es lo primero que ve alguien que abre la app por primera vez, así que
// conviene que sea el mismo en todas partes.
// ================================================================

import type { IconComponent } from '@/components/ui/Icon';

interface EmptyStateProps {
  /** Icono del sprite (components/ui/icons.generated). Alternativa: `emoji`. */
  icon?: IconComponent;
  /** Emoji grande, para las pantallas que usan ese registro (metas de ahorro). */
  emoji?: string;
  title: string;
  /** Segunda línea, opcional: qué hacer para llenar esto. */
  description?: string;
  /** Llamada a la acción, opcional. */
  action?: { label: string; onClick: () => void; icon?: IconComponent };
  /** `compact` para tarjetas densas (StatsPage), `card` para el resto. */
  variant?: 'card' | 'compact';
}

export function EmptyState({
  icon: Icon,
  emoji,
  title,
  description,
  action,
  variant = 'card',
}: EmptyStateProps) {
  const compacto = variant === 'compact';
  const ActionIcon = action?.icon;

  return (
    <div className={compacto ? 'text-center py-6' : 'saas-card p-6 text-center'}>
      {emoji ? (
        <div className="text-4xl mb-3">{emoji}</div>
      ) : Icon ? (
        <div
          className={
            compacto
              ? 'mx-auto mb-1.5 w-6 h-6 text-slate-400 dark:text-slate-500'
              : 'w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center'
          }
        >
          <Icon className={compacto ? 'w-6 h-6' : 'text-slate-500 dark:text-slate-400 w-5 h-5'} />
        </div>
      ) : null}

      <p
        className={
          compacto
            ? 'text-xs text-slate-500 dark:text-slate-400'
            : 'text-sm font-medium text-slate-600 dark:text-slate-400'
        }
      >
        {title}
      </p>

      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm mx-auto">
          {description}
        </p>
      )}

      {action && (
        <button onClick={action.onClick} className="saas-btn-primary saas-btn-sm mt-3">
          {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
