import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** 에러 발생 시 보여줄 fallback UI */
  fallback?: ReactNode;
  /** 에러 발생 시 호출될 콜백 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** 에러 발생 시 자동 리포트 여부 */
  reportError?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 에러 바운더리 컴포넌트
 * 
 * 하위 컴포넌트에서 발생하는 JavaScript 에러를 캐치하고
 * fallback UI를 표시합니다.
 * 
 * @example
 * <ErrorBoundary fallback={<ErrorFallback />}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // 콜백 호출
    this.props.onError?.(error, errorInfo);
    
    // 에러 리포트 (프로덕션에서만)
    if (this.props.reportError && import.meta.env.PROD) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
      // TODO: 에러 리포팅 서비스 연동 (Sentry 등)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // 커스텀 fallback이 있으면 사용
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 기본 에러 UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">
              오류가 발생했습니다
            </h2>
            
            <p className="text-slate-500 dark:text-slate-400 text-[15px] mb-6">
              페이지를 불러오는 중 문제가 발생했습니다.
              <br />
              잠시 후 다시 시도해 주세요.
            </p>
            
            {/* 개발 환경에서만 에러 상세 표시 */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-left overflow-auto max-h-40">
                <p className="text-[13px] font-mono text-red-600 dark:text-red-400">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-4 py-2.5 bg-brand-blue text-white rounded-lg font-bold text-[14px] hover:bg-blue-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                다시 시도
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-[14px] hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <Home className="w-4 h-4" />
                홈으로
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 섹션별 에러 바운더리
 * 
 * 개별 섹션의 에러가 전체 페이지에 영향을 주지 않도록 합니다.
 */
interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** 섹션 이름 (에러 메시지에 표시) */
  sectionName?: string;
}

export const SectionErrorBoundary: React.FC<SectionErrorBoundaryProps> = ({
  children,
  sectionName = '섹션',
}) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-[14px] font-medium">
              {sectionName}을(를) 불러오는 중 오류가 발생했습니다.
            </span>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundary;
