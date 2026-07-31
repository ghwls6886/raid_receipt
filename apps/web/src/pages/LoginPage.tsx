import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/stores/useToastStore';

export function LoginPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const onboarded = useAuthStore((s) => s.onboarded);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const loginWithEmail = useAuthStore((s) => s.loginWithEmail);
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate(onboarded ? '/dashboard' : '/onboarding', { replace: true });
    }
  }, [session, loading, onboarded, navigate]);

  const handleGoogle = async () => {
    try {
      await loginWithGoogle();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '구글 로그인에 실패했습니다.');
    }
  };

  const handleEmail = async (signup: boolean) => {
    if (!email || !password) {
      toast.warning('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      if (signup) {
        await signUpWithEmail(email, password);
        toast.success('가입 완료! 메일 확인 후 로그인하세요. (로컬: http://127.0.0.1:54324)');
      } else {
        await loginWithEmail(email, password);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

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

        <div className="border-border-subtle bg-bg-card shadow-card mt-8 space-y-4 rounded-xl border p-6">
          <Button className="w-full" onClick={() => void handleGoogle()}>
            구글로 시작하기
          </Button>

          {/* 로컬 개발용 이메일/비밀번호 */}
          {import.meta.env.DEV && (
            <>
              <div className="border-border-subtle flex items-center gap-3 border-t pt-4">
                <span className="text-text-tertiary text-xs">로컬 개발용</span>
              </div>
              <Input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="비밀번호 (6자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleEmail(false);
                }}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleEmail(false)}
                >
                  로그인
                </Button>
                <Button
                  className="flex-1"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void handleEmail(true)}
                >
                  회원가입
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
