import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public override state: AppErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Aerocel Forge recovered from an interface error", error, info);
  }

  public override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <main className="app-error-screen" role="alert">
        <section className="app-error-card">
          <span className="app-error-card__icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </span>
          <div>
            <small>AEROCEL FORGE RECOVERY</small>
            <h1>The screen hit a problem</h1>
            <p>
              Your last saved project is still available. Reload the app to return to it safely.
            </p>
          </div>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={16} /> Reload Aerocel Forge
          </button>
          <details>
            <summary>Technical details</summary>
            <code>{this.state.error.message}</code>
          </details>
        </section>
      </main>
    );
  }
}
