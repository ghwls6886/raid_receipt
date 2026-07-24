import { cn } from '@/lib/cn';
import { Logo } from '@/components/common/Logo';

interface LoadingStateProps {
  message?: string;
  fullscreen?: boolean;
  showLogo?: boolean;
  className?: string;
}

/**
 * 로딩 상태 컴포넌트 (순수 CSS 스피너)
 */
export function LoadingState({
  message = '로딩 중...',
  fullscreen = false,
  showLogo = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center gap-5',
        fullscreen && 'bg-bg-page h-screen',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-brand-100/30 dark:bg-brand-500/10 absolute top-1/2 left-1/2 h-64 w-64 -translate-x-3/4 -translate-y-3/4 rounded-full blur-3xl" />
      </div>

      {showLogo && (
        <div className="h-16 w-16 text-[64px]">
          <Logo />
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <svg aria-label="loading" className="h-10 w-10 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="var(--color-brand-600)" strokeWidth="3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-brand-600)" strokeLinecap="round" strokeWidth="3" />
        </svg>
        {message && <span className="text-text-secondary text-sm font-medium">{message}</span>}
      </div>
    </div>
  );
}
