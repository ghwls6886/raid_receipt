import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';

interface RequireAuthProps {
  children: ReactNode;
  /** true 면 길드 선택(온보딩)까지 끝나야 통과 */
  requireOnboarded?: boolean;
}

/** 라우트 가드 — 세션 복원 중 로딩, 미로그인 시 /login, 온보딩 미완료 시 /onboarding */
export function RequireAuth({ children, requireOnboarded }: RequireAuthProps) {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const onboarded = useAuthStore((s) => s.onboarded);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="border-brand-400 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (requireOnboarded && !onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
