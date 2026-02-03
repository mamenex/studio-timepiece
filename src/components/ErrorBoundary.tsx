import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ErrorBoundaryProps = {
  fallbackTitle?: string;
  onReset?: () => void;
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: "" });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="rounded-xl border border-border/60 bg-card/80 p-6 shadow-sm backdrop-blur">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {this.props.fallbackTitle ?? "Something went wrong"}
        </div>
        <div className="mt-2 text-base font-semibold text-foreground">
          The running order view failed to load.
        </div>
        <div className="mt-3 text-sm text-muted-foreground">{this.state.errorMessage}</div>
        {this.props.onReset && (
          <div className="mt-4">
            <Button variant="outline" onClick={this.handleReset}>
              Back to clock
            </Button>
          </div>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
