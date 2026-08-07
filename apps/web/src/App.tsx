import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
// 공개 화면 — 로그인 없이 접근
import { LandingPage } from '@/pages/public/LandingPage';
import { TermsPage, PrivacyPage } from '@/pages/public/LegalPages';
import { NotFoundPage } from '@/pages/public/NotFoundPage';
// 인증 · 온보딩
import { LoginPage } from '@/pages/auth/LoginPage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
// 메인 기능 — 로그인 + 길드 선택 완료 후
import { DashboardPage } from '@/features/settlement/pages/DashboardPage';
import { RaidsPage } from '@/features/settlement/pages/RaidsPage';
import { RaidNewPage } from '@/features/settlement/pages/RaidNewPage';
import { PartiesPage } from '@/features/settlement/pages/PartiesPage';
import { MembersPage } from '@/features/settlement/pages/MembersPage';
import { GuildSettingsPage } from '@/features/settlement/pages/GuildSettingsPage';
import { AdminPage } from '@/features/settlement/pages/AdminPage';
import { ManualPage } from '@/features/settlement/pages/ManualPage';
import { initTheme } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';

function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initTheme();
    initialize();
  }, [initialize]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<LandingPage />} path="/" />
          <Route element={<TermsPage />} path="/terms" />
          <Route element={<PrivacyPage />} path="/privacy" />
          <Route element={<LoginPage />} path="/login" />
          <Route
            element={
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            }
            path="/onboarding"
          />
          <Route
            element={
              <RequireAuth requireOnboarded>
                <Layout />
              </RequireAuth>
            }
          >
            <Route element={<DashboardPage />} path="dashboard" />
            <Route element={<RaidsPage />} path="raids" />
            <Route element={<RaidNewPage />} path="raids/new" />
            <Route element={<RaidNewPage />} path="raids/:id/edit" />
            <Route element={<PartiesPage />} path="parties" />
            <Route element={<MembersPage />} path="members" />
            <Route element={<GuildSettingsPage />} path="settings" />
            <Route element={<AdminPage />} path="admin" />
            <Route element={<ManualPage />} path="manual" />
            <Route element={<NotFoundPage />} path="*" />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
