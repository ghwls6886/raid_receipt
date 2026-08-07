import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRecruitPost, getMyRecruitCharacters } from '@/features/recruit/api';
import { CREATABLE_CATEGORIES } from '@/features/recruit/constants';
import { toast } from '@/stores/useToastStore';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface RecruitCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 목록에서 고른 캐릭터 — 여기서 다시 고르지 않아도 되게 기본값으로 받는다 */
  defaultCharacterId?: string;
}

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 6;

/**
 * 구인 글 작성.
 *
 * 캐릭터를 고르면 서버·스공이 그 캐릭터 값으로 채워진다 — 구인 글의 서버는 파티장
 * 캐릭터의 서버여야 하고, 매번 손으로 적게 하면 오타로 다른 서버 글이 섞인다.
 */
export function RecruitCreateModal({
  isOpen,
  onClose,
  defaultCharacterId,
}: RecruitCreateModalProps) {
  const queryClient = useQueryClient();

  const { data: characters = [] } = useQuery({
    queryKey: ['recruitCharacters'],
    queryFn: getMyRecruitCharacters,
    enabled: isOpen,
  });

  const [characterId, setCharacterId] = useState(defaultCharacterId ?? '');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CREATABLE_CATEGORIES[0]!.id);
  const [maxMembers, setMaxMembers] = useState(4);
  const [requiredStat, setRequiredStat] = useState('');
  const [specDescription, setSpecDescription] = useState('');

  // 첫 캐릭터를 기본 선택. 고른 게 목록에서 사라지면(비활성화 등) 다시 잡는다.
  useEffect(() => {
    if (characters.length === 0) return;
    if (!characters.some((c) => c.id === characterId)) setCharacterId(characters[0]!.id);
  }, [characters, characterId]);

  const selected = characters.find((c) => c.id === characterId);

  const mutation = useMutation({
    mutationFn: createRecruitPost,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruitPosts'] });
      void queryClient.invalidateQueries({ queryKey: ['myRecruitMembership'] });
      toast.success('구인 글을 올렸습니다.');
      setTitle('');
      setRequiredStat('');
      setSpecDescription('');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || '구인 글 작성에 실패했습니다.'),
  });

  const isValid = Boolean(selected) && title.trim() !== '';

  const handleSubmit = () => {
    if (!selected || !isValid) return;
    mutation.mutate({
      characterId: selected.id,
      title,
      category,
      maxMembers,
      // 서버는 파티장 캐릭터를 따른다
      serverName: selected.serverName,
      requiredStatAttack: requiredStat ? Number(requiredStat) : null,
      specDescription,
      leaderStatAttack: selected.statAttack,
      leaderSpec: `${selected.job} Lv.${String(selected.level)}`,
    });
  };

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            취소
          </Button>
          <Button disabled={!isValid || mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? '올리는 중...' : '글 올리기'}
          </Button>
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      title="구인 글 작성"
      width={440}
    >
      {characters.length === 0 ? (
        <p className="text-text-secondary py-6 text-center text-sm">
          캐릭터를 먼저 등록해야 구인 글을 올릴 수 있습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-text-primary text-sm font-medium">파티장 캐릭터</span>
            <Select onChange={(e) => setCharacterId(e.target.value)} value={characterId}>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nickname} (Lv.{c.level} {c.job}) · {c.serverName}
                </option>
              ))}
            </Select>
            <span className="text-text-tertiary text-xs">
              선택한 캐릭터의 서버로 글이 올라갑니다.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-text-primary text-sm font-medium">제목</span>
            <Input
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 자쿰 같이 도실 분"
              value={title}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-text-primary text-sm font-medium">카테고리</span>
            <Select onChange={(e) => setCategory(e.target.value)} value={category}>
              {CREATABLE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-text-primary text-sm font-medium">모집 인원 (파티장 포함)</span>
            <Select
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              value={String(maxMembers)}
            >
              {Array.from({ length: MAX_MEMBERS - MIN_MEMBERS + 1 }, (_, i) => i + MIN_MEMBERS).map(
                (n) => (
                  <option key={n} value={n}>
                    {n}명
                  </option>
                ),
              )}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-text-primary text-sm font-medium">
              요구 스공 <span className="text-text-tertiary font-normal">(선택)</span>
            </span>
            <Input
              min={0}
              onChange={(e) => setRequiredStat(e.target.value)}
              placeholder="비우면 제한 없음"
              type="number"
              value={requiredStat}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-text-primary text-sm font-medium">
              스펙 요구 <span className="text-text-tertiary font-normal">(선택)</span>
            </span>
            <textarea
              className="border-border-default bg-bg-card text-text-primary placeholder:text-text-muted focus:border-border-focus w-full rounded-md border px-3 py-2 text-sm outline-none"
              onChange={(e) => setSpecDescription(e.target.value)}
              placeholder="예: 보스 경험 있으신 분"
              rows={2}
              value={specDescription}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
