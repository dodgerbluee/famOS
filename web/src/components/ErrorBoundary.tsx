import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('widget error', error, info);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="h-full flex items-center justify-center p-3">
          <p className="text-accent-red text-sm">This card failed to load</p>
        </div>
      );
    }
    return this.props.children;
  }
}
