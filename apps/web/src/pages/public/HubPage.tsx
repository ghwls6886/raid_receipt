import { Link } from 'react-router-dom';
import { Receipt, Sword, ArrowRight, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useForceLightTheme } from '@/hooks/useForceLightTheme';
import { Logo } from '@/components/common/Logo';

const BG_GRADIENT = 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 45%, #fdba74 100%)';

interface ProductCard {
  Icon: LucideIcon;
  name: string;
  tagline: string;
  points: string[];
  /** 비로그인 시 가는 곳 — 제품 랜딩 */
  landingTo: string;
  /** 로그인 시 가는 곳 — 제품 안 */
  appTo: string;
  note: string;
}

const PRODUCTS: ProductCard[] = [
  {
    Icon: Receipt,
    name: '정산 매니저',
    tagline: '길드 레이드 정산을 10초에',
    points: ['드랍템·경비·패널티 자동 계산', '디스코드로 영수증 발송', '공대 구성과 참여도 통계'],
    landingTo: '/settlement',
    appTo: '/dashboard',
    note: '길드가 필요합니다',
  },
  {
    Icon: Sword,
    name: '헬퍼',
    tagline: '보스 쿨타임과 숙제를 캐릭터별로',
    points: ['보스 재입장 타이머', '일간·주간 숙제 체크', '본캐 부캐 관리'],
    landingTo: '/helper',
    appTo: '/characters',
    note: '길드 없이 혼자 써도 됩니다',
  },
];

/**
 * 허브 (공개) — 제품 두 개를 가르는 이정표.
 *
 * ⚠️ **퍼널 위가 아니라 옆이다** (MERGE_PLAN §5). 광고를 보고 온 사람은 여기 오지 않고
 * 바로 /settlement · /helper 로 떨어진다. 여기는 검색·북마크·주소 직접 입력으로 들어온
 * 사람만 받는 자리라, 설득하지 않고 갈라 주기만 한다.
 *
 * 그래서 제품 랜딩과 톤이 다르다 — 히어로 카피를 길게 쓰지 않고 두 카드를 나란히 놓는다.
 *
 * 로그인해도 **강제로 이동시키지 않는다.** 제품 랜딩은 로그인하면 안으로 보내지만,
 * 허브에 온 사람은 어느 제품을 쓸지가 아직 안 정해진 상태다. CTA 문구와 목적지만 바꾼다.
 */
export function HubPage() {
  const session = useAuthStore((s) => s.session);
  const onboarded = useAuthStore((s) => s.onboarded);

  useForceLightTheme();

  const targetOf = (p: ProductCard) => {
    if (!session) return p.landingTo;
    // 정산은 길드가 없으면 온보딩부터. 헬퍼는 길드와 무관하다.
    if (p.appTo === '/dashboard' && !onboarded) return '/onboarding';
    return p.appTo;
  };

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
          <span className="text-brand-700 font-bold">메월드</span>
        </div>
        {!session && (
          <Link
            className="text-brand-700 rounded-lg bg-white/70 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors hover:bg-white"
            to="/login"
          >
            로그인
          </Link>
        )}
      </header>

      <main className="relative flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-4xl">
          <div className="text-center">
            <h1 className="text-text-primary text-3xl leading-tight font-extrabold tracking-tight md:text-4xl">
              메이플랜드 길드·개인 도구
            </h1>
            <p className="text-text-secondary mt-3 text-base font-medium">
              계정 하나로 둘 다 씁니다. 나중에 언제든 오갈 수 있어요.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
            {PRODUCTS.map((p) => (
              <Link
                key={p.name}
                className="group flex flex-col rounded-3xl border border-white/70 bg-white/85 p-7 shadow-xl shadow-orange-900/10 backdrop-blur-md transition-transform hover:-translate-y-1 hover:bg-white"
                to={targetOf(p)}
              >
                <span className="bg-brand-50 text-brand-600 inline-flex h-12 w-12 items-center justify-center rounded-2xl">
                  <p.Icon size={24} strokeWidth={2.25} />
                </span>

                <h2 className="text-text-primary mt-4 text-xl font-bold">{p.name}</h2>
                <p className="text-text-secondary mt-1 text-sm font-medium">{p.tagline}</p>

                <ul className="mt-5 flex-1 space-y-2">
                  {p.points.map((point) => (
                    <li
                      key={point}
                      className="text-text-secondary flex items-start gap-2 text-[13px] font-medium"
                    >
                      <span className="bg-brand-400 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                      {point}
                    </li>
                  ))}
                </ul>

                <div className="border-border-subtle mt-6 flex items-center justify-between border-t pt-4">
                  <span className="text-text-tertiary text-xs font-medium">{p.note}</span>
                  <span className="text-brand-600 inline-flex items-center gap-1 text-sm font-bold">
                    {session ? '바로 가기' : '자세히 보기'}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
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
        <div>© 2026 메월드 · 서드파티 도구 (메이플스토리 비공식)</div>
      </footer>
    </div>
  );
}
