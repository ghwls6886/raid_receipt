import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Receipt, Swords, BarChart3, ArrowRight, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useForceLightTheme } from '@/hooks/useForceLightTheme';
import { Logo } from '@/components/common/Logo';

interface Feature {
  Icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { Icon: Zap, title: '자동 정산', desc: '순수익·인센티브·재료비·패널티까지 공식대로 자동 계산.' },
  { Icon: Receipt, title: '디스코드 영수증', desc: '확정 즉시 길드 채널로 영수증 이미지를 발송.' },
  { Icon: Swords, title: '공대 관리', desc: '공대를 저장해 두고 클릭 한 번에 명단 소환.' },
  { Icon: BarChart3, title: '참여도 통계', desc: '보스별 1인당 평균·개인 참여도를 한눈에.' },
];

const BG_GRADIENT = 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 45%, #fdba74 100%)';

/**
 * 정산 제품 랜딩 (공개) — 주황 그라데이션 + 가운데 글래스 카드.
 *
 * **광고 B 착지점** (MERGE_PLAN §5). 정산 광고를 보고 온 사람은 허브를 거치지 않고
 * 바로 여기 떨어진다. 중간에 "둘 중 뭐 보실래요?"를 끼우면 결정이 하나 늘고 전환이 샌다.
 */
export function SettlementLandingPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const onboarded = useAuthStore((s) => s.onboarded);

  const authLoading = useAuthStore((s) => s.loading);

  const ctaTo = session ? (onboarded ? '/dashboard' : '/onboarding') : '/login';
  const ctaLabel = session ? '대시보드로 이동' : '무료로 시작하기';

  // 로그인한 사람에게 마케팅 화면을 보여줄 이유가 없다. 바로 안으로 보낸다.
  // 구글 OAuth 콜백이 redirectTo(/login) 대신 Site URL(/) 로 떨어져도 여기서 받아낸다.
  // authLoading 중에는 세션 복원이 안 끝나 로그인 상태를 오판하므로 기다린다.
  useEffect(() => {
    if (authLoading || !session) return;
    navigate(onboarded ? '/dashboard' : '/onboarding', { replace: true });
  }, [authLoading, session, onboarded, navigate]);

  useForceLightTheme();

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: BG_GRADIENT }}
    >
      {/* 배경 글로우 */}
      <div
        className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #ffd8a8, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #fff7ed, transparent 70%)' }}
      />

      {/* 상단 바 */}
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 text-[32px]">
            <Logo />
          </div>
          <span className="text-brand-700 font-bold">메월드 정산 매니저</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="text-brand-700 rounded-lg bg-white/70 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors hover:bg-white"
        >
          로그인
        </button>
      </header>

      {/* 가운데 글래스 카드 */}
      <main className="relative flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-4xl">
          <div className="rounded-3xl border border-white/70 bg-white/85 px-8 py-12 shadow-2xl shadow-orange-900/20 backdrop-blur-md md:px-14 md:py-14">
            <div className="text-center">
              <h1 className="text-text-primary text-4xl leading-[1.15] font-extrabold tracking-tight md:text-5xl">
                보스 레이드 정산,
                <br />
                이제 <span className="text-brand-600">10초컷</span>.
              </h1>
              <p className="text-text-secondary mx-auto mt-5 max-w-xl text-base leading-relaxed font-medium md:text-lg">
                드랍템·용병비·재료비·패널티까지 자동으로 나누고, 디스코드로 영수증을 바로 보내는
                메월드 길드 정산 매니저.
              </p>
            </div>

            {/* 피처 카드 */}
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="border-border-subtle rounded-2xl border bg-white/70 p-5 transition-colors hover:bg-white"
                >
                  <span className="bg-brand-50 text-brand-600 inline-flex h-10 w-10 items-center justify-center rounded-xl">
                    <f.Icon size={20} strokeWidth={2.25} />
                  </span>
                  <h3 className="text-text-primary mt-3 text-sm font-bold">{f.title}</h3>
                  <p className="text-text-secondary mt-1 text-[13px] leading-relaxed font-medium">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => navigate(ctaTo)}
                className="bg-brand-500 hover:bg-brand-600 rounded-xl px-8 py-3.5 text-base font-bold text-white shadow-md transition-colors"
              >
                {ctaLabel}
              </button>
            </div>

            {/*
              교차 홍보 배너 — 반드시 CTA **아래**다 (MERGE_PLAN §5).
              위로 올리면 주 전환(정산 시작)을 갉아먹는다. 제일 약한 수단이지만 공짜다.
            */}
            <div className="border-border-subtle mt-8 border-t pt-6 text-center">
              <Link
                className="text-text-secondary hover:text-brand-600 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                to="/helper"
              >
                길드 없이 혼자 쓰는 도구를 찾으시나요? 메월드 헬퍼 보기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer
        className="relative space-y-1.5 py-6 text-center text-xs"
        style={{ color: '#9a3412' }}
      >
        <div className="space-x-3 font-semibold">
          <Link to="/terms" className="hover:underline">
            이용약관
          </Link>
          <Link to="/privacy" className="hover:underline">
            개인정보처리방침
          </Link>
        </div>
        <div>© 2026 메월드 길드 정산 매니저 · 서드파티 계산 도구 (메이플스토리 비공식)</div>
      </footer>
    </div>
  );
}
