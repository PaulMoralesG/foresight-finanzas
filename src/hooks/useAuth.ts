// ================================================================
// useAuth - Hook de autenticación con Supabase (modo offline soportado)
// El sync (pull-then-push con merge) vive en src/lib/sync.ts.
//
// El archivo expone DOS hooks y la separación importa:
//
//   · useAuthSession() — el efecto de arranque de sesión. Se monta UNA vez.
//   · useAuth()        — estado y acciones. Sin efectos, seguro en cualquier sitio.
//
// Antes era un solo hook con el efecto dentro, invocado desde nueve
// componentes. Cada montaje volvía a arrancar la sesión entera: en modo
// offline la rama de arranque llama a financeStore.reset(), así que abrir la
// pestaña Movimientos borraba el presupuesto recién guardado; con Supabase
// configurado no borraba nada, pero disparaba un ciclo completo de import
// legacy + pull + merge + push forzado por cada montaje —abrir el modal de una
// transacción resincronizaba todo el historial—.
// ================================================================

import { useEffect, useCallback, useRef } from 'react';
import { supabase, supabaseAvailable } from '@/config/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore } from '@/stores/financeStore';
import { syncService, isSchemaError, isTransientSchemaError } from '@/lib/sync';
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

/** Montajes simultáneos de useAuthSession. Debe ser siempre 0 o 1. */
let sesionesMontadas = 0;

/**
 * Arranca y mantiene la sesión: restaura la existente, carga el perfil y
 * adjunta el servicio de sincronización.
 *
 * **Se monta exactamente una vez, en `App`.** No lo llames desde una página ni
 * desde un modal: cada montaje reinicia el ciclo completo (ver cabecera).
 * Para leer el usuario o ejecutar acciones, usa `useAuth()`.
 */
