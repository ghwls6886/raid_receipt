import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  ScrollText,
  Swords,
  Sword,
  ListChecks,
  Timer,
  Users,
  Star,
  Settings,
  Moon,
  Sun,
  ChevronsUpDown,
  Check,
  LogOut,
  Wrench,
  BookOpen,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/common/Logo';
import { useThemeStore } from '@/stores/useThemeStore';
import { useGuildStore, useCurrentGuild } from '@/stores/useGuildStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  end: boolean;
}

/** 길드가 있어야 의미가 있는 화면들 */
const SETTLEMENT_NAV: readonly NavItem[] = [
  { to: '/dashboard', label: '대시보드', Icon: LayoutDashboard, end: true },
  { to: '/raids', label: '레이드', Icon: ScrollText, end: false },
  { to: '/parties', label: '공대 구성', Icon: Swords, end: false },
  { to: '/members', label: '공대원', Icon: Users, end: false },
  { to: '/settings', label: '길드 설정', Icon: Settings, end: false },
];

/**
 * 길드 없이 쓰는 화면들 — 개인 도구 (MERGE_PLAN §7 2단계).
 * 구인이 4단계에 여기 붙는다. 비면 내비 행 자체를 그리지 않는다.
 */
const HELPER_NAV: readonly NavItem[] = [
  { to: '/characters', label: '캐릭터', Icon: Sword, end: false },
  { to: '/checklist', label: '숙제', Icon: ListChecks, end: false },
  { to: '/boss-tracker', label: '보스 타이머', Icon: Timer, end: false },
  { to: '/recruit', label: '파티 구인', Icon: Users, end: false },
  { to: '/ratings', label: '평가', Icon: Star, end: false },
];

type ProductKey = 'settlement' | 'helper';

interface Product {
  key: ProductKey;
  label: string;
  Icon: LucideIcon;
  /** 이 제품의 첫 화면 */
  home: string;
  nav: readonly NavItem[];
  note: string;
}

const PRODUCTS: Product[] = [
  {
    key: 'settlement',
    label: '정산 매니저',
    Icon: Receipt,
    home: '/dashboard',
    nav: SETTLEMENT_NAV,
    note: '길드 레이드 정산',
  },
  {
    key: 'helper',
    label: '헬퍼',
    Icon: Sword,
    home: '/characters',
    nav: HELPER_NAV,
    note: '보스 타이머 · 숙제',
  },
];

/**
 * 지금 어느 제품에 있는가 — **경로로 판정한다.**
 *
 * 길드 유무로 고르면 안 된다. 길드가 있는 사람도 캐릭터·숙제·보스타이머를 쓰는데,
 * 그렇게 하면 길드원에게 헬퍼 내비가 영영 안 보인다(제품 스위처 이전의 버그).
 * 헬퍼 경로가 아니면 정산으로 보되, 길드가 없으면 헬퍼를 기본으로 둔다
 * — 404 같은 공용 화면에서 정산 탭을 띄워봐야 온보딩으로 튕길 뿐이다.
 */
function currentProductKey(pathname: string, hasGuild: boolean): ProductKey {
  if (HELPER_NAV.some((item) => pathname.startsWith(item.to))) return 'helper';
  if (SETTLEMENT_NAV.some((item) => pathname.startsWith(item.to))) return 'settlement';
  return hasGuild ? 'settlement' : 'helper';
}

/**
 * 상단 탑바 — 사이드바 없는 SaaS 셸.
 * 브랜드 행(로고 + 길드 스위처 + 베타 배지/테마/계정) + 언더라인 탭 내비 행.
 */
