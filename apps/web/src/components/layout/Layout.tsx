import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Footer } from './Footer';
import { GlobalLoadingOverlay } from '@/components/feedback/GlobalLoadingOverlay';

/**
 * 앱 셸 — 상단 탑바 + 가운데 정렬 본문 (사이드바 없는 SaaS 레이아웃)
 */
export function Layout() {
  return (
    <div className="bg-bg-page flex min-h-screen flex-col">
      <TopNav />
      <main className="relative flex-1">
        <GlobalLoadingOverlay />
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
