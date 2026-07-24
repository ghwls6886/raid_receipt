import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';

interface RequireAuthProps {
  children: ReactNode;
  /** true 면 길드 선택(온보딩)까지 끝나야 통과 */
  requireOnboarded?: boolean;
}

/** 라우트 가드 — 미로그인 시 /login, 온보딩 미완료 시 /onboarding 으로 */
export function RequireAuth({ children, requireOnboarded }: RequireAuthProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboarded = useAuthStore((s) => s.onboarded);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireOnboarded && !onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
