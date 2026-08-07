import { Crown, LayoutGrid, Sparkles, Swords, type LucideIcon } from 'lucide-react';
import { RECRUIT_CATEGORIES } from '@/features/recruit/constants';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  party_quest: Sparkles,
  boss_expedition: Crown,
};

function iconOf(id: string): LucideIcon {
  return CATEGORY_ICONS[id] ?? Swords;
}

/** 'hunt_171_200' → '171~200' — 사냥 카테고리만 레벨 구간을 보조 표기한다 */
function levelRangeOf(id: string): string | null {
  const match = /^hunt_(\d+)_(\d+)$/.exec(id);
  return match ? `${match[1]!}~${match[2]!}` : null;
}

interface RecruitCategorySidebarProps {
  selected: string;
  onSelect: (id: string) => void;
  /** 카테고리별 글 수 — 없으면 카운트 배지를 숨긴다 */
  counts?: Readonly<Record<string, number>>;
}

/** 데스크톱은 좌측 세로 목록, 모바일은 가로 스크롤 칩 */
export function RecruitCategorySidebar({
  selected,
  onSelect,
  counts,
}: RecruitCategorySidebarProps) {
  return (
    <>
      <aside className="hidden w-56 shrink-0 md:block">
        <Card className="p-1.5">
          <p className="text-text-tertiary px-2.5 pt-1.5 pb-2 text-xs font-semibold tracking-wide uppercase">
            카테고리
          </p>

          <nav className="flex flex-col gap-0.5">
            {RECRUIT_CATEGORIES.map((cat) => {
              const Icon = iconOf(cat.id);
              const range = levelRangeOf(cat.id);
              const isActive = selected === cat.id;
              const count = counts?.[cat.id];

              return (
                <button
                  key={cat.id}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                  )}
                  onClick={() => onSelect(cat.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                      isActive
                        ? 'bg-brand-500 text-white'
                        : 'bg-bg-muted text-text-tertiary group-hover:text-text-secondary',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{cat.label}</span>
                    {range && (
                      <span className="text-text-tertiary block text-[11px] tabular-nums">
                        Lv.{range}
                      </span>
                    )}
                  </span>

                  {count != null && count > 0 && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                        isActive ? 'bg-brand-500 text-white' : 'bg-bg-muted text-text-tertiary',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </Card>
      </aside>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 md:hidden">
        {RECRUIT_CATEGORIES.map((cat) => {
          const Icon = iconOf(cat.id);
          const isActive = selected === cat.id;
          const count = counts?.[cat.id];

          return (
            <button
              key={cat.id}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-border-subtle bg-bg-card text-text-secondary hover:bg-bg-hover',
              )}
              onClick={() => onSelect(cat.id)}
              type="button"
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              {count != null && count > 0 && (
                <span
                  className={cn('tabular-nums', isActive ? 'text-white/80' : 'text-text-tertiary')}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
