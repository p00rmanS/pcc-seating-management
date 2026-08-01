import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Wraps the whole app so an unexpected render error shows a recoverable fallback
// screen instead of a blank white page — the exact failure mode this app has hit
// twice in production (v18.9 area-shortcut crash, and stuck view state). React only
// supports catching render errors via a class component's componentDidCatch /
// getDerivedStateFromError — there is no hook equivalent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("App crashed and was caught by ErrorBoundary:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="text-amber-600" size={24} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The app hit an unexpected error and stopped to avoid showing broken data.
            Your seating data is safe — it's saved to the cloud and to this device.
            Reloading will bring you back to your latest layout.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <RotateCcw size={16} /> Reload App
          </button>
          {this.state.error?.message && (
            <p className="mt-4 text-xs text-slate-400 break-words">{this.state.error.message}</p>
          )}
        </div>
      </div>
    );
  }
}
