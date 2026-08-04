// ================================================================
// useAuth - Hook de autenticación con Supabase (modo offline soportado)
// ================================================================

import { useEffect, useCallback } from 'react';
import { supabase, supabaseAvailable, supabaseUrl } from '@/config/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore } from '@/stores/financeStore';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import type { User, Transaction, MonthlyBudget, PaymentReminder, Category } from '@/types';

interface SupabaseProfileRow {
  email: string;
  first_name: string;
  last_name: string;
  budgets: MonthlyBudget | string;
  expenses: Transaction[] | string;
  reminders: PaymentReminder[] | string;
  savings_goal: { concept: string; target: number }[] | string;
  custom_expense_categories: Category[] | string;
  custom_income_categories: Category[] | string;
  last_synced_at: string | null;
}

/** Usuario offline por defecto cuando no hay Supabase configurado */
const OFFLINE_USER: User = {
  id: 'offline-user',
  email: 'offline@local',
  firstName: 'Usuario',
  lastName: 'Local',
};

export function useAuth() {
  const { user, isLoading, setUser, setLoading, logout: clearUser } = useAuthStore();
  const financeStore = useFinanceStore;

  useEffect(() => {
    // === MODO OFFLINE: Sin Supabase configurado ===
    if (!supabaseAvailable || !supabase) {
      setUser(OFFLINE_USER);
      return;
    }

    let cancelled = false;

    async function loadProfile(email: string, id: string, metadataFirstName?: string, metadataLastName?: string) {
      const { data, error } = await supabase!
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Error loading profile:', error);
        setUser(basicUser(email, id));
        return;
      }

      let profile = data as SupabaseProfileRow | null;

      // Si el perfil no existe aún (ej: registro con confirmación de email,
      // donde el INSERT del signUp no se ejecutó porque data.session era null),
      // crearlo ahora con los nombres del metadata de Supabase Auth.
      if (!profile) {
        const firstName = metadataFirstName || '';
        const lastName = metadataLastName || '';

        const { data: createdProfile, error: insertError } = await supabase!
          .from('profiles')
          .insert([{
            email,
            first_name: firstName,
            last_name: lastName,
            budgets: {},
            expenses: [],
            reminders: [],
            savings_goal: [],
            custom_expense_categories: [],
            custom_income_categories: [],
            last_synced_at: null,
          }])
          .select('*')
          .single();

        if (insertError) {
          console.error('Error creating profile on first login:', insertError);
          setUser(basicUser(email, id, firstName, lastName));
          return;
        }

        profile = createdProfile as SupabaseProfileRow | null;
      }

      // Sincronizar datos de Supabase → store local.
      // Si el perfil ya fue sincronizado (last_synced_at existe), Supabase es la verdad ABSOLUTA.
      // Si no: es un perfil nuevo (primer login), iniciar con datos vacíos de Supabase.
      if (profile) {
        const hasSyncedBefore = !!profile.last_synced_at;
        const supabaseExpenses = parseJsonField<Transaction[]>(profile.expenses, []);
        const supabaseBudgets = parseJsonField<MonthlyBudget>(profile.budgets, {});
        const supabaseReminders = parseJsonField<PaymentReminder[]>(profile.reminders, []);
        const supabaseSavingsGoals = parseJsonField<{ concept: string; target: number }[]>(profile.savings_goal, []);
        const supabaseCustomExpenseCats = parseJsonField<Category[]>(profile.custom_expense_categories, []);
        const supabaseCustomIncomeCats = parseJsonField<Category[]>(profile.custom_income_categories, []);

        let mergedExpenses: Transaction[];
        let mergedBudgets: MonthlyBudget;
        let mergedReminders: PaymentReminder[];
        let mergedSavingsGoals: { concept: string; target: number }[];
        let mergedCustomExpenseCats: Category[];
        let mergedCustomIncomeCats: Category[];

        // MERGE: Supabase es la base, pero preservamos datos locales aún no sincronizados.
        // Esto evita que transacciones recién creadas se pierdan si el sync falló
        // o si el usuario recarga la página antes de que el debounce de 800ms dispare el guardado.
        // Si es un perfil nuevo (nunca sincronizado) → empezar con datos de Supabase vacíos
        // (NO usar localStorage, que podría tener datos de otro usuario).
        if (hasSyncedBefore) {
          // Obtener datos locales actuales (hidratados por Zustand persist desde localStorage)
          const localExpenses = financeStore.getState().expenses;
          const localReminders = financeStore.getState().reminders;
          const localSavingsGoals = financeStore.getState().savingsGoals;

          // IDs que ya existen en Supabase
          const supabaseExpenseIds = new Set(supabaseExpenses.map((e: Transaction) => e.id));
          const supabaseReminderIds = new Set(supabaseReminders.map((r: PaymentReminder) => r.id));

          // Preservar transacciones/recordatorios locales que NO están en Supabase (aún no sincronizados)
          const unsyncedLocalExpenses = localExpenses.filter((e: Transaction) => !supabaseExpenseIds.has(e.id));
          const unsyncedLocalReminders = localReminders.filter((r: PaymentReminder) => !supabaseReminderIds.has(r.id));

          mergedExpenses = [...supabaseExpenses, ...unsyncedLocalExpenses];
          mergedReminders = [...supabaseReminders, ...unsyncedLocalReminders];
          mergedBudgets = supabaseBudgets;
          mergedSavingsGoals = supabaseSavingsGoals.length > 0 ? supabaseSavingsGoals : localSavingsGoals;
          mergedCustomExpenseCats = supabaseCustomExpenseCats;
          mergedCustomIncomeCats = supabaseCustomIncomeCats;
        } else {
          mergedExpenses = [];
          mergedBudgets = {};
          mergedReminders = [];
          mergedSavingsGoals = [];
          mergedCustomExpenseCats = [];
          mergedCustomIncomeCats = [];
        }

        // Limpiar campos obsoletos de recordatorios (isRecurring, paidMonths) que
        // pudieron quedar en Supabase de versiones anteriores del código.
        // Esto rompe el ciclo: Supabase viejo → Zustand → saveData → Supabase.
        mergedReminders = mergedReminders.map((r: PaymentReminder) => {
          const cleaned = { ...r } as any;
          delete cleaned.isRecurring;
          delete cleaned.paidMonths;
          return cleaned as PaymentReminder;
        });

        // Dedup de IDs duplicados (conserva la primera ocurrencia)
        if (hasSyncedBefore && mergedExpenses.length > 0) {
          const seen = new Set<number>();
          mergedExpenses = mergedExpenses
            .filter((e: Transaction) => {
              if (seen.has(e.id)) return false;
              seen.add(e.id);
              return true;
            });
        }

        // Calcular nextId/nextReminderId a partir del máximo real, no resetear a 1
        const maxExpenseId = mergedExpenses.reduce((max: number, e: { id: number }) => Math.max(max, e.id), 0);
        const maxReminderId = mergedReminders.reduce((max: number, r: { id: number }) => Math.max(max, r.id), 0);

        financeStore.setState({
          budgets: mergedBudgets,
          expenses: mergedExpenses,
          reminders: mergedReminders,
          savingsGoals: mergedSavingsGoals,
          customExpenseCategories: mergedCustomExpenseCats,
          customIncomeCategories: mergedCustomIncomeCats,
          nextId: maxExpenseId + 1,
          nextReminderId: maxReminderId + 1,
        });
      }

      const userObj: User = {
        id,
        email,
        // Prioridad: perfil DB → metadata Auth → vacío
        firstName: profile?.first_name || metadataFirstName || '',
        lastName: profile?.last_name || metadataLastName || '',
      };

      setUser(userObj);
    }

    // Intentar restaurar sesión al montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        const meta = session.user.user_metadata as Record<string, string> | undefined;
        loadProfile(session.user.email!, session.user.id, meta?.first_name, meta?.last_name);
      } else {
        setLoading(false);
      }
    });

    // Escuchar cambios de sesión en tiempo real
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED y PASSWORD_RECOVERY no deben recargar datos de Supabase:
      // hacerlo sobrescribiría cambios locales aún no sincronizados.
      // Solo actúan sobre el estado de auth, no sobre los datos financieros.
      if (event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
        return;
      }

      // Email change: el token de verificación ya fue procesado, actualizar profile
      if (event === 'USER_UPDATED' && session?.user) {
        const newEmail = session.user.email;
        const currentUser = useAuthStore.getState().user;
        if (newEmail && currentUser && newEmail !== currentUser.email) {
          await supabase!
            .from('profiles')
            .update({ email: newEmail })
            .eq('email', currentUser.email);
          setUser({ ...currentUser, email: newEmail });
        }
        return;
      }

      if (session?.user) {
        const meta = session.user.user_metadata as Record<string, string> | undefined;
        loadProfile(session.user.email!, session.user.id, meta?.first_name, meta?.last_name);
      } else {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — solo montar/desmontar

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

    // Si hay sesión inmediata (sin verificación de email), crear perfil
    if (data?.session) {
      await supabase.from('profiles').insert([
        {
          email,
          first_name: firstName,
          last_name: lastName,
          budgets: {},
          expenses: [],
          reminders: [],
          savings_goal: [],
          custom_expense_categories: [],
          custom_income_categories: [],
          last_synced_at: null,
        },
      ]);
    }

    return data;
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    // Limpiar todo: auth + finanzas (evita cross-contamination entre cuentas)
    clearUser();
    financeStore.getState().reset();
  }

  /** Guardar datos financieros en Supabase (no-op en modo offline)
   *  Incluye 3 reintentos con backoff exponencial en caso de fallo de red.
   *  Si el perfil no existe aún en Supabase, lo crea automáticamente.
   *  Lanza Error con el mensaje de Supabase si falla definitivamente. */
  const saveDataImmediate = useCallback(async (): Promise<boolean> => {
    if (!user) throw new Error('No hay sesión activa');
    if (!supabase) return true; // modo offline: siempre "éxito"

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1000;

    const state = financeStore.getState();

    // savings_goal en Supabase es tipo NUMERIC (herencia de versión antigua).
    // El store lo migró a SavingsGoal[] pero la DB no. Convertir a número o null.
    const savingsGoalValue: number | null = (() => {
      const goals = state.savingsGoals;
      if (!Array.isArray(goals) || goals.length === 0) return null;
      // Si hay metas, tomar la suma (o el primer target si prefieres)
      return goals.reduce((sum, g) => sum + (g.target || 0), 0);
    })();

    const payload = {
      budgets: state.budgets,
      expenses: state.expenses,
      reminders: state.reminders,
      savings_goal: savingsGoalValue,
      custom_expense_categories: state.customExpenseCategories,
      custom_income_categories: state.customIncomeCategories,
      last_synced_at: new Date().toISOString(),
    };

    let lastError: unknown;

    // Notificar al header que estamos sincronizando
    if (typeof window !== 'undefined' && (window as any).__setSyncStatus) {
      (window as any).__setSyncStatus();
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Intentar UPDATE sin .select() primero (compatible con todas las versiones de Supabase)
        const { error: updateError } = await supabase
          .from('profiles')
          .update(payload)
          .eq('email', user.email);

        if (!updateError) {
          return true;
        }

        // Error de Supabase (ej: RLS, columna inválida, perfil no existe)
        console.error('[saveData] Error de Supabase:', JSON.stringify(updateError));
        const msg = updateError.message || 'Error desconocido';
        const code = updateError.code || 'unknown';

        // Si el perfil no existe (404 o similar), intentar crearlo
        if (code === 'PGRST116' || msg.includes('not found') || msg.includes('0 rows')) {
          console.warn('[saveData] Perfil no encontrado, creando...');
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              email: user.email,
              first_name: user.firstName,
              last_name: user.lastName,
              ...payload,
            });

          if (!insertError) {
            return true; // perfil creado con datos
          }

          console.error('[saveData] Error al crear perfil:', JSON.stringify(insertError));
          throw new Error(
            `Error al crear perfil en Supabase: ${insertError.message || 'desconocido'} (${insertError.code || 'unknown'})`
          );
        }

        // Errores de permisos o esquema: no reintentar
        if (code === '42501' || code === '42703' || code === '42P01') {
          throw new Error(`Supabase: ${msg} (${code})`);
        }

        lastError = updateError;
      } catch (err) {
        // Si ya es un Error lanzado por nosotros, propagarlo
        if (err instanceof Error && err.message.startsWith('Supabase:') || err instanceof Error && err.message.startsWith('Error al crear perfil')) {
          throw err;
        }
        lastError = err;
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.debug(`[saveData] Intento ${attempt + 1}/${MAX_RETRIES} fallido, reintentando en ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    const finalMsg = lastError instanceof Error
      ? lastError.message
      : (lastError && typeof lastError === 'object'
        ? JSON.stringify(lastError)
        : String(lastError));
    console.error('[saveData] Todos los reintentos fallaron. URL:', supabaseUrl, 'Error:', lastError);
    throw new Error(`Sin conexión con Supabase tras ${MAX_RETRIES + 1} intentos: ${finalMsg}`);
  }, [user]);

  /** Versión debounced de saveData — evita ráfagas de escritura */
  const saveData = useDebouncedCallback(saveDataImmediate, 800);

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
      data: { first_name: firstName, last_name: lastName },
    });
    if (authError) throw authError;

    // Actualizar tabla profiles
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName })
      .eq('email', user.email);
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

  return { user, isLoading, signIn, signUp, signOut, saveData, saveDataImmediate, updateProfile, updateEmail, updatePassword, resetPassword };
}

function basicUser(email: string, id: string, firstName?: string, lastName?: string): User {
  return { id, email, firstName: firstName || '', lastName: lastName || '' };
}

function parseJsonField<T>(field: unknown, fallback: T): T {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return fallback;
    }
  }
  return (field as T) ?? fallback;
}
