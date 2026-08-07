import { Volume2, X } from 'lucide-react';
import type { BuffSkill } from '@/stores/useBuffCallStore';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Toggle } from '@/components/ui/Toggle';
import { progressRatio, remainingBuffMs } from './timer';

interface BuffSkillCardProps {
  skill: BuffSkill;
  isRunning: boolean;
  /** 파티가 공유하는 기준 시각 (epoch ms) */
  startedAt: number | null;
  /** 미전달 시 편집 컨트롤을 숨긴다 (파티원 읽기 전용) */
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
}

export function BuffSkillCard({
  skill,
  isRunning,
  startedAt,
  onToggle,
  onRemove,
}: BuffSkillCardProps) {
  // 링이 부드럽게 돌아야 해서 100ms 다. 이 컴포넌트만 초당 10회 다시 그린다.
  const now = useNow(100);

  const intervalMs = skill.intervalSec * 1000;
  const running = isRunning && skill.enabled && startedAt !== null;

  const progress = running ? progressRatio(startedAt, intervalMs, now) : 0;
  const remaining = running ? remainingBuffMs(startedAt, intervalMs, now) : intervalMs;

  return (
    <Card
      className={cn(
        'flex items-center gap-3 p-3 transition-opacity',
        !skill.enabled && 'opacity-50',
      )}
    >
      {running ? (
        <ProgressRing progress={progress} size={56} strokeWidth={3}>
          <span className="text-text-primary text-xs font-medium">{formatDuration(remaining)}</span>
        </ProgressRing>
      ) : (
        <div className="border-border-subtle flex h-14 w-14 shrink-0 items-center justify-center rounded-full border">
          <Volume2 className="text-text-muted h-5 w-5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="text-text-primary truncate text-sm font-semibold">{skill.name}</div>
        <div className="text-text-secondary mt-0.5 text-xs">{skill.intervalSec}초 간격</div>
        <div className="text-text-muted mt-0.5 truncate text-xs">&quot;{skill.alertText}&quot;</div>
      </div>

      {(onToggle ?? onRemove) && (
        <div className="flex shrink-0 items-center gap-2">
          {/* 실행 중 편집은 막는다 — 돌고 있는 타이머와 목록이 어긋난다 */}
          {onToggle && (
            <Toggle
              checked={skill.enabled}
              disabled={isRunning}
              onChange={() => onToggle(skill.id)}
            />
          )}
          {onRemove && (
            <Button
              aria-label={`${skill.name} 삭제`}
              className="h-8 w-8 p-0"
              disabled={isRunning}
              onClick={() => onRemove(skill.id)}
              size="sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
