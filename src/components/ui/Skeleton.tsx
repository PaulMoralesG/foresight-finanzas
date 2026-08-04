// ================================================================
// Skeleton — Placeholder animado para carga de contenido
// Uso: <Skeleton className="h-4 w-48" /> o <Skeleton variant="card" />
// ================================================================

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'circle' | 'button';
}

export function Skeleton({ className = '', variant = 'text' }: SkeletonProps) {
  const base = 'animate-pulse bg-slate-200 dark:bg-slate-800 rounded';

  if (variant === 'card') {
    return (
      <div className={`${base} p-4 space-y-3 ${className}`}>
        <div className="h-3 bg-slate-300 dark:bg-slate-700 rounded w-1/3" />
        <div className="h-5 bg-slate-300 dark:bg-slate-700 rounded w-1/2" />
        <div className="h-2 bg-slate-300 dark:bg-slate-700 rounded w-2/3" />
      </div>
    );
  }

  if (variant === 'circle') {
    return <div className={`${base} rounded-full ${className || 'w-10 h-10'}`} />;
  }

  if (variant === 'button') {
    return <div className={`${base} rounded-lg ${className || 'h-9 w-24'}`} />;
  }

  // text / default
  return <div className={`${base} ${className || 'h-4 w-full'}`} />;
}

/** Full-page loading skeleton for lazy-loaded routes */
export function PageSkeleton() {
  return (
    <div className="space-y-3 p-4 animate-fade-in">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
      <Skeleton variant="card" className="h-40" />
      <Skeleton variant="card" className="h-32" />
    </div>
  );
}

/** Lightweight inline skeleton for LoadingSpinner replacement */
export function AppLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 animate-pulse" />
        <div className="space-y-2 text-center">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24 mx-auto" />
        </div>
      </div>
    </div>
  );
}
