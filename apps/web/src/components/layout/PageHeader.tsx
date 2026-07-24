import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** 페이지 상단 제목 영역 — 제목/설명 + 우측 액션 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-page-title">{title}</h1>
        {description && <p className="text-text-secondary mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
