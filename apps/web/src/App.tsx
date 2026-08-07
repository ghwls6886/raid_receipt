import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
// 공개 화면 — 로그인 없이 접근
import { HubPage } from '@/pages/public/HubPage';
import { SettlementLandingPage } from '@/pages/public/SettlementLandingPage';
import { HelperLandingPage } from '@/pages/public/HelperLandingPage';
import { TermsPage, PrivacyPage } from '@/pages/public/LegalPages';
import { NotFoundPage } from '@/pages/public/NotFoundPage';
// 인증 · 온보딩
import { LoginPage } from '@/pages/auth/LoginPage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
// 개인 도구 — 길드 없이 쓴다 (MERGE_PLAN §7 2단계)
import { CharactersPage } from '@/features/helper/pages/CharactersPage';
import { ChecklistPage } from '@/features/helper/pages/ChecklistPage';
import { BossTrackerPage } from '@/features/helper/pages/BossTrackerPage';
import { BossHistoryPage } from '@/features/helper/pages/BossHistoryPage';
// 구인 — 헬퍼 제품의 기능 하나다 (MERGE_PLAN §7 4단계)
import { RecruitPage } from '@/features/recruit/pages/RecruitPage';
import { RecruitDetailPage } from '@/features/recruit/pages/RecruitDetailPage';
import { RatingsPage } from '@/features/recruit/pages/RatingsPage';
import { BuffTimerHost } from '@/features/recruit/buff/BuffTimerHost';
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
        {/*
          심콜 알림 재생기 — 렌더하는 것은 없다. 파티방 안에 두면 화면을
          옮기는 순간 소리가 끊기므로 라우트 바깥에 상주시킨다. 공용
          Layout 이 아니라 여기 두는 이유는, Layout 이 특정 feature 를
          알게 되면 공용 레이어가 오염되기 때문이다 (§4.1).
        */}
        <BuffTimerHost />
        <Routes>
          {/*
            랜딩 3분할 (MERGE_PLAN §5). 광고 클릭은 제품 랜딩으로 **직행**한다 —
            허브를 중간에 끼우면 결정이 하나 늘고 거기서 전환이 샌다.
            허브(/)는 퍼널 위가 아니라 옆에 있다: 검색·북마크로 직접 온 사람만 받는다.
          */}
          <Route element={<HubPage />} path="/" />
          <Route element={<SettlementLandingPage />} path="/settlement" />
          <Route element={<HelperLandingPage />} path="/helper" />
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
          {/*
            길드 불필요 — 로그인만 하면 되는 화면 (MERGE_PLAN §4).
            2단계에서 개인 도구(캐릭터·숙제·보스추적·버프콜)가 이 그룹에 붙는다.
            404 를 여기 둔 이유: 오타 URL 하나 때문에 길드 생성을 요구할 이유가 없다.
          */}
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route element={<CharactersPage />} path="characters" />
            <Route element={<ChecklistPage />} path="checklist" />
            <Route element={<BossTrackerPage />} path="boss-tracker" />
            <Route element={<BossHistoryPage />} path="boss-tracker/history" />
            <Route element={<RecruitPage />} path="recruit" />
            <Route element={<RecruitDetailPage />} path="recruit/:postId" />
            <Route element={<RatingsPage />} path="ratings" />
            <Route element={<NotFoundPage />} path="*" />
          </Route>

          {/* 길드 필수 — 정산·공대·멤버 */}
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
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