export function TopNav() {
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  /**
   * 길드가 없는 사용자도 이 셸을 쓴다 (MERGE_PLAN 함정 7).
   * useCurrentGuild 는 길드가 없으면 빈 Guild 를 돌려주므로, 분기하지 않으면
   * 스위처가 이름 없는 빈 껍데기로 그려진다.
   */
  const hasGuild = useGuildStore((s) => s.guilds.length > 0);
  const productKey = currentProductKey(pathname, hasGuild);
  const product = PRODUCTS.find((p) => p.key === productKey)!;
  const navItems = product.nav;
  const isSettlement = productKey === 'settlement';

  return (
    <header className="border-border-subtle bg-bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
      {/* 브랜드 행 */}
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 text-[28px]">
              <Logo />
            </div>
            <span className="text-text-primary hidden text-base font-semibold sm:inline">
              메월드
            </span>
          </div>
          <div className="bg-border-subtle mx-1 h-5 w-px" />
          {/* 제품 스위처 — 이미 로그인 상태라 전환 장벽이 0 이다 (MERGE_PLAN §6) */}
          <ProductSwitcher current={product} hasGuild={hasGuild} />
          {/* 길드 스위처는 정산에서만. 헬퍼는 길드와 무관한 제품이다 */}
          {isSettlement &&
            (hasGuild ? (
              <>
                <div className="bg-border-subtle mx-1 h-5 w-px" />
                <GuildSwitcher />
              </>
            ) : (
              <CreateGuildButton />
            ))}
        </div>

        <div className="flex items-center gap-1.5">
          <BetaPill />
          {/* 매뉴얼은 정산 사용법 문서다. 길드가 없으면 눌러도 온보딩으로 튕긴다. */}
          {isSettlement && hasGuild && (
            <button
              aria-label="매뉴얼"
              className="text-text-secondary hover:bg-bg-hover rounded-md p-2"
              onClick={() => navigate('/manual')}
              type="button"
            >
              <BookOpen className="h-5 w-5" />
            </button>
          )}
          <button
            aria-label="테마 전환"
            className="text-text-secondary hover:bg-bg-hover rounded-md p-2"
            onClick={toggleTheme}
            type="button"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <UserMenu />
        </div>
      </div>

      {/* 내비 행 (언더라인 탭) — 갈 곳이 없으면 빈 막대를 남기지 않는다 */}
      {navItems.length > 0 && (
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 sm:px-4">
          {navItems.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-brand-600 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary border-transparent',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

/**
 * 제품 스위처 — 정산 ↔ 헬퍼 (MERGE_PLAN §6).
 *
 * 교차 홍보 수단 중 배너보다 강한 쪽이다. 이미 로그인한 상태라 전환 장벽이 0 이고,
 * 같은 SPA 안이라 페이지 이동조차 없다(경로 방식을 고른 이유 중 하나 — §9).
 *
 * 정산으로 갈 때 길드가 없으면 온보딩부터 거친다. 대시보드로 바로 보내면
 * RequireAuth 가 어차피 튕겨서 사용자는 이유를 모른 채 온보딩에 떨어진다.
 */
function ProductSwitcher({ current, hasGuild }: { current: Product; hasGuild: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const targetOf = (p: Product) => (p.key === 'settlement' && !hasGuild ? '/onboarding' : p.home);

  return (
    <div className="relative">
      <button
        aria-label="제품 전환"
        className="hover:bg-bg-hover flex items-center gap-2 rounded-md px-2 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="bg-brand-50 text-brand-700 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
          <current.Icon className="h-4 w-4" />
        </span>
        <span className="text-text-primary hidden text-sm font-semibold sm:block">
          {current.label}
        </span>
        <ChevronsUpDown className="text-text-tertiary h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            aria-hidden
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <div className="border-border-subtle bg-bg-card absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border p-1 shadow-lg">
            <p className="text-text-muted px-2 py-1.5 text-xs font-medium">제품 전환</p>
            {PRODUCTS.map((p) => (
              <button
                key={p.key}
                className="hover:bg-bg-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                onClick={() => {
                  setOpen(false);
                  navigate(targetOf(p));
                }}
                type="button"
              >
                <span className="bg-brand-50 text-brand-700 flex h-6 w-6 items-center justify-center rounded-md">
                  <p.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block truncate text-sm font-medium">
                    {p.label}
                  </span>
                  <span className="text-text-tertiary block truncate text-xs">{p.note}</span>
                </span>
                {p.key === current.key && <Check className="text-brand-600 h-4 w-4" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 정산 제품인데 길드가 아직 없을 때 길드 스위처 자리를 대신한다 */
function CreateGuildButton() {
  const navigate = useNavigate();
  return (
    <button
      className="text-text-secondary hover:bg-bg-hover hover:text-text-primary flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium"
      onClick={() => navigate('/onboarding')}
      type="button"
    >
      <Plus className="h-4 w-4" />
      길드 만들기
    </button>
  );
}

/** 길드 전환 드롭다운 */
function GuildSwitcher() {
  const [open, setOpen] = useState(false);
  const guilds = useGuildStore((s) => s.guilds);
  const setCurrentGuild = useGuildStore((s) => s.setCurrentGuild);
  const current = useCurrentGuild();

  return (
    <div className="relative">
      <button
        className="hover:bg-bg-hover flex items-center gap-2 rounded-md px-2 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="bg-brand-50 text-brand-700 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold">
          {current.guildName.slice(0, 1)}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="text-text-primary block text-sm font-semibold">{current.guildName}</span>
          <span className="text-text-tertiary block text-xs">{current.serverName}</span>
        </span>
        <ChevronsUpDown className="text-text-tertiary h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            aria-hidden
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <div className="border-border-subtle bg-bg-card absolute left-0 top-full z-20 mt-1 w-60 rounded-lg border p-1 shadow-lg">
            <p className="text-text-muted px-2 py-1.5 text-xs font-medium">길드 전환</p>
            {guilds.map((g) => (
              <button
                key={g.id}
                className="hover:bg-bg-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                onClick={() => {
                  setCurrentGuild(g.id);
                  setOpen(false);
                }}
                type="button"
              >
                <span className="bg-brand-50 text-brand-700 flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold">
                  {g.guildName.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-text-primary block truncate text-sm font-medium">
                    {g.guildName}
                  </span>
                  <span className="text-text-tertiary block truncate text-xs">{g.serverName}</span>
                </span>
                {g.id === current.id && <Check className="text-brand-600 h-4 w-4" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 무료 베타 pill — 표시 전용 배지 */
function BetaPill() {
  return (
    <span className="border-border-subtle text-brand-600 mr-1 rounded-full border px-3 py-1.5 text-xs font-semibold">
      무료 베타
    </span>
  );
}

/** 계정 메뉴 (목업) */
function UserMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  return (
    <div className="relative">
      <button
        aria-label="계정 메뉴"
        className="from-brand-500 to-accent-violet flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        길
      </button>
      {open && (
        <>
          <button
            aria-hidden
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <div className="border-border-subtle bg-bg-card absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border p-1 shadow-lg">
            <div className="px-3 py-2">
              <p className="text-text-primary text-sm font-semibold">길드마스터</p>
              <p className="text-text-tertiary text-xs">master@example.com</p>
            </div>
            <div className="bg-border-subtle my-1 h-px" />
            <button
              className="text-text-secondary hover:bg-bg-hover flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm"
              onClick={() => {
                setOpen(false);
                navigate('/admin');
              }}
              type="button"
            >
              <Wrench className="h-4 w-4" /> 시스템 관리자
            </button>
            <button
              className="text-text-secondary hover:bg-bg-hover flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm"
              onClick={() => {
                setOpen(false);
                logout();
                navigate('/login');
              }}
              type="button"
            >
              <LogOut className="h-4 w-4" /> 로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  );
}
