/**
 * 인증 스토어 — Supabase Auth 세션 기반.
 *
 * initialize() 를 앱 마운트 시 한 번 호출하면:
 *   1) onAuthStateChange 구독 (구독 즉시 INITIAL_SESSION 발행 → 세션 복원)
 *   2) 세션이 있으면 길드 목록까지 로드
 *   3) 소속 길드 유무로 onboarded 판정
 *
 * 길드 로드를 인증 부트스트랩에 포함시킨 이유:
 *   useGuildStore 의 guilds 는 persist 대상이 아니라 새로고침마다 [] 로 시작한다.
 *   예전에는 OnboardingPage 만 loadGuilds() 를 호출했기 때문에,
 *   이미 온보딩을 마친 사용자가 재로그인하면 guilds 가 빈 채로 /dashboard 에 진입했고
 *   useCurrentGuild() 가 EMPTY_GUILD 를 돌려줘 모든 쿼리가 `guild_id=eq.` 로 나가 400 이 났다.
 */
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useGuildStore } from '@/stores/useGuildStore';
import { toast } from '@/stores/useToastStore';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** 세션 복원 + 길드 로드가 비동기라 첫 렌더에서 로그인 페이지로 튕기는 걸 방지 */
  loading: boolean;
  /** true = 최소 1개 길드에 소속 */
  onboarded: boolean;
  /** 앱 마운트 시 한 번 호출 */
  initialize: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  completeOnboarding: () => void;
  logout: () => Promise<void>;
}

/** 호환용 게터 */
const isAuthenticated = (s: AuthState) => s.session !== null;

/** StrictMode 이중 마운트로 구독이 두 번 걸리는 걸 방지 */
let subscribed = false;

/**
 * 세션 변화를 스토어에 반영한다.
 * 세션이 있으면 길드 목록을 먼저 확보한 뒤에야 loading 을 내려,
 * 화면이 빈 guildId 로 쿼리를 쏘는 창(window)을 없앤다.
 */
async function applySession(session: Session | null): Promise<void> {
  if (!session) {
    // 로그아웃 — 다음 계정으로 길드 선택이 새지 않도록 비운다
    useGuildStore.getState().reset();
    useAuthStore.setState({ session: null, user: null, onboarded: false, loading: false });
    return;
  }

  const prevUser = useAuthStore.getState().user;
  const isSameUser = prevUser?.id === session.user.id;

  // 계정이 바뀐 경우에만 초기화한다.
  // 최초 복원(prevUser === null)에는 건드리지 않아야 persist 된 currentGuildId 가 살아남는다.
  if (prevUser && !isSameUser) useGuildStore.getState().reset();

  // 토큰 갱신처럼 같은 사용자로 재진입한 경우 이미 받아둔 길드를 다시 조회하지 않는다
  if (isSameUser && useGuildStore.getState().loaded) {
    useAuthStore.setState({ session, user: session.user, loading: false });
    return;
  }

  try {
    await useGuildStore.getState().loadGuilds();
    useAuthStore.setState({
      session,
      user: session.user,
      onboarded: useGuildStore.getState().guilds.length > 0,
      loading: false,
    });
  } catch (e: unknown) {
    // 세션 자체는 유효하므로 로그인 상태는 유지하고, 온보딩 화면에서 재시도하게 둔다
    toast.error(e instanceof Error ? e.message : '길드 정보를 불러오지 못했습니다.');
    useAuthStore.setState({ session, user: session.user, onboarded: false, loading: false });
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  user: null,
  loading: true,
  onboarded: false,

  initialize: () => {
    if (subscribed) return;
    subscribed = true;

    supabase.auth.onAuthStateChange((_event, session) => {
      // 이 콜백은 Auth 내부 락을 쥔 채 실행된다.
      // 여기서 supabase 쿼리를 await 하면 교착이 생길 수 있어 다음 틱으로 미룬다.
      setTimeout(() => {
        void applySession(session);
      }, 0);
    });
  },

  loginWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) throw error;
  },

  loginWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUpWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  },

  completeOnboarding: () => set({ onboarded: true }),

  logout: async () => {
    await supabase.auth.signOut();
    useGuildStore.getState().reset();
    set({ session: null, user: null, onboarded: false });
  },
}));

/** 하위 호환 — 기존 컴포넌트가 s.isAuthenticated 로 읽는 것 대응 */
export { isAuthenticated };
