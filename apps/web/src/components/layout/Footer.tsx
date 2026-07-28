import { Link } from 'react-router-dom';

/**
 * 앱 셸 바텀바 — 랜딩 푸터(LandingPage)의 약관/저작권 구성을 앱 안으로 옮긴 것.
 * 랜딩은 오렌지 배경에 맞춘 하드코딩 색을 쓰지만, 여기서는 앱 테마 토큰을 따라 라이트/다크 모두 대응한다.
 */
export function Footer() {
  return (
    <footer className="border-border-subtle text-text-muted mt-auto border-t text-xs">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-5 sm:flex-row sm:justify-between sm:px-6">
        <div className="flex flex-col items-center gap-1.5 sm:items-start">
          <div className="space-x-3 font-semibold">
            <Link to="/terms" className="hover:text-text-secondary hover:underline">
              이용약관
            </Link>
            <Link to="/privacy" className="hover:text-text-secondary hover:underline">
              개인정보처리방침
            </Link>
          </div>
          <div>© 2026 메월드 길드 정산 매니저 · 서드파티 계산 도구 (메이플스토리 비공식)</div>
        </div>

        <div className="text-text-tertiary shrink-0">made by 스트롱박, hoyoujin</div>
      </div>
    </footer>
  );
}
