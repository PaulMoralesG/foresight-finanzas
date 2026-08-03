// ================================================================
// LoginPage — Split-layout SaaS
// ================================================================

import { useState, type FormEvent } from 'react';
import { TrendingUp, Sun, Moon, MailCheck, Loader2, ArrowLeft, Gauge, FileText, PiggyBank, Smartphone } from 'lucide-react';
import { LoginForm } from '@/components/features/auth/LoginForm';
import { SignUpForm } from '@/components/features/auth/SignUpForm';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { Toast } from '@/components/ui/Toast';

type Mode = 'login' | 'signup' | 'forgot';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const { resetPassword } = useAuth();
  const isDark = useUiStore((s) => s.isDark);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const addToast = useUiStore((s) => s.addToast);

  // ── Forgot password state ──
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      addToast('Ingresa un correo válido', 'error');
      return;
    }
    setForgotLoading(true);
    try {
      const result = await resetPassword(forgotEmail.trim());
      if (result.success) {
        setForgotSent(true);
      } else {
        // Traducir errores comunes de Supabase
        const msg = result.message;
        if (msg.includes('rate limit') || msg.includes('Too many requests')) {
          addToast('Límite de correos alcanzado. Intenta en 1 hora.', 'error');
        } else {
          addToast(msg || 'Error al enviar el enlace', 'error');
        }
      }
    } catch {
      addToast('Error al enviar el enlace', 'error');
    } finally {
      setForgotLoading(false);
    }
  }

  function goToLogin() {
    setMode('login');
    setForgotEmail('');
    setForgotSent(false);
  }

  const subtitleText = mode === 'login'
    ? 'Accede a tu panel de finanzas'
    : mode === 'signup'
      ? 'Comienza a organizar tus finanzas hoy'
      : 'Recupera el acceso a tu cuenta';

  const titleText = mode === 'login'
    ? 'Iniciar sesión'
    : mode === 'signup'
      ? 'Crear cuenta'
      : 'Recuperar contraseña';

  return (
    <div className="h-dvh flex bg-white dark:bg-slate-950">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-slate-950">
        {/* Gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700 via-brand-900 to-slate-950" />
        {/* Subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.04] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PGRlZnM+PGZpbHRlciBpZD0ibiI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9Ii45IiBudW1PY3RhdmVzPSI0IiAvPjwvZmlsdGVyPjwvZGVmcz48cmVjdCB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIGZpbHRlcj0idXJsKCNuKSIgb3BhY2l0eT0iMSIgLz48L3N2Zz4=')]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Top */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <TrendingUp className="text-white text-lg" />
              </div>
              <span className="text-white font-bold text-lg">Foresight</span>
            </div>
          </div>

          {/* Middle — Value Prop */}
          <div className="space-y-6 max-w-md">
            <h2 className="text-4xl font-extrabold text-white leading-tight">
              Tus finanzas,
              <br />
              <span className="text-brand-300">bajo control total</span>
            </h2>
            <p className="text-lg text-slate-300 leading-relaxed">
              Separa ingresos y gastos personales de tu negocio. Visualiza tu crecimiento
              mes a mes con reportes claros y exportables.
            </p>

            {/* Feature list */}
            <div className="space-y-3">
              {[
                { Icon: Gauge, label: 'Dashboard en tiempo real' },
                { Icon: FileText, label: 'Exportación a PDF' },
                { Icon: PiggyBank, label: 'Presupuestos mensuales' },
                { Icon: Smartphone, label: '100% responsive' },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3 text-white/90 text-sm">
                  <f.Icon className="text-brand-400 text-sm w-5 text-center" />
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <p className="text-slate-400 text-xs">
            © {new Date().getFullYear()} Foresight Finanzas. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Right Panel — Auth Form */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 pt-safe pb-safe"
      >
        <div className="w-full max-w-sm">
          {/* Dark mode toggle pill */}
          <div className="flex justify-end mb-6">
            <button
              onClick={toggleDarkMode}
              className="dark-mode-pill"
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              <span className={`dark-mode-pill-option ${!isDark ? 'active' : ''}`}>
                <Sun />
              </span>
              <span className={`dark-mode-pill-option ${isDark ? 'active' : ''}`}>
                <Moon />
              </span>
            </button>
          </div>

          {/* Mobile brand (shown only on small screens) */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <TrendingUp className="text-white text-lg" />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white">Foresight</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
            {titleText}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {subtitleText}
          </p>

          {mode === 'forgot' ? (
            forgotSent ? (
              /* ── Éxito: correo enviado ── */
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <MailCheck className="text-2xl text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">¡Correo enviado!</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Revisa <strong>{forgotEmail}</strong> y sigue el enlace para restablecer tu contraseña.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={goToLogin}
                  className="saas-btn-primary w-full"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            ) : (
              /* ── Formulario de recuperación ── */
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                </p>
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="saas-input"
                  autoComplete="email"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="saas-btn-primary w-full"
                >
                  {forgotLoading ? (
                    <Loader2 className="animate-spin w-4 h-4" />
                  ) : (
                    'Enviar enlace de recuperación'
                  )}
                </button>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className="text-brand-600 dark:text-brand-400 font-semibold hover:underline"
                  >
                    <ArrowLeft className="inline w-3 h-3 mr-1" />
                    Volver al inicio de sesión
                  </button>
                </p>
              </form>
            )
          ) : mode === 'login' ? (
            <LoginForm
              onSwitchToSignUp={() => setMode('signup')}
              onForgotPassword={() => setMode('forgot')}
            />
          ) : (
            <SignUpForm
              onSwitchToLogin={() => setMode('login')}
              onSuccess={() => goToLogin()}
            />
          )}
        </div>
      </div>

      <Toast />
    </div>
  );
}
