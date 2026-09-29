import { Sun, Moon } from '@/components/ui/icons.generated';
import { useUiStore } from '@/stores/uiStore';

/** Píldora sol/luna que alterna el tema; la usan la cabecera y la pantalla de acceso. */
export function DarkModeToggle() {
  const isDark = useUiStore((s) => s.isDark);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  return (
    <button
      onClick={toggleDarkMode}
      className="dark-mode-pill"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
    >
      <span className={`dark-mode-pill-option ${!isDark ? 'active' : ''}`}>
        <Sun className="w-3.5 h-3.5" />
      </span>
      <span className={`dark-mode-pill-option ${isDark ? 'active' : ''}`}>
        <Moon className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}
