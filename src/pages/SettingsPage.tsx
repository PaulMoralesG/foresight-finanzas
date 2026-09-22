// ================================================================
// SettingsPage — Configuración SaaS con edición de perfil
// ================================================================

import { useState } from 'react';
import { Pencil, Loader2, Check, Mail, ChevronUp, ChevronRight, Send, Lock, Key, Sun, Moon, LogOut } from '@/components/ui/icons.generated';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { supabaseAvailable } from '@/config/supabase';
import { userInitials } from '@/lib/utils';
import { MIN_PASSWORD_LENGTH, STRENGTH_TRACK_CLASS, passwordStrength, validateNewPasswordOnline } from '@/lib/password';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { CategoryManager } from '@/components/features/categories/CategoryManager';
import { BackupSettings } from '@/components/features/settings/BackupSettings';

type Section = 'profile' | 'email' | 'password' | 'categories' | null;

export function SettingsPage() {
  const { signOut, updateProfile, updateEmail, updatePassword, saveData } = useAuth();
  const user = useAuthStore((s) => s.user);
  const isDark = useUiStore((s) => s.isDark);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const addToast = useUiStore((s) => s.addToast);

  const [expanded, setExpanded] = useState<Section>(null);

  // ── Edit profile form ──
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Change email form ──
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // ── Change password form ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const pwStrength = passwordStrength(newPassword);

  // ── Confirmación de cierre de sesión ──
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);


  const initials = userInitials(user);

  const fullName = user?.firstName
    ? `${user.firstName} ${user.lastName}`.trim()
    : user?.email || 'Usuario';

  const toggleSection = (section: Section) => {
    setExpanded(expanded === section ? null : section);
    // Resetear formularios al colapsar
    if (expanded !== section) {
      if (section === 'profile') {
        setEditFirstName(user?.firstName || '');
        setEditLastName(user?.lastName || '');
      }
      if (section === 'email') setNewEmail('');
      if (section === 'password') { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
    }
  };

  const handleSaveProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      addToast('Nombre y apellido son obligatorios', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile(editFirstName.trim(), editLastName.trim());
      addToast('Perfil actualizado ✅', 'success');
      setExpanded(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar perfil';
      addToast(msg, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      addToast('Ingresa un correo válido', 'error');
      return;
    }
    setSavingEmail(true);
    try {
      const result = await updateEmail(newEmail.trim());
      if (result.success) {
        addToast(result.message, 'success');
        setExpanded(null);
      } else {
        addToast(result.message, 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cambiar correo';
      addToast(msg, 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword) {
      addToast('Ingresa tu contraseña actual', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Las contraseñas no coinciden', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      // Política local + filtraciones conocidas (HaveIBeenPwned)
      const pwError = await validateNewPasswordOnline(newPassword);
      if (pwError) {
        addToast(pwError, 'error');
        return;
      }
      const result = await updatePassword(currentPassword, newPassword);
      if (result.success) {
        addToast(result.message, 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setExpanded(null);
      } else {
        addToast(result.message, 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cambiar contraseña';
      addToast(msg, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    /* max-w-2xl dejaba una columna estrecha con mucho vacío a la derecha en
       monitores grandes, mientras Inicio y Estadísticas sí se expandían.
       El salto a dos columnas era en xl (1280px): justo por debajo —el
       rango más común de portátiles de trabajo, 1024-1279px— la tarjeta de
       perfil ocupaba el ancho completo en una sola columna, con el avatar y
       el nombre pegados a la izquierda y "Editar" empujado lejos a la
       derecha: mucho vacío en medio, como a medio maquetar. Se adelanta a lg.

       `items-stretch` (el valor por defecto de grid, antes pisado por
       `items-start`): con "Cuenta" mucho más alta que el perfil, `items-start`
       dejaba la tarjeta de perfil corta flotando arriba y un vacío enorme del
       fondo de la página debajo, en la misma fila. Al estirarla a la altura
       de su fila, ese hueco pasa a ser parte de la propia tarjeta —con su
       fondo y borde— en vez de verse como una fila a medio terminar. */
    <div className="animate-fade-in max-w-2xl lg:max-w-5xl grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-5 items-stretch">
      {/* ─── Profile Card ─── */}
      <div className="saas-card p-6 flex flex-col justify-center">
        {/* flex-col en móvil: antes avatar+nombre+botón iban en una sola fila
            y "Usuario Local" (13 caracteres) ya se truncaba a "Usuario Lo…"
            a 375px, solo por competir con el botón "Editar" en el mismo
            renglón. A partir de sm vuelve a la fila única de siempre. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-2xl font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {fullName}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => toggleSection('profile')}
            type="button"
            aria-expanded={expanded === 'profile'}
            className={`saas-btn-sm flex-shrink-0 self-start sm:self-center ${expanded === 'profile' ? 'saas-btn-primary' : 'saas-btn-secondary'}`}
            aria-label="Editar perfil"
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Editar
          </button>
        </div>

        {/* Correo pendiente de verificación: sin esto, el único rastro de un
            cambio de correo en curso era un toast de 5 segundos. Supabase
            exige confirmar el correo viejo Y el nuevo antes de aplicar el
            cambio — mientras tanto, esto es lo que recuerda que quedó a
            medias, incluso si el usuario cerró la pestaña y volvió después. */}
        {user?.pendingEmail && (
          <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800">
            <Mail className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Verificación pendiente para <strong>{user.pendingEmail}</strong>. Revisa esa
              bandeja para confirmar el cambio.
              {/* No se afirma "revisa ambas bandejas": eso depende de si el
                  proyecto tiene activado "Secure email change" en el panel
                  de Supabase (Authentication → Providers). Con esa opción
                  desactivada, solo se envía UN correo —a la dirección
                  nueva—, y decirle al usuario que mire también la bandeja
                  vieja sería instrucción falsa. Confirmado vía la
                  documentación de supabase/auth (Context7): el campo
                  `new_email` que dispara este aviso se llena igual en
                  ambos modos, así que la detección es correcta
                  independientemente del ajuste; solo el texto tenía que
                  dejar de asumirlo. */}
            </p>
          </div>
        )}

        {/* Edit profile inline form */}
        {expanded === 'profile' && (
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-fade-in">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Editar información personal
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="profile-first-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nombre
                </label>
                <input
                  id="profile-first-name"
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="saas-input"
                  placeholder="Tu nombre"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProfile(); }}
                />
              </div>
              <div>
                <label htmlFor="profile-last-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Apellido
                </label>
                <input
                  id="profile-last-name"
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="saas-input"
                  placeholder="Tu apellido"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProfile(); }}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setExpanded(null)} className="saas-btn-secondary saas-btn-sm">
                Cancelar
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="saas-btn-primary saas-btn-sm"
              >
                {savingProfile ? (
                  <Loader2 className="animate-spin w-3 h-3 mr-1" />
                ) : (
                  <Check className="w-3.5 h-3.5 mr-1" />
                )}
                Guardar cambios
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Cuenta ─── */}
      <div className="saas-card divide-y divide-slate-100 dark:divide-slate-800">
        <div className="px-4 pt-4 pb-2">
          <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Cuenta</p>
        </div>

        {/* Change Email.
            Sin comprobar supabaseAvailable, esta fila quedaba clicable en
            modo offline: el usuario rellenaba el formulario entero y recién
            al enviar se enteraba —por un toast genérico— de que era
            imposible desde el principio. updateEmail()/updatePassword() ya
            devuelven 'No disponible en modo offline'; esto evita que haga
            falta llegar tan lejos para descubrirlo. */}
        <div>
          <button
            onClick={() => { if (supabaseAvailable) toggleSection('email'); }}
            type="button"
            disabled={!supabaseAvailable}
            aria-expanded={expanded === 'email'}
            aria-disabled={!supabaseAvailable}
            className={`w-full flex items-center gap-4 p-4 text-left rounded-lg transition-colors ${
              supabaseAvailable
                ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-500 flex-shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Cambiar correo electrónico</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {supabaseAvailable ? 'Actualiza tu dirección de email' : 'Requiere conexión a internet'}
              </p>
            </div>
            {supabaseAvailable ? (
              expanded === 'email' ? <ChevronUp className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 transition-transform" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 transition-transform" />
            ) : null}
          </button>

          {expanded === 'email' && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Te enviaremos un enlace de verificación a tu nuevo correo. El cambio se aplica al confirmar ambos emails.
              </p>
              <div>
                <label htmlFor="profile-new-email" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nuevo correo electrónico
                </label>
                <input
                  id="profile-new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="saas-input"
                  placeholder="nuevo@correo.com"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEmail(); }}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setExpanded(null)} className="saas-btn-secondary saas-btn-sm">
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail}
                  className="saas-btn-primary saas-btn-sm"
                >
                  {savingEmail ? (
                    <Loader2 className="animate-spin w-3 h-3 mr-1" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1" />
                  )}
                  Enviar verificación
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Change Password — mismo motivo que Cambiar correo: sin gatear por
            supabaseAvailable, el formulario entero se podía rellenar en
            modo offline solo para fallar al final. */}
        <div>
          <button
            onClick={() => { if (supabaseAvailable) toggleSection('password'); }}
            type="button"
            disabled={!supabaseAvailable}
            aria-expanded={expanded === 'password'}
            aria-disabled={!supabaseAvailable}
            className={`w-full flex items-center gap-4 p-4 text-left rounded-lg transition-colors ${
              supabaseAvailable
                ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center text-amber-500 flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Cambiar contraseña</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {supabaseAvailable ? 'Mantén tu cuenta protegida' : 'Requiere conexión a internet'}
              </p>
            </div>
            {supabaseAvailable ? (
              expanded === 'password' ? <ChevronUp className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 transition-transform" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 transition-transform" />
            ) : null}
          </button>

          {expanded === 'password' && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Por seguridad, confirma tu contraseña actual antes de elegir una nueva
                de al menos {MIN_PASSWORD_LENGTH} caracteres.
              </p>
              <div>
                <label htmlFor="current-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Contraseña actual
                </label>
                <PasswordInput
                  id="current-password"
                  name="current-password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Tu contraseña de ahora"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePassword(); }}
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nueva contraseña
                </label>
                <PasswordInput
                  id="new-password"
                  name="new-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePassword(); }}
                />
                {newPassword.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            i <= pwStrength.score ? pwStrength.barClass : STRENGTH_TRACK_CLASS
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-2xs mt-1 font-medium ${pwStrength.textClass}`}>
                      {pwStrength.label}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Confirmar contraseña
                </label>
                <PasswordInput
                  id="confirm-password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repite la contraseña"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePassword(); }}
                />
                {/* Antes esto solo se descubría al enviar el formulario:
                    escribías las dos contraseñas y solo al pulsar "Actualizar"
                    te enterabas de que no coincidían. */}
                {confirmPassword.length > 0 && (
                  <p className={`text-2xs mt-1 font-medium ${
                    confirmPassword === newPassword
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {confirmPassword === newPassword ? '✓ Coinciden' : '✗ No coinciden'}
                  </p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setExpanded(null)} className="saas-btn-secondary saas-btn-sm">
                  Cancelar
                </button>
                <button
                  onClick={handleSavePassword}
                  disabled={savingPassword}
                  className="saas-btn-primary saas-btn-sm"
                >
                  {savingPassword ? (
                    <Loader2 className="animate-spin w-3 h-3 mr-1" />
                  ) : (
                    <Key className="w-3.5 h-3.5 mr-1" />
                  )}
                  Actualizar contraseña
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Personalización ─── */}
        <div className="px-4 pt-5 pb-2">
          <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Personalización</p>
        </div>

        <CategoryManager
          abierto={expanded === 'categories'}
          onToggle={() => toggleSection('categories')}
          saveData={saveData}
        />

        {/* Apariencia — Toggle (no accordion).
            El tile del icono NO sigue a isDark: seguirlo hacía que, en tema
            oscuro, esta fila y "Cambiar contraseña" compartieran el mismo
            ámbar — dos filas sin relación entre sí, indistinguibles por
            color, justo el único mecanismo que tiene la lista para
            reconocer una fila de un vistazo. El glifo sol/luna ya comunica
            el estado; el color del tile se queda neutro siempre. */}
        <div className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Apariencia</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {isDark ? 'Tema oscuro' : 'Tema claro'}
            </p>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
              isDark ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Activar tema oscuro"
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                isDark ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* ─── Copia de seguridad ─── */}
        <div className="px-4 pt-5 pb-2">
          <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Datos</p>
        </div>
        <BackupSettings saveData={saveData} />

        {/* ─── Cerrar sesión ─── */}
        <div className="px-4 pt-5 pb-2">
          <p className="text-2xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Sesión</p>
        </div>

        {/* Sign Out */}
        <button
          onClick={() => setShowSignOutConfirm(true)}
          className="w-full flex items-center gap-4 p-4 text-left hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors rounded-lg"
        >
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center text-red-600 dark:text-red-400 flex-shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Cerrar sesión</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Finaliza tu sesión actual</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Versión — leída de package.json vía Vite, no escrita a mano
          (el pie decía v2.0 mientras package.json ya iba por 2.1.0) */}
      <p className="text-center text-xs text-slate-600 dark:text-slate-400 lg:col-span-2">
        Foresight Finanzas v{__APP_VERSION__}
      </p>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="Cerrar sesión"
        message="¿Estás seguro? Los datos no sincronizados se guardarán localmente y se enviarán cuando vuelvas a iniciar sesión."
        confirmLabel="Cerrar sesión"
        onConfirm={() => { setShowSignOutConfirm(false); signOut(); }}
        onCancel={() => setShowSignOutConfirm(false)}
      />

    </div>
  );
}
