import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  LayoutDashboard,
  Users,
  Swords,
  ScrollText,
  Plus,
  Coins,
  Settings,
  Wrench,
  Lightbulb,
} from 'lucide-react';
import { MANUAL_SECTIONS } from '@/lib/manual';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';

const ICON_BY_ID: Record<string, LucideIcon> = {
  overview: BookOpen,
  dashboard: LayoutDashboard,
  members: Users,
  parties: Swords,
  raids: ScrollText,
  'raid-new': Plus,
  credits: Coins,
  settings: Settings,
  admin: Wrench,
};

/** 사용 매뉴얼 — 화면별 간단 안내 (콘텐츠는 lib/manual.ts) */
export function ManualPage() {
  return (
    <div>
      <PageHeader title="사용 매뉴얼" description="화면별 사용법을 간단히 정리했습니다." />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* 목차 */}
        <nav className="hidden lg:block">
          <ul className="sticky top-32 space-y-1">
            {MANUAL_SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-text-secondary hover:bg-bg-hover hover:text-text-primary block rounded-md px-3 py-1.5 text-sm"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* 본문 */}
        <div className="space-y-4">
          {MANUAL_SECTIONS.map((s) => {
            const Icon = ICON_BY_ID[s.id] ?? BookOpen;
            return (
              <Card key={s.id} id={s.id} className="scroll-mt-32 p-5">
                <div className="mb-1 flex items-center gap-2">
                  <span className="bg-brand-50 text-brand-600 flex h-8 w-8 items-center justify-center rounded-lg">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="text-section-title">{s.title}</h2>
                </div>
                <p className="text-text-secondary mb-3 text-sm">{s.summary}</p>

                {/* 스크린샷 자리 — 나중에 이미지로 교체 */}
                <div className="border-border-default text-text-muted mb-4 flex h-28 items-center justify-center rounded-lg border border-dashed text-xs">
                  스크린샷 추가 예정
                </div>

                <ol className="text-text-secondary list-decimal space-y-1.5 pl-5 text-sm">
                  {s.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>

                {s.tips && s.tips.length > 0 && (
                  <div className="bg-bg-muted mt-4 space-y-1 rounded-md p-3">
                    {s.tips.map((tip, i) => (
                      <p key={i} className="text-text-secondary flex items-start gap-2 text-xs">
                        <Lightbulb className="text-warning-500 mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {tip}
                      </p>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
