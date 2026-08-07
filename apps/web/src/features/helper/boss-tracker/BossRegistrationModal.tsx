import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBossTrackings, toggleBossTracking } from '@/features/helper/api';
import { useBosses } from '@/hooks/useBosses';
import { toast } from '@/stores/useToastStore';
import { Modal } from '@/components/popup/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';

interface BossRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterId: string;
}

/** 캐릭터별로 어떤 보스를 추적할지 고른다 — user_boss_tracking */
export function BossRegistrationModal({
  isOpen,
  onClose,
  characterId,
}: BossRegistrationModalProps) {
  const queryClient = useQueryClient();
  const bosses = useBosses();

  const { data: trackings = [] } = useQuery({
    queryKey: ['bossTrackings', characterId],
    queryFn: () => getBossTrackings(characterId),
    enabled: isOpen && Boolean(characterId),
  });

  // 껐다 켠 행은 notify_enabled=false 로 남아 있으므로 "켜진 것"만 추린다
  const trackedBossIds = new Set(trackings.filter((t) => t.notifyEnabled).map((t) => t.bossId));

  const toggleMutation = useMutation({
    mutationFn: (bossId: string) => toggleBossTracking(characterId, bossId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bossTrackings', characterId] });
    },
    onError: (e: Error) => toast.error(e.message || '보스 등록 변경에 실패했습니다.'),
  });

  return (
    <Modal
      footer={
        <Button onClick={onClose} variant="secondary">
          닫기
        </Button>
      }
      isOpen={isOpen}
      onClose={onClose}
      title="보스 등록 관리"
      width={400}
    >
      <div className="flex flex-col gap-1">
        {bosses.map((boss) => (
          <div
            key={boss.id}
            className="hover:bg-bg-hover flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors"
          >
            <div>
              <span className="text-text-primary text-sm font-medium">{boss.name}</span>
              <span className="text-text-tertiary ml-2 text-xs">
                {boss.cycle === 'DAILY' ? '일간' : '주간'}
              </span>
            </div>
            <Toggle
              aria-label={`${boss.name} 추적`}
              checked={trackedBossIds.has(boss.id)}
              disabled={toggleMutation.isPending}
              onChange={() => toggleMutation.mutate(boss.id)}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
