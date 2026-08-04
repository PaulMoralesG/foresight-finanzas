// ================================================================
// LoginForm - Formulario de inicio de sesión
// ================================================================

import { useState, type FormEvent, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/** Traduce errores de Supabase a español amigable */
function authErrorToSpanish(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  const map: Record<string, string> = {
    'Invalid login credentials': 'Correo o contraseña incorrectos',
    'Email not confirmed': 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
    'User not found': 'No existe una cuenta con ese correo',
    'Too many requests': 'Demasiados intentos. Espera unos segundos',
    'Request rate limit exceeded': 'Demasiadas solicitudes. Espera un momento.',
    'Email rate limit exceeded': 'Límite de correos alcanzado. Intenta en 1 hora.',
    'Invalid email': 'El correo no es válido',
  };
  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return msg || 'Error al iniciar sesión';
}

interface Props {
  onSwitchToSignUp: () => void;
  onForgotPassword: () => void;
}

export function LoginForm({ onSwitchToSignUp, onForgotPassword }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const attemptRef = useRef(0);
  const lockoutRef = useRef(false);
  const errorRef = useRef('');

  function clearError() { setError(''); errorRef.current = ''; }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();

    if (!email.trim()) {
      const msg = 'Ingresa tu correo electrónico';
      setError(msg);
      errorRef.current = msg;
      return;
    }
    if (!password) {
      const msg = 'Ingresa tu contraseña';
      setError(msg);
      errorRef.current = msg;
      return;
    }

    // Rate limiting: delay progresivo tras intentos fallidos (1s → 2s → 4s → 8s)
    if (lockoutRef.current) {
      const msg = 'Demasiados intentos. Espera unos segundos.';
      setError(msg);
      errorRef.current = msg;
      return;
    }
    const delay = Math.pow(2, attemptRef.current) * 1000;
    if (attemptRef.current > 0) {
      const msg = `Verificando... (intento ${attemptRef.current + 1})`;
      setError(msg);
      errorRef.current = msg;
      await new Promise(r => setTimeout(r, delay));
    }

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      attemptRef.current = 0;
      errorRef.current = '';
    } catch (err: unknown) {
      attemptRef.current++;
      const msg = authErrorToSpanish(err);
      setError(msg);
      errorRef.current = msg;
      if (attemptRef.current >= 4) {
        lockoutRef.current = true;
        const lockMsg = 'Demasiados intentos fallidos. Espera 30 segundos.';
        setError(lockMsg);
        errorRef.current = lockMsg;
        setTimeout(() => {
          lockoutRef.current = false;
          attemptRef.current = 0;
          if (errorRef.current === lockMsg) {
            setError('');
            errorRef.current = '';
          }
        }, 30000);
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (hasError: boolean) =>
    `saas-input pr-10 ${hasError ? '!border-red-500 !ring-red-500/20 focus:!ring-red-500/30' : ''}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="email"
        placeholder="Correo electrónico"
        value={email}
        onChange={(e) => { setEmail(e.target.value); clearError(); }}
        className={inputClass(!!error && !password)}
        autoComplete="email"
      />
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Contraseña"
          value={password}
          onChange={(e) => { setPassword(e.target.value); clearError(); }}
          className={inputClass(!!error && !!password)}
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          tabIndex={-1}
        >
          {showPassword ? <EyeOff className="text-xs" /> : <Eye className="text-xs" />}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-xs text-brand-600 dark:text-brand-400 font-medium hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2 border border-red-200 dark:border-red-800/50">
          <AlertCircle className="inline w-3.5 h-3.5 mr-1.5" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="saas-btn-primary w-full"
      >
        {loading ? (
          <Loader2 className="animate-spin w-4 h-4 mx-auto" />
        ) : (
          <span className="inline-flex items-center gap-2">
            <LogIn className="w-4 h-4" />
            Iniciar Sesión
          </span>
        )}
      </button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        ¿No tienes cuenta?{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="text-brand-600 dark:text-brand-400 font-semibold hover:underline"
        >
          Crear cuenta
        </button>
      </p>
    </form>
  );
}
