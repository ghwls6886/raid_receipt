import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** 데이터 없음 상태 — 아이콘 + 제목 + 설명 + 액션 */
export function EmptyState({ Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="bg-bg-muted text-text-tertiary flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-text-primary text-sm font-semibold">{title}</p>
        {description && <p className="text-text-tertiary mt-1 text-sm">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
