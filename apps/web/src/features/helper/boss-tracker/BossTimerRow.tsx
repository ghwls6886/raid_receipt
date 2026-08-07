import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Shield, Trash2 } from 'lucide-react';
import { deleteCharBossEntry, updateCharBossEntryTime } from '@/features/helper/api';
import { getBossColor } from '@/features/helper/bossColors';
import type { BossTimer } from '@/features/helper/bossTimer';
import { toDatetimeLocal } from '@/lib/date';
import { formatRelativeDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { toast } from '@/stores/useToastStore';
import { Card } from '@/components/ui/Card';
import { CooldownBadge } from '@/features/helper/boss-tracker/CooldownBadge';

interface BossTimerRowProps {
  timer: BossTimer;
  /** 상대 시각 표시용. 매초가 아니라 분 단위로 갱신되는 값이 들어온다 */
  now: number;
}

export function BossTimerRow({ timer, now }: BossTimerRowProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editTime, setEditTime] = useState(() => toDatetimeLocal(new Date(timer.enteredAt)));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['charBossEntries'] });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCharBossEntry(timer.entryId),
    onSuccess: () => {
      void invalidate();
      toast.success(`${timer.bossName} 기록이 삭제되었습니다.`);
    },
    onError: (e: Error) => toast.error(e.message || '기록 삭제에 실패했습니다.'),
  });

  const updateMutation = useMutation({
    mutationFn: (enteredAt: string) => updateCharBossEntryTime(timer.entryId, enteredAt),
    onSuccess: () => {
      void invalidate();
      setIsEditing(false);
      toast.success('입장 시간이 변경되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '입장 시간 변경에 실패했습니다.'),
  });

  const color = getBossColor(timer.bossId);

  return (
    <Card className={cn('flex flex-col gap-3 border-l-4 px-4 py-3', color.border)}>
      <div className="flex items-center gap-3">
        <span
          className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', color.bg)}
        >
          <Shield className={cn('h-5 w-5', color.text)} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-text-primary truncate text-sm font-semibold">
              {timer.bossName}
            </span>
            {/* 하루 여러 트가 가능한 보스만 몇 트째인지 보여준다 */}
            {timer.maxEntries > 1 && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                  color.bg,
                  color.text,
                )}
              >
                {timer.attemptNumber}/{timer.maxEntries}트
              </span>
            )}
            <span className="text-text-tertiary truncate text-xs">{timer.characterName}</span>
          </div>
          <p className="text-text-secondary mt-0.5 text-xs">
            마지막 입장: {formatRelativeDateTime(timer.enteredAt, now)}
          </p>
        </div>

        <CooldownBadge nextAt={timer.nextAt} />
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            className="border-border-default bg-bg-card text-text-primary focus:border-border-focus flex-1 rounded-md border px-2 py-1 text-xs outline-none"
            onChange={(e) => setEditTime(e.target.value)}
            type="datetime-local"
            value={editTime}
          />
          <button
            className="text-brand-600 hover:text-brand-700 text-xs font-medium"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate(new Date(editTime).toISOString())}
            type="button"
          >
            저장
          </button>
          <button
            className="text-text-tertiary hover:text-text-secondary text-xs"
            onClick={() => setIsEditing(false)}
            type="button"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="border-border-subtle flex items-center gap-1 border-t pt-2">
          <button
            className="text-text-secondary hover:bg-bg-hover flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
            onClick={() => {
              setEditTime(toDatetimeLocal(new Date(timer.enteredAt)));
              setIsEditing(true);
            }}
            type="button"
          >
            <Clock className="h-3.5 w-3.5" />
            시간 변경
          </button>
          <button
            className="text-text-secondary hover:bg-error-50 hover:text-error-600 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            초기화
          </button>
        </div>
      )}
    </Card>
  );
}
