import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/ui/Button';

/** 로그인 (목업) — 구글 로그인 대신 클릭 진입 → 온보딩 */
export function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboarded = useAuthStore((s) => s.onboarded);
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    if (isAuthenticated) navigate(onboarded ? '/dashboard' : '/onboarding', { replace: true });
  }, [isAuthenticated, onboarded, navigate]);

  const handleLogin = () => {
    login();
    navigate('/onboarding', { replace: true });
  };

  return (
    <div className="bg-bg-page flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 h-14 w-14 text-[56px]">
          <Logo />
        </div>
        <h1 className="text-text-primary text-2xl font-bold">메월드 길드 정산 매니저</h1>
        <p className="text-text-secondary mt-2 text-sm">
          보스 레이드 정산을 자동으로. 디스코드로 영수증까지.
        </p>

        <div className="border-border-subtle bg-bg-card shadow-card mt-8 rounded-xl border p-6">
          <Button className="w-full" onClick={handleLogin}>
            구글로 시작하기
          </Button>
        </div>
      </div>
    </div>
  );
}
