import { useNow } from '@/hooks/useNow';
import { remainingMs } from '@/lib/cooldown';
import { formatDuration } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';

interface CooldownBadgeProps {
  /** 다음 입장 가능 시각 (epoch ms) */
  nextAt: number;
}

/**
 * 남은 쿨타임 뱃지.
 *
 * useNow 를 여기서 부른다 — 초당 리렌더가 이 뱃지 하나로 갇히기 때문이다.
 * 상위(카드·페이지)에서 부르면 형제 트리까지 매초 다시 그린다.
 */
export function CooldownBadge({ nextAt }: CooldownBadgeProps) {
  const remaining = remainingMs(nextAt, useNow());

  if (remaining === 0) return <Badge tone="success">입장 가능</Badge>;
  return <Badge tone="warning">{formatDuration(remaining)} 남음</Badge>;
}
