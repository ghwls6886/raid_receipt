import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="text-brand-600 text-6xl font-bold">404</div>
      <p className="text-text-secondary">요청하신 페이지를 찾을 수 없습니다.</p>
      <Link
        className="text-text-link hover:text-text-link-hover text-sm font-medium"
        to="/dashboard"
      >
        대시보드로 돌아가기
      </Link>
    </div>
  );
}
