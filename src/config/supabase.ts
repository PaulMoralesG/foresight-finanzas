// ================================================================
// CONFIGURACIÓN DE SUPABASE - Cliente tipado y seguro
// ================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

const supabaseAvailable = !!(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = supabaseAvailable
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export { supabaseAvailable };
