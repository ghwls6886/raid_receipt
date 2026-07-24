/**
 * 인증 스토어 (목업) — 명세서 §4·§12
 *
 * 실제 구글 OAuth 대신 목업 진입. isAuthenticated(로그인) + onboarded(길드 선택 완료)
 * 두 플래그로 진입 흐름을 제어한다. localStorage 에 저장돼 새로고침 후에도 유지.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isAuthenticated: boolean;
  onboarded: boolean;
  login: () => void;
  completeOnboarding: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      onboarded: false,
      login: () => set({ isAuthenticated: true }),
      completeOnboarding: () => set({ onboarded: true }),
      logout: () => set({ isAuthenticated: false, onboarded: false }),
    }),
    { name: 'auth-storage' },
  ),
);
