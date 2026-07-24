/**
 * 테마 스토어
 *
 * 애플리케이션의 테마(라이트/다크)를 관리합니다.
 * LocalStorage에 자동 저장되어 새로고침 후에도 설정이 유지됩니다.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/** 테마를 DOM에 적용 (dark 클래스 토글 + colorScheme) */
const applyThemeToDOM = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = theme === 'dark';
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = theme;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        applyThemeToDOM(theme);
        set({ theme });
      },
      toggleTheme: () => {
        set((state) => {
          const newTheme: Theme = state.theme === 'light' ? 'dark' : 'light';
          applyThemeToDOM(newTheme);
          return { theme: newTheme };
        });
      },
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeToDOM(state.theme);
      },
    },
  ),
);

/** 앱 시작 시 저장된 테마를 즉시 적용 (하이드레이션 전 깜빡임 방지) */
export const initTheme = (): void => {
  if (typeof window === 'undefined') return;
  applyThemeToDOM(useThemeStore.getState().theme);
};
