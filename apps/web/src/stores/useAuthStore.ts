/**
 * 인증 스토어 — Supabase Auth 세션 기반.
 *
 * initialize() 를 앱 마운트 시 한 번 호출하면:
 *   1) 기존 세션 복원 (localStorage → access token → user)
 *   2) onAuthStateChange 구독 (로그인/로그아웃/토큰 갱신 자동 처리)
 *   3) guild_accounts 조회 → onboarded 판정
 */
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** 세션 복원이 비동기라 첫 렌더에서 로그인 페이지로 튕기는 걸 방지 */
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

async function checkOnboarded(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('guild_accounts')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export const useAuthStore = create<AuthState>()((set, _get) => ({
  session: null,
  user: null,
  loading: true,
  onboarded: false,

  initialize: () => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const ob = await checkOnboarded(session.user.id);
        set({ session, user: session.user, loading: false, onboarded: ob });
      } else {
        set({ loading: false });
      }
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const ob = await checkOnboarded(session.user.id);
        set({ session, user: session.user, onboarded: ob, loading: false });
      } else {
        set({ session: null, user: null, onboarded: false, loading: false });
      }
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
    set({ session: null, user: null, onboarded: false });
  },
}));

/** 하위 호환 — 기존 컴포넌트가 s.isAuthenticated 로 읽는 것 대응 */
export { isAuthenticated };
