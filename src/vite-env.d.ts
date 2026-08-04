/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Globales para comunicación entre módulos (ej: estado de sincronización)
interface Window {
  __setSyncStatus?: () => void;
}
