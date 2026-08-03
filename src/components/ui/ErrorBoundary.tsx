// ================================================================
// ERROR BOUNDARY — Captura errores de renderizado y evita crashes
// ================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';

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
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Algo salió mal
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
              Ocurrió un error inesperado. No te preocupes, tus datos están a salvo.
            </p>
            <details className="text-left mb-6">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                Detalles técnicos
              </summary>
              <pre className="mt-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg overflow-auto max-h-32">
                {this.state.error?.message}
              </pre>
            </details>
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
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
