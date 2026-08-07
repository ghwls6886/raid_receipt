import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Timer } from 'lucide-react';
import { getCharBossEntries, getCharacters } from '@/features/helper/api';
import { buildBossTimers, type BossTimer } from '@/features/helper/bossTimer';
import { getBossColor } from '@/features/helper/bossColors';
import { cn } from '@/lib/cn';
import { useBosses } from '@/hooks/useBosses';
import { useNow } from '@/hooks/useNow';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { BossTimerRow } from '@/features/helper/boss-tracker/BossTimerRow';
import { BossEntryModal } from '@/features/helper/boss-tracker/BossEntryModal';

interface BossTimerDashboardProps {
  characterId: string;
}

interface TimerGroup {
  key: string;
  bossId: string;
  bossName: string;
  characterName: string;
  maxEntries: number;
  timers: BossTimer[];
}

/**
 * 같은 보스 + 같은 캐릭터의 타이머를 묶는다.
 *
 * 입력 순서(nextAt 오름차순)를 보존한다 — 그룹이 처음 등장한 위치가 그룹의 위치다.
 * 그래야 "곧 열리는 것부터" 정렬이 그룹 단위에서도 유지된다.
 */
function groupTimers(timers: BossTimer[]): TimerGroup[] {
  const byKey = new Map<string, TimerGroup>();
  const order: string[] = [];

  for (const timer of timers) {
    const key = `${timer.bossId}::${timer.characterId}`;
    const group = byKey.get(key);
    if (group) {
      group.timers.push(timer);
      continue;
    }
    byKey.set(key, {
      key,
      bossId: timer.bossId,
      bossName: timer.bossName,
      characterName: timer.characterName,
      maxEntries: timer.maxEntries,
      timers: [timer],
    });
    order.push(key);
  }

  return order.map((key) => byKey.get(key)!);
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

  const groups = useMemo(() => groupTimers(timers), [timers]);

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

      {/*
        같은 보스 + 같은 캐릭터의 기록은 한 묶음으로 본다.
        하루 2트 도는 보스는 "자쿰 1/2트", "자쿰 2/2트" 카드가 따로 생기는데 목록에 흩어져
        있으면 몇 트째인지 세어야 한다. 묶어 놓으면 헤더 한 줄로 끝난다.
        그룹 순서는 buildBossTimers 의 nextAt 오름차순을 그대로 따른다 — 곧 열리는 것이 위로.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {groups.map((group) => {
          if (group.timers.length === 1) {
            return <BossTimerRow key={group.key} now={now} timer={group.timers[0]!} />;
          }
          const color = getBossColor(group.bossId);
          return (
            <div
              key={group.key}
              className="border-border-subtle bg-bg-muted/40 flex flex-col gap-2 rounded-2xl border p-2"
            >
              <div className="flex items-center gap-2 px-2 pt-1">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', color.dot)} />
                <span className="text-text-secondary text-xs font-semibold">
                  {group.bossName} · {group.timers.length}/{group.maxEntries}트 진행 중
                </span>
                <span className="text-text-tertiary ml-auto truncate text-xs">
                  {group.characterName}
                </span>
              </div>
              {group.timers.map((timer) => (
                <BossTimerRow key={timer.entryId} now={now} timer={timer} />
              ))}
            </div>
          );
        })}
      </div>

      {entryModal}
    </div>
  );
}
