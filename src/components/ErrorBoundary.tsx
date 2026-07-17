import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

/** Catches render crashes and shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("App crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-risk/15 text-risk">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">Что-то пошло не так</h1>
            <p className="text-sm text-muted-foreground">
              Приложение упало, но данные в безопасности — они хранятся локально. Перезагрузите
              страницу, чтобы продолжить.
            </p>
            <pre className="max-w-full overflow-x-auto rounded-md bg-secondary p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => this.setState({ error: null })}>
                Попробовать снова
              </Button>
              <Button onClick={() => location.reload()}>Перезагрузить</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
