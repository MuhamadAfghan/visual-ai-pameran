import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base p-6">
        <div className="text-center max-w-sm">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-red-500/10">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-content mb-2">
            Terjadi Kesalahan
          </h2>
          <p className="text-sm text-content-secondary mb-1">
            Halaman ini mengalami error yang tidak terduga.
          </p>
          <p className="text-xs text-content-muted mb-6 font-mono bg-surface-elevated px-3 py-2 rounded-lg break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" />
            Muat Ulang Halaman
          </button>
        </div>
      </div>
    );
  }
}
