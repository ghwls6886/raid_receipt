/**
 * 에러 바운더리 컴포넌트
 *
 * React 렌더링 중 발생하는 예외를 캐치하여 앱 크래시를 방지한다.
 * 에러 발생 시 복구 옵션(다시 시도, 새로고침)을 제공한다.
 *
 * - 비동기 에러(Promise rejection)는 캐치 못함 -> axios 인터셉터에서 처리
 * - 이벤트 핸들러 내부 에러도 캐치 못함 -> try-catch로 직접 처리
 */
import { Component, Fragment, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** 에러 리셋 시 호출되는 콜백 (React Query 캐시 무효화 등에 활용) */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetKey: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 관측 도구 연동 지점 (Sentry 등). 기본은 콘솔 출력.
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.setState((prev) => ({ hasError: false, error: null, resetKey: prev.resetKey + 1 }));
    this.props.onReset?.();
  };

  handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="bg-bg-page flex min-h-screen flex-col items-center justify-center p-4">
          <div className="bg-bg-card shadow-card animate-scale-in w-full max-w-2xl rounded-xl p-8 text-center">
            <div className="text-error-500 mb-6 flex justify-center">
              <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                />
              </svg>
            </div>

            <h2 className="text-text-primary mb-2 text-xl font-semibold">오류가 발생했습니다</h2>
            <p className="text-text-secondary mb-6 leading-relaxed">
              예상치 못한 오류가 발생했습니다.
              <br />
              다시 시도하거나 페이지를 새로고침해 주세요.
            </p>

            {this.state.error && (
              <details className="group mb-6 text-left">
                <summary className="text-text-muted hover:text-text-secondary cursor-pointer text-sm">
                  오류 상세 정보
                </summary>
                <div className="border-border-subtle mt-3 overflow-hidden rounded-lg border">
                  <pre className="bg-bg-muted/30 text-error-600 overflow-auto p-4 text-xs leading-relaxed">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </div>
              </details>
            )}

            <div className="flex justify-center gap-3">
              <button
                className="border-border-default text-text-secondary hover:bg-bg-hover rounded-md border px-4 py-2 text-sm font-medium"
                onClick={this.handleReset}
                type="button"
              >
                다시 시도
              </button>
              <button
                className="bg-brand-600 hover:bg-brand-700 rounded-md px-4 py-2 text-sm font-medium text-white"
                onClick={this.handleReload}
                type="button"
              >
                새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}
