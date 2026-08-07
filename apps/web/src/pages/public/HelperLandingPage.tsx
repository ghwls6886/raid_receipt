import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Timer, ListChecks, Sword, ArrowRight, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useForceLightTheme } from '@/hooks/useForceLightTheme';
import { Logo } from '@/components/common/Logo';

interface Feature {
  Icon: LucideIcon;
  title: string;
  desc: string;
}

/**
 * **지금 실제로 있는 기능만 적는다.** 없는 걸 적으면 들어와서 실망한다.
 *
 * TODO 4단계에서 파티 구인·매너온도·심콜이 붙었으니 카드를 추가할 것.
 * (helper 올인원 대시보드는 여전히 미이식이라 계속 뺀다)
 */
const FEATURES: Feature[] = [
  {
    Icon: Timer,
    title: '보스 타이머',
    desc: '캐릭터별 재입장 쿨타임을 자동 계산. 하루 여러 트 도는 보스도 몇 트째인지 세어 준다.',
  },
  {
    Icon: ListChecks,
    title: '숙제 체크리스트',
    desc: '일간·주간 숙제를 캐릭터마다 따로 체크. 매일·매주 알아서 초기화된다.',
  },
  {
    Icon: Sword,
    title: '캐릭터 관리',
    desc: '본캐 부캐를 한 곳에. 직업·레벨·서버·스공까지 기록해 두고 골라 쓴다.',
  },
];

const BG_GRADIENT = 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 45%, #fdba74 100%)';

/**
 * 헬퍼 제품 랜딩 (공개) — **광고 A 착지점** (MERGE_PLAN §5).
 *
 * 정산 랜딩과 같은 주황 패밀리를 쓴다. §9 대로 브랜드 패밀리는 이미 잡혀 있어
 * 색으로 가르지 않고 카피와 CTA 목적지로 가른다.
 *
 * 정산 랜딩과 결정적으로 다른 점: **길드가 필요 없다.** 그래서 CTA 가 온보딩을 거치지 않고
 * 바로 /characters 로 간다 (1단계에서 만든 길드 불필요 라우트 그룹).
 */
export function HelperLandingPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.loading);

  useForceLightTheme();

  // 로그인한 사람에게 마케팅 화면을 보여줄 이유가 없다. 캐릭터 화면이 이 제품의 입구다.
  // 길드 여부는 보지 않는다 — 헬퍼는 길드 없이 쓰는 제품이다.
  useEffect(() => {
    if (authLoading || !session) return;
    navigate('/characters', { replace: true });
  }, [authLoading, session, navigate]);

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: BG_GRADIENT }}
    >
      <div
        className="pointer-events-none absolute -top-28 -right-28 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #ffd8a8, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #fff7ed, transparent 70%)' }}
      />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 text-[32px]">
            <Logo />
          </div>
          <span className="text-brand-700 font-bold">메월드 헬퍼</span>
        </div>
        <button
          className="text-brand-700 rounded-lg bg-white/70 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors hover:bg-white"
          onClick={() => navigate('/login')}
          type="button"
        >
          로그인
        </button>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-4xl">
          <div className="rounded-3xl border border-white/70 bg-white/85 px-8 py-12 shadow-2xl shadow-orange-900/20 backdrop-blur-md md:px-14 md:py-14">
            <div className="text-center">
              <h1 className="text-text-primary text-4xl leading-[1.15] font-extrabold tracking-tight md:text-5xl">
                보스 쿨타임, 숙제,
                <br />
                <span className="text-brand-600">부캐까지</span> 한 곳에.
              </h1>
              <p className="text-text-secondary mx-auto mt-5 max-w-xl text-base leading-relaxed font-medium md:text-lg">
                길드 없이 혼자 써도 됩니다. 캐릭터를 등록하면 보스 재입장 시각과 일간·주간 숙제를
                캐릭터별로 챙겨 주는 메월드 헬퍼.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

            <div className="mt-10 flex flex-col items-center gap-2">
              <button
                className="bg-brand-500 hover:bg-brand-600 rounded-xl px-8 py-3.5 text-base font-bold text-white shadow-md transition-colors"
                onClick={() => navigate('/login')}
                type="button"
              >
                무료로 시작하기
              </button>
              <span className="text-text-tertiary text-xs font-medium">
                구글 계정으로 로그인 · 길드 없이 바로 사용
              </span>
            </div>

            {/* 교차 홍보 — CTA 아래 (MERGE_PLAN §5) */}
            <div className="border-border-subtle mt-8 border-t pt-6 text-center">
              <Link
                className="text-text-secondary hover:text-brand-600 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                to="/settlement"
              >
                길드 레이드 정산도 하시나요? 메월드 정산 매니저 보기
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
          <Link className="hover:underline" to="/terms">
            이용약관
          </Link>
          <Link className="hover:underline" to="/privacy">
            개인정보처리방침
          </Link>
        </div>
        <div>© 2026 메월드 헬퍼 · 서드파티 유틸리티 (메이플스토리 비공식)</div>
      </footer>
    </div>
  );
}
