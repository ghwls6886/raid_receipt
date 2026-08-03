import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useGuildStore } from '@/stores/useGuildStore';

interface RequireAuthProps {
  children: ReactNode;
  /** true 면 길드 선택(온보딩)까지 끝나야 통과 */
  requireOnboarded?: boolean;
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="border-brand-400 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
    </div>
  );
}

/** 라우트 가드 — 세션 복원 중 로딩, 미로그인 시 /login, 온보딩 미완료 시 /onboarding */
export function RequireAuth({ children, requireOnboarded }: RequireAuthProps) {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const onboarded = useAuthStore((s) => s.onboarded);
  const guildsLoaded = useGuildStore((s) => s.loaded);
  const currentGuildId = useGuildStore((s) => s.currentGuildId);

  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;

  if (requireOnboarded) {
    // 길드 목록이 확정되기 전에는 자식을 렌더하지 않는다.
    // 여기서 통과시키면 화면들이 빈 guildId 로 조회해 PostgREST 400 이 난다.
    if (!guildsLoaded) return <Spinner />;
    if (!onboarded || !currentGuildId) return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
