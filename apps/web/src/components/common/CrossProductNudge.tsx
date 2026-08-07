import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CrossProductNudgeProps {
  /** localStorage 키가 된다. 넛지마다 고유해야 한다 */
  id: string;
  Icon: LucideIcon;
  title: ReactNode;
  description: string;
  ctaLabel: string;
  to: string;
  className?: string;
}

const STORAGE_PREFIX = 'nudge-dismissed:';

/**
 * 다른 제품으로 건너가게 하는 문맥 넛지 (MERGE_PLAN §6).
 *
 * 배너보다 강한 수단이다 — "지금 이 화면에서 하던 일"과 이어져 있어서 광고가 아니라
 * 다음 할 일처럼 읽힌다. 대신 반복해서 뜨면 그 순간 광고가 되므로 **닫으면 다시 안 뜬다.**
 *
 * 공용 컴포넌트인 이유: 넛지는 정산과 helper 양쪽 화면에 붙는데, 어느 한쪽 feature 에
 * 두면 다른 쪽이 import 하게 되어 §4.1 원칙 3(feature 간 직접 import 금지)을 깬다.
 * 표시 조건은 각 화면이 판단해 렌더 여부로 넘긴다 — 이 컴포넌트는 표시만 한다.
 *
 * 4단계에 구인이 들어오면 §6 이 원래 지정한 넛지 두 개
 * ("구인 모집 완료 → 공대 만들고 정산", "공대 인원 부족 → 구인 글 올리기")도 이걸 쓴다.
 */
export function CrossProductNudge({
  id,
  Icon,
  title,
  description,
  ctaLabel,
  to,
  className,
}: CrossProductNudgeProps) {
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === '1');

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        'border-brand-200 bg-brand-50/60 relative flex items-start gap-3 rounded-xl border p-4',
        className,
      )}
    >
      <span className="bg-brand-100 text-brand-700 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 pr-6">
        <p className="text-text-primary text-sm font-semibold">{title}</p>
        <p className="text-text-secondary mt-0.5 text-[13px] leading-relaxed">{description}</p>
        <Link
          className="text-brand-600 hover:text-brand-700 mt-2 inline-flex items-center gap-1 text-sm font-bold transition-colors"
          to={to}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <button
        aria-label="이 안내 닫기"
        className="text-text-tertiary hover:text-text-secondary absolute top-3 right-3 rounded-md p-1"
        onClick={dismiss}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
