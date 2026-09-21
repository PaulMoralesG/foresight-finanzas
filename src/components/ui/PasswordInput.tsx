// ================================================================
// PasswordInput — Campo de contraseña con botón de mostrar/ocultar
//
// LoginForm y SignUpForm ya tenían este patrón (icono Eye/EyeOff,
// aria-pressed, el mismo botón de 36px superpuesto al campo). El de cambiar
// contraseña en Perfil —el único con TRES campos de contraseña seguidos,
// incluido uno de "repetir"— no lo tenía: doble tecleo a ciegas, la
// combinación menos indulgente posible. Si el usuario comete la misma
// errata en los dos campos, coinciden entre sí mientras el formulario los ve,
// pero no es la contraseña que el usuario cree tener — y no se entera hasta
// que falla el siguiente login.
// ================================================================

import { useState, type KeyboardEvent } from 'react';
import { Eye, EyeOff } from '@/components/ui/icons.generated';

interface PasswordInputProps {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  onKeyDown,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        className="saas-input pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
