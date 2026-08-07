import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addCharBossEntry, getCharBossEntries } from '@/features/helper/api';
import { bossesAvailableForEntry, cooldownCounts } from '@/features/helper/bossTimer';
import { useBosses } from '@/hooks/useBosses';
import { toDatetimeLocal } from '@/lib/date';
import { toast } from '@/stores/useToastStore';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';

interface BossEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterId: string;
}

export function BossEntryModal({ isOpen, onClose, characterId }: BossEntryModalProps) {
  const queryClient = useQueryClient();
  const bosses = useBosses();

  const { data: entries = [] } = useQuery({
    queryKey: ['charBossEntries', characterId],
    queryFn: () => getCharBossEntries(characterId),
    enabled: isOpen && Boolean(characterId),
  });

  // 쿨타임이 다 찬 보스는 목록에서 뺀다 — 어차피 지금 못 들어간다
  const availableBosses = useMemo(
    () => bossesAvailableForEntry(bosses, entries),
    [bosses, entries],
  );
  const counts = useMemo(() => cooldownCounts(bosses, entries), [bosses, entries]);

  const [selectedBossId, setSelectedBossId] = useState('');
  const [note, setNote] = useState('');
  const [enteredAt, setEnteredAt] = useState(() => toDatetimeLocal(new Date()));

  const mutation = useMutation({
    mutationFn: addCharBossEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['charBossEntries'] });
      toast.success('보스 입장이 기록되었습니다.');
      setSelectedBossId('');
      setNote('');
      setEnteredAt(toDatetimeLocal(new Date()));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || '보스 입장 기록에 실패했습니다.'),
  });

  const handleSubmit = () => {
    const boss = availableBosses.find((b) => b.id === selectedBossId);
    if (!boss) return;
    mutation.mutate({
      characterId,
      bossId: boss.id,
      bossName: boss.name,
      note,
      enteredAt: new Date(enteredAt).toISOString(),
    });
  };

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            취소
          </Button>
          <Button disabled={!selectedBossId || mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      title="보스 입장 기록"
      width={400}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-text-primary mb-1 block text-sm font-medium" htmlFor="entry-boss">
            보스 선택
          </label>
          <Select
            id="entry-boss"
            onChange={(e) => setSelectedBossId(e.target.value)}
            value={selectedBossId}
          >
            <option value="">보스를 선택하세요</option>
            {availableBosses.map((boss) => (
              <option key={boss.id} value={boss.id}>
                {boss.name}
                {/* 여러 트가 가능한 보스만 "지금 넣으면 몇 트째"인지 알려준다 */}
                {boss.maxEntries > 1 ? ` (${String((counts.get(boss.id) ?? 0) + 1)}트)` : ''}
              </option>
            ))}
          </Select>
          {availableBosses.length === 0 && (
            <span className="text-text-tertiary mt-1 block text-xs">
              지금 입장 가능한 보스가 없습니다. 쿨타임이 끝나면 다시 나타납니다.
            </span>
          )}
        </div>

        <div>
          <label className="text-text-primary mb-1 block text-sm font-medium" htmlFor="entry-time">
            입장 시간
          </label>
          <Input
            id="entry-time"
            onChange={(e) => setEnteredAt(e.target.value)}
            type="datetime-local"
            value={enteredAt}
          />
        </div>

        <div>
          <label className="text-text-primary mb-1 block text-sm font-medium" htmlFor="entry-note">
            메모 <span className="text-text-tertiary font-normal">(선택)</span>
          </label>
          <textarea
            className="border-border-default bg-bg-card text-text-primary placeholder:text-text-muted focus:border-border-focus w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60"
            id="entry-note"
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모를 입력하세요"
            rows={2}
            value={note}
          />
        </div>
      </div>
    </Modal>
  );
}
