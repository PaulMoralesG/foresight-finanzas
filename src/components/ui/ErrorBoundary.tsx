// ================================================================
// ERROR BOUNDARY — Captura errores de renderizado y evita crashes
// ================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportarError } from '@/lib/error-reporter';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Error capturado:', error, info.componentStack);

    // getDerivedStateFromError ya "atrapó" el error para React, así que
    // nunca llega al listener global de window.error — sin este envío
    // explícito, cualquier crash de render (incluida una recuperación de
    // chunk fallida) sería invisible en error_log, y solo quedaría el
    // console.error de arriba, que nadie ve fuera de la sesión de quien lo
    // sufrió. reportarError solo actúa en producción.
    reportarError(error, {
      tag: 'render',
      componentStack: info.componentStack ?? undefined,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-8 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Algo salió mal
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
              Ocurrió un error inesperado. No te preocupes, tus datos están a salvo.
            </p>
            <details className="text-left mb-6">
              <summary className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                Detalles técnicos
              </summary>
              <pre className="mt-2 text-xs text-expense-600 dark:text-expense-400 bg-expense-50 dark:bg-expense-950/20 p-3 rounded-lg overflow-auto max-h-32">
                {this.state.error?.message}
              </pre>
            </details>
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
