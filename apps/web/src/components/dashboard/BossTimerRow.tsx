import { useEffect, useRef } from 'react';
import { CheckCircle2, Hourglass, Pencil, X } from 'lucide-react';
import { useNow } from '@/hooks/useNow';
import { remainingMs, type BossTimer } from '@/lib/bossTimer';
import { formatDuration, formatRelativeDateTime } from '@/lib/format';
import { toast } from '@/stores/useToastStore';
import { Button } from '@/components/ui/Button';

interface BossTimerRowProps {
  timer: BossTimer;
  onRecord: () => void;
  onEdit: () => void;
  onCancel: () => void;
  disabled: boolean;
}

/**
 * 보스 한 종류의 타이머 행.
 *
 * useNow() 를 여기서만 호출한다 — 초당 리렌더를 이 행 안에 가둬서, 대시보드의
 * 차트·랭킹·최근 레이드가 매초 다시 그려지는 걸 막는다.
 */
export function BossTimerRow({ timer, onRecord, onEdit, onCancel, disabled }: BossTimerRowProps) {
  const now = useNow();
  const isAvailable = timer.nextAt <= now;

  useAvailableToast(isAvailable, timer.bossName);

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-text-primary truncate text-sm font-medium">{timer.bossName}</p>
        <div className="text-text-tertiary mt-0.5 flex items-center gap-1.5 text-xs">
          <span className="tabular-nums">{formatRelativeDateTime(timer.enteredAt, now)} 입장</span>
          <button
            aria-label={`${timer.bossName} 입장 시각 수정`}
            className="text-text-muted hover:text-text-secondary rounded p-0.5 disabled:opacity-40"
            disabled={disabled}
            onClick={onEdit}
            type="button"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            aria-label={`${timer.bossName} 입장 기록 취소`}
            className="text-text-muted hover:text-error-600 rounded p-0.5 disabled:opacity-40"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="shrink-0 text-right">
        {isAvailable ? (
          <>
            <p className="text-success-600 flex items-center justify-end gap-1 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> 지금 입장 가능
            </p>
            <Button className="mt-1" disabled={disabled} onClick={onRecord} size="sm">
              지금 입장
            </Button>
          </>
        ) : (
          <>
            <p className="text-text-secondary flex items-center justify-end gap-1 text-xs font-semibold tabular-nums">
              <Hourglass className="h-3.5 w-3.5" />
              {formatDuration(remainingMs(timer.nextAt, now))} 남음
            </p>
            <p className="text-text-tertiary mt-0.5 text-xs tabular-nums">
              {formatRelativeDateTime(timer.nextAt, now)} 부터
            </p>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * 대기 → 가능 으로 "넘어가는 순간"에만 토스트를 한 번 띄운다.
 *
 * 조건만 보고 띄우면 매 tick(1초)마다 같은 토스트가 쌓인다. 또 마운트 시점 상태를
 * 그대로 기준값으로 잡기 때문에, 이미 입장 가능한 보스가 여러 개인 상태로 대시보드에
 * 들어와도 토스트가 쏟아지지 않는다(배지로만 보여준다).
 */
function useAvailableToast(isAvailable: boolean, bossName: string): void {
  const wasAvailable = useRef(isAvailable);

  useEffect(() => {
    if (isAvailable && !wasAvailable.current) {
      toast.success(`${bossName} 입장 가능합니다.`);
    }
    wasAvailable.current = isAvailable;
  }, [isAvailable, bossName]);
}