export function useAuthSession(): void {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const financeStore = useFinanceStore;

  // Aviso en desarrollo si alguien vuelve a montar el efecto en otro sitio.
  // Se cuentan montajes SIMULTÁNEOS: StrictMode hace monta→limpia→monta, así
  // que el contador nunca pasa de 1 por un doble render legítimo.
  const avisoRef = useRef(false);
  useEffect(() => {
    sesionesMontadas += 1;
    if (sesionesMontadas > 1 && import.meta.env.DEV && !avisoRef.current) {
      avisoRef.current = true;
      console.error(
        '[useAuthSession] Montado más de una vez. El efecto de sesión debe vivir solo en App; ' +
          'para leer el usuario o ejecutar acciones usá useAuth().',
      );
    }
    return () => {
      sesionesMontadas -= 1;
    };
  }, []);

  useEffect(() => {
    // === MODO OFFLINE: Sin Supabase configurado ===
    //
    // Aquí NO se llama a reset(). El reset existe para que, al no haber sesión,
    // la siguiente cuenta que entre en este navegador no vea datos de la
    // anterior. En modo offline no hay cuentas: siempre es el mismo
    // OFFLINE_USER, así que lo único que borraba era el trabajo del usuario.
    //
    // Y lo borraba entero: el efecto corre en cada arranque, de modo que un
    // gasto registrado desaparecía en la siguiente recarga. La app parecía
    // funcionar hasta que cerrabas la pestaña — justo lo contrario de lo que
    // promete el README ("funciona offline con almacenamiento local").
    if (!supabaseAvailable || !supabase) {
      setUser(OFFLINE_USER);
      return;
    }

    let cancelled = false;

    async function loadProfile(uid: string, email: string, metaFirst?: string, metaLast?: string) {
      try {
        // 1) Perfil por uid (PK nueva). Si no existe, inicializarlo con metadata.
        type ProfileRow = { email?: string | null; first_name?: string | null; last_name?: string | null };
        let profile: ProfileRow | null = null;
        const { data, error } = await supabase!
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', uid)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          profile = data as ProfileRow;
        }

        // Self-heal del email: si el cambio de correo se confirmó desde otro
        // dispositivo (o el evento USER_UPDATED no llegó a esta sesión),
        // sincronizar el email actual de la sesión en profiles.
        if (profile && profile.email !== email) {
          const { error: emailSyncError } = await supabase!
            .from('profiles')
            .update({ email })
            .eq('id', uid);
          if (!emailSyncError) {
            profile = { ...profile, email };
          }
        }

        if (!profile) {
          const { data: created, error: createError } = await supabase!
            .from('profiles')
            .upsert({ id: uid, email, first_name: metaFirst || '', last_name: metaLast || '' }, { onConflict: 'id' })
            .select('email, first_name, last_name')
            .maybeSingle();
          if (!createError && created) {
            profile = created as ProfileRow;
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

        if (isTransientSchemaError(err)) {
          // Caché de esquema de PostgREST desactualizada (redeploy/DDL reciente).
          // Es pasajero: NO desactivar el sync ni desloguear al usuario — antes
          // isSchemaError() trataba esto igual que un esquema sin migrar y
          // dejaba la cuenta en modo local-only permanente por un solo golpe.
          console.warn('[useAuth] Caché de esquema desactualizada (transitorio) al cargar perfil — reintentará solo.');
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
        // ALT-1: sin sesión → limpiar todo. Simétrico con la rama equivalente
        // de onAuthStateChange (línea ~165) — antes esta rama solo hacía
        // setLoading(false) y dejaba datos rehidratados de localStorage de
        // una cuenta anterior en el store hasta que algo más lo pisara.
        syncService.detach();
        financeStore.getState().reset();
        setUser(null);
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
        // Si ya hay una sesión cargada para ESTE mismo usuario, no rehacer el
        // ciclo completo (perfil + import legacy + pull/merge/push). Antes,
        // cada TOKEN_REFRESHED (una vez por hora) y cada reautenticación
        // —como la de updatePassword— disparaba una sincronización entera del
        // historial sin que nada hubiera cambiado.
        const loaded = useAuthStore.getState().user;
        if (loaded && loaded.id === session.user.id) {
          setLoading(false);
          return;
        }
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
}

/**
 * Estado de sesión y acciones de cuenta. **No tiene efectos**: llamarlo desde
 * cualquier número de componentes es gratis. Quien arranca la sesión es
 * `useAuthSession()`, montado una sola vez en `App`.
 */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const clearUser = useAuthStore((s) => s.logout);
  const financeStore = useFinanceStore;

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
    // Borra también la copia persistida en localStorage — reset() solo
    // limpia el estado en memoria; sin esto, el historial financiero
    // completo de la cuenta queda en el navegador en texto plano bajo la
    // misma clave que usaría la siguiente cuenta que inicie sesión ahí.
    financeStore.persist.clearStorage();
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
    // (bug: era `lastName`, no `last_name` — el trigger SQL y loadProfile()
    // leen `raw_user_meta_data->>'last_name'`, así que el apellido en la
    // metadata de Auth quedaba desincronizado para siempre)
    const { error: authError } = await supabase.auth.updateUser({
      data: { first_name: firstName, last_name: lastName },
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

  /**
   * Cambiar contraseña — exige la contraseña ACTUAL (reautenticación).
   *
   * Sin esta verificación, cualquiera con acceso momentáneo a una sesión
   * abierta (un teléfono desbloqueado, una laptop prestada) podía fijar una
   * contraseña nueva y quedarse con la cuenta de forma permanente, dejando
   * fuera al dueño real. `signInWithPassword` contra el email de la sesión
   * es el patrón de reautenticación estándar de Supabase: falla si la
   * contraseña actual no coincide y no altera la sesión si coincide.
   */
  async function updatePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!supabase) return { success: false, message: 'No disponible en modo offline' };

    const currentUser = useAuthStore.getState().user;
    if (!currentUser?.email) return { success: false, message: 'No hay sesión activa' };

    if (!currentPassword) {
      return { success: false, message: 'Ingresa tu contraseña actual' };
    }
    if (currentPassword === newPassword) {
      return { success: false, message: 'La contraseña nueva debe ser distinta de la actual' };
    }

    // 1) Reautenticar: verificar que quien pide el cambio conoce la contraseña actual
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    if (reauthError) {
      return { success: false, message: 'La contraseña actual no es correcta' };
    }

    // 2) Recién ahora, aplicar el cambio
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
