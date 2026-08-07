import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, Swords } from 'lucide-react';
import {
  deleteBossEntry,
  getBossEntries,
  getParties,
  recordBossEntry,
  updateBossEntry,
} from '@/features/settlement/api';
import { getBosses } from '@/lib/masters';
import { bossesWithoutEntry, buildBossTimers, type BossTimer } from '@/features/settlement/bossTimer';
import { useCurrentGuild } from '@/stores/useGuildStore';
import { confirm } from '@/stores/useConfirmStore';
import { toast } from '@/stores/useToastStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BossTimerRow } from '@/features/settlement/components/dashboard/BossTimerRow';
import { EntryTimeModal } from '@/features/settlement/components/dashboard/EntryTimeModal';

/** 편집 모달 대상 — 열려 있으면 이 값이 채워져 있다 */
interface EditTarget {
  entryId: string;
  bossName: string;
  enteredAt: string;
}

/**
 * 보스 타이머 — 공대별로 "언제 들어갔고, 다음은 언제부터인지".
 *
 * 하루 1회 제한이라 입장 시각을 남겨두지 않으면 다음날 몇 시에 가능한지 알 수 없다.
 * 정산(레이드 추가)은 보스를 잡고 "끝난 뒤" 여는 화면이라 입장 시각을 찍기에 늦다.
 * 그래서 첫 화면에서 원클릭으로 남기고, 여기서 카운트다운까지 같이 본다.
 */
export function BossTimerCard() {
  const guild = useCurrentGuild();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const bossesQuery = useQuery({ queryKey: ['bosses'], queryFn: getBosses });
  const partiesQuery = useQuery({
    queryKey: ['parties', guild.id],
    queryFn: () => getParties(guild.id),
  });
  const entriesQuery = useQuery({
    queryKey: ['boss-entries', guild.id],
    queryFn: () => getBossEntries(guild.id),
  });

  const parties = useMemo(() => partiesQuery.data ?? [], [partiesQuery.data]);
  const [pickedPartyId, setPickedPartyId] = useState('');
  // 길드를 바꾸면 이전 공대 id 가 state 에 남는다. 목록과 대조해 유효할 때만 채택하면
  // 초기화 useEffect 없이 항상 올바른 공대를 가리킨다.
  const partyId = parties.find((p) => p.id === pickedPartyId)?.id ?? parties[0]?.id ?? '';

  // 이 공대의 기록만 추려 "도는 보스"(타이머 행)와 "아직 안 돈 보스"(선택지)로 가른다
  const { timers, unrecorded } = useMemo(() => {
    const bosses = bossesQuery.data ?? [];
    const entries = (entriesQuery.data ?? []).filter((e) => e.partyId === partyId);
    return {
      timers: buildBossTimers(bosses, entries),
      unrecorded: bossesWithoutEntry(bosses, entries),
    };
  }, [bossesQuery.data, entriesQuery.data, partyId]);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['boss-entries', guild.id] });
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : '처리에 실패했습니다.');

  const recordMutation = useMutation({
    mutationFn: (bossId: string) => recordBossEntry(guild.id, partyId, bossId),
    onSuccess: (entry) => {
      toast.success(`${entry.bossName} 입장을 기록했습니다.`);
      refresh();
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: (v: { entryId: string; enteredAt: string }) =>
      updateBossEntry(guild.id, v.entryId, v.enteredAt),
    onSuccess: () => {
      toast.success('입장 시각을 수정했습니다.');
      setEditTarget(null);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deleteBossEntry(guild.id, entryId),
    onSuccess: () => {
      toast.success('입장 기록을 취소했습니다.');
      refresh();
    },
    onError,
  });

  const pending = recordMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const cancelEntry = async (timer: BossTimer) => {
    if (!timer.entryId) return;
    const ok = await confirm.danger(
      `${timer.bossName} 입장 기록을 취소할까요? 타이머가 초기화됩니다.`,
      '입장 기록 취소',
    );
    if (ok) deleteMutation.mutate(timer.entryId);
  };

  const isLoading = bossesQuery.isLoading || partiesQuery.isLoading || entriesQuery.isLoading;

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-card-title flex items-center gap-2">
          <AlarmClock className="text-brand-600 h-4 w-4" /> 보스 타이머
        </h2>
        {parties.length > 1 && (
          <Select
            aria-label="공대 선택"
            className="w-40"
            onChange={(e) => setPickedPartyId(e.target.value)}
            value={partyId}
          >
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="py-8">
          <LoadingState message="불러오는 중..." />
        </div>
      ) : parties.length === 0 ? (
        <EmptyState
          Icon={Swords}
          action={<Button onClick={() => navigate('/parties')}>공대 구성하러 가기</Button>}
          description="입장 시각은 공대 단위로 기록됩니다. 공대를 먼저 만들어 주세요."
          title="등록된 공대가 없습니다"
        />
      ) : (
        <>
          {timers.length === 0 ? (
            <p className="text-text-muted py-6 text-center text-sm">
              아직 입장 기록이 없습니다. 아래에서 보스를 골라 첫 입장을 남겨 보세요.
            </p>
          ) : (
            // 도는 보스가 유난히 많은 공대 대비 안전망. 평소엔 스크롤이 생기지 않는다.
            <ul className="divide-border-subtle max-h-96 divide-y overflow-y-auto">
              {timers.map((timer) => (
                <BossTimerRow
                  key={timer.bossId}
                  disabled={pending}
                  onCancel={() => void cancelEntry(timer)}
                  onEdit={() =>
                    setEditTarget({
                      entryId: timer.entryId,
                      bossName: timer.bossName,
                      enteredAt: timer.enteredAt,
                    })
                  }
                  onRecord={() => recordMutation.mutate(timer.bossId)}
                  timer={timer}
                />
              ))}
            </ul>
          )}

          {/* 아직 안 돈 보스는 여기에 접어 둔다 — 목록은 실제로 도는 보스만 유지된다 */}
          <Select
            aria-label="다른 보스 입장 기록"
            className="mt-3"
            disabled={pending || unrecorded.length === 0}
            onChange={(e) => {
              if (e.target.value) recordMutation.mutate(e.target.value);
            }}
            value=""
          >
            <option value="">
              {unrecorded.length === 0
                ? '모든 보스에 기록이 있습니다'
                : `+ 다른 보스 입장 기록 (${unrecorded.length})`}
            </option>
            {unrecorded.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>

          <p className="text-text-tertiary mt-3 text-xs">
            공대별로 기록됩니다. 임시 공대로 진행한 레이드는 타이머에 반영되지 않습니다.
          </p>
        </>
      )}

      {editTarget && (
        <EntryTimeModal
          isOpen
          bossName={editTarget.bossName}
          enteredAt={editTarget.enteredAt}
          onClose={() => setEditTarget(null)}
          onSubmit={(enteredAt) => updateMutation.mutate({ entryId: editTarget.entryId, enteredAt })}
          pending={updateMutation.isPending}
        />
      )}
    </Card>
  );
}
