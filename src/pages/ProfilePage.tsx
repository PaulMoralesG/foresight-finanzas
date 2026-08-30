// ================================================================
// ProfilePage — Configuración SaaS con edición de perfil
// ================================================================

import { useState } from 'react';
import { Pencil, Loader2, Check, Mail, ChevronUp, ChevronRight, Send, Lock, Key, Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { userInitials } from '@/lib/utils';
import { MIN_PASSWORD_LENGTH, STRENGTH_TRACK_CLASS, passwordStrength, validateNewPassword } from '@/lib/password';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryManager } from '@/components/features/categories/CategoryManager';

type Section = 'profile' | 'email' | 'password' | 'categories' | null;

export function ProfilePage() {
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
    const pwError = validateNewPassword(newPassword);
    if (pwError) {
      addToast(pwError, 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Las contraseñas no coinciden', 'error');
      return;
    }
    setSavingPassword(true);
    try {
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
       A partir de xl la tarjeta de perfil y los ajustes van lado a lado. */
    <div className="animate-fade-in max-w-2xl xl:max-w-5xl grid grid-cols-1 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-5 items-start">
      {/* ─── Profile Card ─── */}
      <div className="saas-card p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {fullName}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => toggleSection('profile')}
            type="button"
            aria-expanded={expanded === 'profile'}
            className={`saas-btn-sm ${expanded === 'profile' ? 'saas-btn-primary' : 'saas-btn-secondary'}`}
            aria-label="Editar perfil"
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Editar
          </button>
        </div>

        {/* Edit profile inline form */}
        {expanded === 'profile' && (
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-fade-in">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Cuenta</p>
        </div>

        {/* Change Email */}
        <div>
          <button
            onClick={() => toggleSection('email')}
            type="button"
            aria-expanded={expanded === 'email'}
            className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-500 flex-shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Cambiar correo electrónico</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Actualiza tu dirección de email</p>
            </div>
            {expanded === 'email' ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform" />}
          </button>

          {expanded === 'email' && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
              <p className="text-xs text-slate-500 dark:text-slate-400">
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

        {/* Change Password */}
        <div>
          <button
            onClick={() => toggleSection('password')}
            type="button"
            aria-expanded={expanded === 'password'}
            className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center text-amber-500 flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Cambiar contraseña</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Mantén tu cuenta protegida</p>
            </div>
            {expanded === 'password' ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform" />}
          </button>

          {expanded === 'password' && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Por seguridad, confirma tu contraseña actual antes de elegir una nueva
                de al menos {MIN_PASSWORD_LENGTH} caracteres.
              </p>
              <div>
                <label htmlFor="current-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Contraseña actual
                </label>
                <input
                  id="current-password"
                  name="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="saas-input"
                  placeholder="Tu contraseña de ahora"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePassword(); }}
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nueva contraseña
                </label>
                <input
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="saas-input"
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
                    <p className={`text-[11px] mt-1 font-medium ${pwStrength.textClass}`}>
                      {pwStrength.label}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Confirmar contraseña
                </label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="saas-input"
                  placeholder="Repite la contraseña"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePassword(); }}
                />
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
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Personalización</p>
        </div>

        <CategoryManager
          abierto={expanded === 'categories'}
          onToggle={() => toggleSection('categories')}
          saveData={saveData}
        />

        {/* Apariencia — Toggle (no accordion) */}
        <div className="flex items-center gap-4 p-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-amber-50 dark:bg-amber-950 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Apariencia</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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

        {/* ─── Cerrar sesión ─── */}
        <div className="px-4 pt-5 pb-2">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Sesión</p>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">Finaliza tu sesión actual</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      {/* Versión — leída de package.json vía Vite, no escrita a mano
          (el pie decía v2.0 mientras package.json ya iba por 2.1.0) */}
      <p className="text-center text-xs text-slate-500 dark:text-slate-400 xl:col-span-2">
        Foresight Finanzas v{__APP_VERSION__} · SaaS Edition
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
