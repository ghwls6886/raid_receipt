import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { LandingPage } from '@/pages/LandingPage';
import { TermsPage, PrivacyPage } from '@/pages/LegalPages';
import { LoginPage } from '@/pages/LoginPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { RaidsPage } from '@/pages/RaidsPage';
import { RaidNewPage } from '@/pages/RaidNewPage';
import { PartiesPage } from '@/pages/PartiesPage';
import { CreditsPage } from '@/pages/CreditsPage';
import { MembersPage } from '@/pages/MembersPage';
import { GuildSettingsPage } from '@/pages/GuildSettingsPage';
import { AdminPage } from '@/pages/AdminPage';
import { ManualPage } from '@/pages/ManualPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { initTheme } from '@/stores/useThemeStore';

function App() {
  useEffect(() => {
    initTheme();
  }, []);

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
            <Route element={<CreditsPage />} path="credits" />
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
