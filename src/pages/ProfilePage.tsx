// ================================================================
// ProfilePage — Configuración SaaS con edición de perfil
// ================================================================

import { useState } from 'react';
import { Pencil, Loader2, Check, Mail, ChevronUp, ChevronRight, Send, Lock, Key, Tags, Trash2, Plus, Sun, Moon, LogOut, Edit3, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useFinanceStore } from '@/stores/financeStore';
import { CATEGORY_COLORS } from '@/config/categories';
import { syncToCloud } from '@/lib/utils';

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
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // ── Categorías personalizadas ──
  const customExpenseCategories = useFinanceStore((s) => s.customExpenseCategories);
  const customIncomeCategories = useFinanceStore((s) => s.customIncomeCategories);
  const deleteCustomCategory = useFinanceStore((s) => s.deleteCustomCategory);
  const addCustomCategory = useFinanceStore((s) => s.addCustomCategory);
  const updateCustomCategory = useFinanceStore((s) => s.updateCustomCategory);
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📌');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);

  // ── Edición de categoría ──
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatLabel, setEditingCatLabel] = useState('');
  const [editingCatIcon, setEditingCatIcon] = useState('📌');

  const initials = user
    ? ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || user.email[0].toUpperCase()
    : '?';

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
      if (section === 'password') { setNewPassword(''); setConfirmPassword(''); }
      if (section === 'categories') { setNewCatLabel(''); setNewCatIcon('📌'); setNewCatColor(CATEGORY_COLORS[0]); setCatType('expense'); }
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
    } catch (e: any) {
      addToast(e?.message || 'Error al actualizar perfil', 'error');
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
    } catch (e: any) {
      addToast(e?.message || 'Error al cambiar correo', 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 6) {
      addToast('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Las contraseñas no coinciden', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const result = await updatePassword(newPassword);
      if (result.success) {
        addToast(result.message, 'success');
        setExpanded(null);
      } else {
        addToast(result.message, 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Error al cambiar contraseña', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Categorías ──
  const activeCustomCats = catType === 'expense' ? customExpenseCategories : customIncomeCategories;

  function handleAddCategory() {
    const label = newCatLabel.trim();
    if (!label) {
      addToast('Ingresa un nombre para la categoría', 'error');
      return;
    }
    if (activeCustomCats.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      addToast('Ya existe una categoría con ese nombre', 'error');
      return;
    }
    const id = 'custom_' + label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    addCustomCategory(catType, { id, label, icon: newCatIcon, color: newCatColor });
    setNewCatLabel('');
    addToast('Categoría creada ✅', 'success');
    // Sincronizar con Supabase para que la categoría persista al recargar
    syncToCloud(saveData, addToast);
  }

  function startEditing(cat: typeof activeCustomCats[number]) {
    setEditingCatId(cat.id);
    setEditingCatLabel(cat.label);
    setEditingCatIcon(cat.icon);
  }

  function cancelEditing() {
    setEditingCatId(null);
    setEditingCatLabel('');
    setEditingCatIcon('📌');
  }

  function handleUpdateCategory() {
    const label = editingCatLabel.trim();
    if (!label || !editingCatId) return;
    if (activeCustomCats.some((c) => c.id !== editingCatId && c.label.toLowerCase() === label.toLowerCase())) {
      addToast('Ya existe una categoría con ese nombre', 'error');
      return;
    }
    updateCustomCategory(catType, editingCatId, { label, icon: editingCatIcon });
    addToast('Categoría actualizada ✅', 'success');
    syncToCloud(saveData, addToast);
    cancelEditing();
  }

  function handleDeleteCategory(id: string) {
    deleteCustomCategory(catType, id);
    addToast('Categoría eliminada 🗑️', 'success');
    syncToCloud(saveData, addToast);
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl">
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
            className={`saas-btn-sm ${expanded === 'profile' ? 'saas-btn-primary' : 'saas-btn-secondary'}`}
            aria-label="Editar perfil"
          >
            <Pencil className="text-xs mr-1.5" />
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
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="saas-input"
                  placeholder="Tu nombre"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProfile(); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Apellido
                </label>
                <input
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
                  <Check className="text-xs mr-1" />
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
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Cuenta</p>
        </div>

        {/* Change Email */}
        <div>
          <button
            onClick={() => toggleSection('email')}
            className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-500 flex-shrink-0">
              <Mail />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Cambiar correo electrónico</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Actualiza tu dirección de email</p>
            </div>
            {expanded === 'email' ? <ChevronUp className="text-xs text-slate-400 transition-transform" /> : <ChevronRight className="text-xs text-slate-400 transition-transform" />}
          </button>

          {expanded === 'email' && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Te enviaremos un enlace de verificación a tu nuevo correo. El cambio se aplica al confirmar ambos emails.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nuevo correo electrónico
                </label>
                <input
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
                    <Send className="text-xs mr-1" />
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
            className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center text-amber-500 flex-shrink-0">
              <Lock />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Cambiar contraseña</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Mantén tu cuenta protegida</p>
            </div>
            {expanded === 'password' ? <ChevronUp className="text-xs text-slate-400 transition-transform" /> : <ChevronRight className="text-xs text-slate-400 transition-transform" />}
          </button>

          {expanded === 'password' && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Elige una contraseña segura de al menos 6 caracteres.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="saas-input"
                  placeholder="Mínimo 6 caracteres"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePassword(); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
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
                    <Key className="text-xs mr-1" />
                  )}
                  Actualizar contraseña
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Personalización ─── */}
        <div className="px-4 pt-5 pb-2">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Personalización</p>
        </div>

        {/* ─── Categorías ─── */}
        <div>
          <button
            onClick={() => toggleSection('categories')}
            className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center text-purple-500 flex-shrink-0">
              <Tags />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Categorías personalizadas</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {customExpenseCategories.length + customIncomeCategories.length} categorías creadas
              </p>
            </div>
            {expanded === 'categories' ? <ChevronUp className="text-xs text-slate-400 transition-transform" /> : <ChevronRight className="text-xs text-slate-400 transition-transform" />}
          </button>

          {expanded === 'categories' && (
            <div className="px-4 pb-4 space-y-3 animate-fade-in">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Crea, visualiza y elimina tus categorías personalizadas. Las categorías por defecto no se pueden modificar.
              </p>

              {/* Selector de tipo */}
              <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {(['expense', 'income'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCatType(t)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      catType === t
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {t === 'expense' ? '💸 Gastos' : '💰 Ingresos'}
                  </button>
                ))}
              </div>

              {/* Lista de categorías personalizadas */}
              {activeCustomCats.length > 0 ? (
                <div className="space-y-1">
                  {activeCustomCats.map((cat) => (
                    <div key={cat.id}>
                      {editingCatId === cat.id ? (
                        /* ── Inline edit form ── */
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-brand-300 dark:border-brand-700">
                          <div className="flex gap-0.5 flex-wrap">
                            {['📌', '🛒', '🍴', '💊', '📚', '🎉', '💼', '🏠', '🚗', '💻', '💰', '🎁', '🔧', '🐾', '✈️', '📱', '⛪'].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => setEditingCatIcon(emoji)}
                                className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-all ${
                                  editingCatIcon === emoji
                                    ? 'ring-2 ring-brand-500 bg-white dark:bg-slate-700'
                                    : 'hover:bg-white dark:hover:bg-slate-700'
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={editingCatLabel}
                            onChange={(e) => setEditingCatLabel(e.target.value)}
                            className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCategory(); }}
                            autoFocus
                          />
                          <button
                            onClick={handleUpdateCategory}
                            className="text-emerald-500 hover:text-emerald-600 p-1 flex-shrink-0"
                            title="Guardar"
                          >
                            <Check className="text-xs" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0"
                            title="Cancelar"
                          >
                            <X className="text-xs" />
                          </button>
                        </div>
                      ) : (
                        /* ── Normal view ── */
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-lg">{cat.icon}</span>
                          <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                            {cat.label}
                          </span>
                          <button
                            onClick={() => startEditing(cat)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                            title="Editar categoría"
                          >
                            <Edit3 className="text-xs" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="text-red-400 hover:text-red-600 transition-colors p-1"
                            title="Eliminar categoría"
                          >
                            <Trash2 className="text-xs" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                  No tienes categorías personalizadas de {catType === 'expense' ? 'gasto' : 'ingreso'}.
                </p>
              )}

              {/* Form para añadir nueva */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Nueva categoría
                </p>
                <input
                  type="text"
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  className="saas-input-sm text-xs"
                  placeholder="Nombre de la categoría"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                />
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ícono:</span>
                  <div className="flex gap-1 flex-wrap">
                    {['📌', '🛒', '🍴', '💊', '📚', '🎉', '💼', '🏠', '🚗', '💻', '💰', '🎁', '🔧', '🐾', '✈️', '📱', '⛪'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewCatIcon(emoji)}
                        className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-all ${
                          newCatIcon === emoji
                            ? 'ring-2 ring-brand-500 bg-white dark:bg-slate-700'
                            : 'hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Color:</span>
                  {CATEGORY_COLORS.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${c.split(' ')[0]} ${
                        newCatColor === c ? 'ring-2 ring-brand-500 scale-110 border-white dark:border-slate-900' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
                <button onClick={handleAddCategory} className="saas-btn-primary saas-btn-sm w-full">
                  <Plus className="text-xs mr-1" />
                  Añadir categoría
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Apariencia — Toggle (no accordion) */}
        <div className="flex items-center gap-4 p-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-amber-50 dark:bg-amber-950 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
            {isDark ? <Sun /> : <Moon />}
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
            role="switch"
            aria-checked={isDark}
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
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Sesión</p>
        </div>

        {/* Sign Out */}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-4 p-4 text-left hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors rounded-lg"
        >
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center text-red-500 flex-shrink-0">
            <LogOut />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Cerrar sesión</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Finaliza tu sesión actual</p>
          </div>
          <ChevronRight className="text-xs text-slate-400" />
        </button>
      </div>

      {/* Version */}
      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Foresight Finanzas v2.0 · SaaS Edition
      </p>
    </div>
  );
}
