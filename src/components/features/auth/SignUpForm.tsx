// ================================================================
// SignUpForm - Formulario de registro
// ================================================================

import { useState, type FormEvent, useRef } from 'react';
import { Eye, EyeOff, MailCheck, AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/** Traduce errores de Supabase a español amigable */
function signUpErrorToSpanish(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  const map: Record<string, string> = {
    'User already registered': 'Ya existe una cuenta con ese correo',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
    'Unable to validate email': 'El correo no es válido',
    'Too many requests': 'Demasiados intentos. Espera unos segundos',
    'Email rate limit exceeded': 'Límite de correos alcanzado. Intenta de nuevo en 1 hora.',
    'Request rate limit exceeded': 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
    'For security purposes': 'Por seguridad, espera unos segundos antes de intentar de nuevo.',
  };
  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return msg || 'Error al crear la cuenta';
}

/** Evalúa la fortaleza de una contraseña (0-4) */
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z\d]/.test(pw)) score++;
  const levels = [
    { label: 'Muy débil', color: '#ef4444' },
    { label: 'Débil', color: '#f97316' },
    { label: 'Aceptable', color: '#eab308' },
    { label: 'Buena', color: '#22c55e' },
    { label: 'Excelente', color: '#10b981' },
  ];
  return { score, ...levels[score] };
}

interface Props {
  onSwitchToLogin: () => void;
  onSuccess?: () => void;
}

export function SignUpForm({ onSwitchToLogin, onSuccess }: Props) {
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const attemptRef = useRef(0);
  const lockoutRef = useRef(false);

  const pwStrength = passwordStrength(password);
  const showStrength = password.length > 0;

  function clearError() {
    setError('');
    setSuccessMsg('');
  }

  function validateField(field: string, value: string) {
    const errs = { ...fieldErrors };
    switch (field) {
      case 'firstName':
        errs.firstName = !value.trim() ? 'Requerido' : '';
        break;
      case 'email':
        errs.email = !value.trim()
          ? 'Requerido'
          : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            ? 'Correo no válido'
            : '';
        break;
      case 'password':
        errs.password = value.length < 6 ? 'Mínimo 6 caracteres' : '';
        break;
    }
    setFieldErrors(errs);
  }

  function handleBlur(field: string, value: string) {
    setTouched((t) => ({ ...t, [field]: true }));
    validateField(field, value);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setTouched({ firstName: true, email: true, password: true });

    // Validar todos los campos
    validateField('firstName', firstName);
    validateField('email', email);
    validateField('password', password);

    if (!firstName.trim() || !email.trim() || password.length < 6) {
      setError('Completa todos los campos requeridos');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un correo electrónico válido');
      return;
    }

    // Rate limiting
    if (lockoutRef.current) {
      setError('Demasiados intentos. Espera unos segundos.');
      return;
    }
    const delay = Math.pow(2, attemptRef.current) * 1000;
    if (attemptRef.current > 0) {
      setError(`Verificando... (intento ${attemptRef.current + 1})`);
      await new Promise(r => setTimeout(r, delay));
    }

    setLoading(true);
    try {
      const data = await signUp(email.trim(), password, firstName.trim(), lastName.trim());
      attemptRef.current = 0;
      if (data?.session) {
        onSuccess?.();
      } else if (data?.user) {
        setSuccessMsg(`Te enviamos un enlace de confirmación a ${email.trim()}. Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.`);
      } else {
        setError('No se pudo crear la cuenta. Intenta de nuevo.');
      }
    } catch (err: unknown) {
      attemptRef.current++;
      const msg = signUpErrorToSpanish(err);
      setError(msg);
      if (attemptRef.current >= 4) {
        lockoutRef.current = true;
        setError('Demasiados intentos. Espera 30 segundos.');
        setTimeout(() => {
          lockoutRef.current = false;
          attemptRef.current = 0;
        }, 30000);
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (hasError: boolean) =>
    `saas-input ${hasError ? '!border-red-500 !ring-red-500/20 focus:!ring-red-500/30' : ''}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Nombre + Apellido */}
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Nombre"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); clearError(); if (touched.firstName) validateField('firstName', e.target.value); }}
            onBlur={(e) => handleBlur('firstName', e.target.value)}
            className={inputClass(!!fieldErrors.firstName && touched.firstName)}
          />
          {touched.firstName && fieldErrors.firstName && (
            <p className="text-[11px] text-red-500 mt-1 ml-1">{fieldErrors.firstName}</p>
          )}
        </div>
        <div className="flex-1">
          <input
            type="text"
            placeholder="Apellido"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); clearError(); }}
            className="saas-input"
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearError(); if (touched.email) validateField('email', e.target.value); }}
          onBlur={(e) => handleBlur('email', e.target.value)}
          className={inputClass(!!fieldErrors.email && touched.email)}
          autoComplete="email"
        />
        {touched.email && fieldErrors.email && (
          <p className="text-[11px] text-red-500 mt-1 ml-1">{fieldErrors.email}</p>
        )}
      </div>

      {/* Password con indicador de fortaleza */}
      <div>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Contraseña (mín. 6 caracteres)"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError(); if (touched.password) validateField('password', e.target.value); }}
            onBlur={(e) => handleBlur('password', e.target.value)}
            className={inputClass(!!fieldErrors.password && touched.password) + ' pr-10'}
            autoComplete="new-password"
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
        {touched.password && fieldErrors.password && (
          <p className="text-[11px] text-red-500 mt-1 ml-1">{fieldErrors.password}</p>
        )}
        {/* Barra de fortaleza */}
        {showStrength && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: i <= pwStrength.score ? pwStrength.color : '#e2e8f0',
                    opacity: i <= pwStrength.score ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
            <p className="text-[11px] mt-1 ml-1 font-medium" style={{ color: pwStrength.color }}>
              {pwStrength.label}
            </p>
          </div>
        )}
      </div>

      {/* Mensaje de éxito */}
      {successMsg && (
        <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-4 py-3 border border-emerald-200 dark:border-emerald-800/50">
          <div className="flex items-start gap-2.5">
            <MailCheck className="text-base mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">¡Correo enviado!</p>
              <p className="opacity-80">{successMsg}</p>
              <p className="text-[11px] mt-2 opacity-60">
                ¿No lo encuentras? Revisa la carpeta de spam o promociones.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mensaje de error */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2 border border-red-200 dark:border-red-800/50">
          <AlertCircle className="inline w-3.5 h-3.5 mr-1.5" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !!successMsg}
        className="saas-btn-primary w-full"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="animate-spin w-4 h-4" />
            Creando cuenta...
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Crear Cuenta
          </span>
        )}
      </button>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        ¿Ya tienes cuenta?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-brand-600 dark:text-brand-400 font-semibold hover:underline"
        >
          Iniciar sesión
        </button>
      </p>
    </form>
  );
}
