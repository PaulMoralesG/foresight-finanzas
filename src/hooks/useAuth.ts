// ================================================================
// useAuth - Hook de autenticación con Supabase (modo offline soportado)
// El sync (pull-then-push con merge) vive en src/lib/sync.ts.
// ================================================================

import { useEffect, useCallback } from 'react';
import { supabase, supabaseAvailable } from '@/config/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore } from '@/stores/financeStore';
import { syncService, isSchemaError } from '@/lib/sync';
import type { User } from '@/types';

/** Usuario offline por defecto cuando no hay Supabase configurado */
const OFFLINE_USER: User = {
  id: 'offline-user',
  email: 'offline@local',
  firstName: 'Usuario',
  lastName: 'Local',
};

function basicUser(id: string, email: string, firstName?: string, lastName?: string): User {
  return { id, email, firstName: firstName || '', lastName: lastName || '' };
}

export function useAuth() {
  const { user, isLoading, setUser, setLoading, logout: clearUser } = useAuthStore();
  const financeStore = useFinanceStore;

  // Listeners de ciclo de vida + suscripción al store (una sola vez, guard de módulo)
  syncService.init();

  useEffect(() => {
    // === MODO OFFLINE: Sin Supabase configurado ===
    if (!supabaseAvailable || !supabase) {
      financeStore.getState().reset();
      setUser(OFFLINE_USER);
      return;
    }

    let cancelled = false;

    async function loadProfile(uid: string, email: string, metaFirst?: string, metaLast?: string) {
      try {
        // 1) Perfil por uid (PK nueva). Fallback: adoptar fila legacy por email
        //    o crear una nueva si no existe.
        let profile: { first_name?: string | null; last_name?: string | null } | null;
        const { data, error } = await supabase!
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();
        if (error) throw error;
        profile = data as typeof profile;

        if (!profile) {
          const { data: legacy, error: legacyError } = await supabase!
            .from('profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();
          if (legacyError) throw legacyError;

          if (legacy) {
            const { data: adopted, error: adoptError } = await supabase!
              .from('profiles')
              .update({ id: uid })
              .eq('email', email)
              .select('*')
              .single();
            if (adoptError) throw adoptError;
            profile = adopted as typeof profile;
          } else {
            const { data: created, error: createError } = await supabase!
              .from('profiles')
              .insert({ id: uid, email })
              .select('*')
              .single();
            if (createError) throw createError;
            profile = created as typeof profile;
          }
        }

        if (cancelled) return;

        // 2) Sync: import legacy (si aplica) → pull → merge → push
        await syncService.attach(uid);

        if (cancelled) return;

        // 3) Sesión lista
        setUser({
          id: uid,
          email,
          // Prioridad: perfil DB → metadata Auth → vacío
          firstName: profile?.first_name || metaFirst || '',
          lastName: profile?.last_name || metaLast || '',
        });
        setLoading(false);
      } catch (err) {
        // ALT-1: nunca dejar datos de otra cuenta en el store
        console.error('[useAuth] Error al cargar perfil:', err);
        syncService.detach();
        financeStore.getState().reset();

        if (isSchemaError(err)) {
          // SQL de migración no ejecutado: operar en modo local-only
          console.warn(
            '[useAuth] Esquema de Supabase no migrado — ejecutá supabase/migrations/0001_entities_and_rls.sql en el SQL Editor. Modo local-only.',
          );
          syncService.disable();
          setUser(basicUser(uid, email, metaFirst, metaLast));
          setLoading(false);
          return;
        }

        setUser(null);
        setLoading(false);
      }
    }

    // Intentar restaurar sesión al montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        const meta = session.user.user_metadata as Record<string, string> | undefined;
        loadProfile(session.user.id, session.user.email!, meta?.first_name, meta?.last_name);
      } else {
        setLoading(false);
      }
    });

    // Escuchar cambios de sesión en tiempo real
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Email change: el token de verificación ya fue procesado, actualizar profile
      if (event === 'USER_UPDATED' && session?.user) {
        const newEmail = session.user.email;
        const currentUser = useAuthStore.getState().user;
        if (newEmail && currentUser && newEmail !== currentUser.email) {
          try {
            await supabase!
              .from('profiles')
              .update({ email: newEmail })
              .eq('id', currentUser.id);
          } catch (err) {
            console.warn('[useAuth] No se pudo actualizar el email en profiles:', err);
          }
          setUser({ ...currentUser, email: newEmail });
        }
        return;
      }

      if (session?.user) {
        const meta = session.user.user_metadata as Record<string, string> | undefined;
        loadProfile(session.user.id, session.user.email!, meta?.first_name, meta?.last_name);
      } else {
        // ALT-1: sin sesión → limpiar todo (evita contaminación entre cuentas)
        syncService.detach();
        financeStore.getState().reset();
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  // Solo montar/desmontar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(email: string, password: string) {
    if (!supabase) throw new Error('Supabase no disponible (modo offline)');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string, firstName: string, lastName: string) {
    if (!supabase) throw new Error('Supabase no disponible (modo offline)');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Siempre redirigir al deploy de producción para que el enlace funcione
        // sin importar desde dónde se registró el usuario (localhost, PWA, etc.)
        emailRedirectTo: 'https://foresight-finanzas.vercel.app',
        data: { first_name: firstName, last_name: lastName },
      },
    });

    if (error) throw error;

    // Si hay sesión inmediata (sin verificación de email), crear/actualizar perfil.
    // Defensivo: el trigger de la migración suele crearlo; si el SQL aún no corrió,
    // el error se ignora (loadProfile lo resuelve al loguear).
    if (data?.session && data.user) {
      try {
        await supabase.from('profiles').upsert(
          { id: data.user.id, email, first_name: firstName, last_name: lastName },
          { onConflict: 'id' },
        );
      } catch (err) {
        console.warn('[useAuth] Perfil no creado en signUp (probablemente el trigger lo maneja):', err);
      }
    }

    return data;
  }

  async function signOut() {
    if (supabase) {
      // ALT-3: flush del último cambio ANTES de invalidar el token
      await syncService.flush();
      await supabase.auth.signOut();
    }
    // Limpiar todo: auth + finanzas (evita cross-contamination entre cuentas)
    syncService.detach();
    clearUser();
    financeStore.getState().reset();
  }

  /** Guardar datos financieros (no-op en modo offline). Debounced dentro del sync service. */
  const saveData = useCallback(() => syncService.schedule(), []);

  /** Actualizar nombre y apellido en Supabase + metadata */
  async function updateProfile(firstName: string, lastName: string): Promise<boolean> {
    if (!user) return false;
    if (!supabase) {
      // Modo offline: actualizar solo el store local
      useAuthStore.getState().setUser({ ...user, firstName, lastName });
      return true;
    }

    // Actualizar metadata de auth
    const { error: authError } = await supabase.auth.updateUser({
      data: { first_name: firstName, lastName: lastName },
    });
    if (authError) throw authError;

    // Actualizar tabla profiles (por uid — PK nueva)
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', user.id);
    if (dbError) throw dbError;

    // Actualizar store local
    useAuthStore.getState().setUser({
      ...user,
      firstName,
      lastName,
    });

    return true;
  }

  /** Cambiar correo electrónico — envía verificación al nuevo email */
  async function updateEmail(newEmail: string): Promise<{ success: boolean; message: string }> {
    if (!user) return { success: false, message: 'No hay sesión activa' };
    if (!supabase) return { success: false, message: 'No disponible en modo offline' };

    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/profile` }
    );
    if (error) {
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: 'Revisa tu nuevo correo para confirmar el cambio. El cambio se aplicará cuando verifiques ambos emails.',
    };
  }

  /** Cambiar contraseña */
  async function updatePassword(newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!supabase) return { success: false, message: 'No disponible en modo offline' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Contraseña actualizada correctamente' };
  }

  /** Enviar enlace de recuperación de contraseña */
  async function resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    if (!supabase) return { success: false, message: 'No disponible en modo offline' };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Revisa tu correo para restablecer la contraseña 📧' };
  }

  return { user, isLoading, signIn, signUp, signOut, saveData, updateProfile, updateEmail, updatePassword, resetPassword };
}
