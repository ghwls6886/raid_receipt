import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/**
 * 글로벌 로딩 스피너
 *
 * React Query의 활성 query/mutation이 있으면 화면 중앙에 스피너를 표시한다.
 */
export function GlobalLoadingOverlay() {
  const isFetching = useIsFetching({
    predicate: (query) => !(query.meta?.skipGlobalSpinner && query.state.data !== undefined),
  });
  const isMutating = useIsMutating();
  const isLoading = isFetching + isMutating > 0;

  if (!isLoading) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[9999] flex items-center justify-center">
      <svg aria-label="loading" className="h-12 w-12 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="var(--color-brand-600)" strokeWidth="3" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-brand-600)" strokeLinecap="round" strokeWidth="3" />
      </svg>
    </div>
  );
}
