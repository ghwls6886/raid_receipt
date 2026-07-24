import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';
import { cn } from '@/lib/cn';

type Tone = 'brand' | 'success' | 'violet' | 'warning';

const TONE: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  violet: 'bg-bg-muted text-accent-violet',
  warning: 'bg-warning-50 text-warning-600',
};

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  Icon: LucideIcon;
  tone?: Tone;
}

/** 대시보드 스탯 타일 — 라벨/값/보조설명 + 우상단 아이콘 */
export function StatTile({ label, value, sub, Icon, tone = 'brand' }: StatTileProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className="text-text-muted text-xs font-medium">{label}</span>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', TONE[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="text-text-primary mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-text-tertiary mt-1 text-xs">{sub}</div>}
    </Card>
  );
}
