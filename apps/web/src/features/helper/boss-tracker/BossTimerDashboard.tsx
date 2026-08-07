import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Timer } from 'lucide-react';
import { getCharBossEntries, getCharacters } from '@/features/helper/api';
import { buildBossTimers } from '@/features/helper/bossTimer';
import { useBosses } from '@/hooks/useBosses';
import { useNow } from '@/hooks/useNow';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { BossTimerRow } from '@/features/helper/boss-tracker/BossTimerRow';
import { BossEntryModal } from '@/features/helper/boss-tracker/BossEntryModal';

interface BossTimerDashboardProps {
  characterId: string;
}

export function BossTimerDashboard({ characterId }: BossTimerDashboardProps) {
  // "3시간 전" 같은 상대 표기는 분 단위면 충분하다. 초당 갱신은 CooldownBadge 안에서만 돈다.
  const now = useNow(60_000);
  const bosses = useBosses();
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);

  const { data: entries = [] } = useQuery({
    queryKey: ['charBossEntries', characterId],
    queryFn: () => getCharBossEntries(characterId),
    enabled: Boolean(characterId),
  });

  const { data: characters = [] } = useQuery({
    queryKey: ['characters'],
    queryFn: getCharacters,
  });

  const timers = useMemo(
    () => buildBossTimers(bosses, entries, characters),
    [bosses, entries, characters],
  );

  const entryModal = (
    <BossEntryModal
      characterId={characterId}
      isOpen={isEntryModalOpen}
      onClose={() => setIsEntryModalOpen(false)}
    />
  );

  if (timers.length === 0) {
    return (
      <>
        <EmptyState
          Icon={Timer}
          action={
            <Button onClick={() => setIsEntryModalOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              보스 입장
            </Button>
          }
          description="보스 입장을 기록하면 재입장 쿨타임을 추적할 수 있습니다."
          title="입장 기록이 없습니다"
        />
        {entryModal}
      </>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-text-primary text-sm font-semibold">쿨타임 현황</h2>
        <Button onClick={() => setIsEntryModalOpen(true)} size="sm">
          <Plus className="h-4 w-4" />
          보스 입장
        </Button>
      </div>

      {/* buildBossTimers 가 nextAt 오름차순으로 준다 — 곧 열리는 보스가 위로 온다 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {timers.map((timer) => (
          <BossTimerRow key={timer.entryId} now={now} timer={timer} />
        ))}
      </div>

      {entryModal}
    </div>
  );
}
