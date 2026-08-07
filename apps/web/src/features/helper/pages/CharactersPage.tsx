import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import {
  addCharacter,
  deactivateCharacter,
  getCharacters,
  updateCharacter,
  type Character,
} from '@/features/helper/api';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/popup/Modal';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CharacterList } from '@/features/helper/characters/CharacterList';
import { CharacterForm, type CharacterFormData } from '@/features/helper/characters/CharacterForm';

const CHARACTERS_KEY = ['characters'] as const;

/**
 * 캐릭터 관리 — 길드 없이 쓰는 첫 화면 (MERGE_PLAN §7 2단계).
 * 숙제·보스추적·버프콜이 전부 여기서 만든 캐릭터에 매달린다.
 */
export function CharactersPage() {
  const queryClient = useQueryClient();
  const { data: characters = [], isLoading } = useQuery({
    queryKey: CHARACTERS_KEY,
    queryFn: getCharacters,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Character | null>(null);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditTarget(null);
  }, []);

  const openAdd = useCallback(() => {
    setEditTarget(null);
    setIsModalOpen(true);
  }, []);

  const openEdit = useCallback((character: Character) => {
    setEditTarget(character);
    setIsModalOpen(true);
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CHARACTERS_KEY });

  const addMutation = useMutation({
    mutationFn: addCharacter,
    onSuccess: () => {
      void invalidate();
      toast.success('캐릭터가 추가되었습니다.');
      closeModal();
    },
    onError: (e: Error) => toast.error(e.message || '캐릭터 추가에 실패했습니다.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CharacterFormData }) =>
      updateCharacter(id, data),
    onSuccess: () => {
      void invalidate();
      toast.success('캐릭터 정보가 수정되었습니다.');
      closeModal();
    },
    onError: (e: Error) => toast.error(e.message || '캐릭터 수정에 실패했습니다.'),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateCharacter,
    onSuccess: () => {
      void invalidate();
      toast.success('캐릭터가 비활성화되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message || '캐릭터 비활성화에 실패했습니다.'),
  });

  const handleSubmit = useCallback(
    (data: CharacterFormData) => {
      if (editTarget) updateMutation.mutate({ id: editTarget.id, data });
      else addMutation.mutate(data);
    },
    [editTarget, updateMutation, addMutation],
  );

  const handleDeactivate = useCallback(
    async (character: Character) => {
      // 삭제가 아니라 비활성화다 — 입장 기록과 숙제 이력이 character_id 에 매달려 있어
      // 지우면 통째로 사라진다 (0013 의 on delete cascade).
      const ok = await confirm.danger(
        `"${character.nickname}" 캐릭터를 비활성화하시겠습니까? 기록은 그대로 남습니다.`,
        '캐릭터 비활성화',
      );
      if (ok) deactivateMutation.mutate(character.id);
    },
    [deactivateMutation],
  );

  const isSubmitting = addMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={openAdd} size="sm">
            <UserPlus className="h-4 w-4" />
            캐릭터 추가
          </Button>
        }
        description="캐릭터를 등록하면 보스 입장 기록과 숙제를 캐릭터별로 관리할 수 있습니다."
        title="캐릭터 관리"
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <CharacterList characters={characters} onDeactivate={handleDeactivate} onEdit={openEdit} />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editTarget ? '캐릭터 수정' : '캐릭터 추가'}
        width={400}
      >
        {/* key 로 편집 대상이 바뀔 때 폼 상태를 초기화한다 */}
        <CharacterForm
          key={editTarget?.id ?? 'new'}
          initialData={
            editTarget
              ? {
                  nickname: editTarget.nickname,
                  jobCategory: editTarget.jobCategory,
                  job: editTarget.job,
                  level: editTarget.level,
                  serverName: editTarget.serverName,
                  statAttack: editTarget.statAttack,
                }
              : undefined
          }
          isSubmitting={isSubmitting}
          onCancel={closeModal}
          onSubmit={handleSubmit}
        />
      </Modal>
    </div>
  );
}
