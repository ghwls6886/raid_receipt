import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyToRecruit, type RecruitCharacter, type RecruitPost } from '@/features/recruit/api';
import { toast } from '@/stores/useToastStore';
import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface RecruitApplyModalProps {
  post: RecruitPost;
  characters: RecruitCharacter[];
  /** 목록에서 고른 캐릭터 */
  defaultCharacterId?: string;
  onClose: () => void;
}

export function RecruitApplyModal({
  post,
  characters,
  defaultCharacterId,
  onClose,
}: RecruitApplyModalProps) {
  const queryClient = useQueryClient();

  // 같은 서버의 캐릭터만 신청할 수 있다 — 다른 서버면 같이 못 논다
  const eligible = characters.filter((c) => c.serverName === post.serverName);

  const [characterId, setCharacterId] = useState(
    eligible.some((c) => c.id === defaultCharacterId)
      ? (defaultCharacterId ?? '')
      : (eligible[0]?.id ?? ''),
  );
  const [statAttack, setStatAttack] = useState('');
  const [specText, setSpecText] = useState('');
  const [message, setMessage] = useState('');

  const selected = eligible.find((c) => c.id === characterId);

  // 직접 적었으면 그 값, 아니면 캐릭터에 저장된 스공
  const effectiveStat = statAttack ? Number(statAttack) : (selected?.statAttack ?? null);
  const isUnderSpec =
    post.requiredStatAttack != null &&
    effectiveStat != null &&
    effectiveStat < post.requiredStatAttack;

  const mutation = useMutation({
    mutationFn: applyToRecruit,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruitApplications', post.id] });
      toast.success('신청했습니다. 파티장이 수락하면 알려드립니다.');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || '신청에 실패했습니다.'),
  });

  const handleSubmit = () => {
    if (!characterId) return;
    mutation.mutate({
      postId: post.id,
      characterId,
      statAttack: effectiveStat,
      specText: specText.trim() || null,
      message: message.trim() || null,
    });
  };

  return (
    <Modal
      footer={
        <>
          <Button disabled={mutation.isPending} onClick={onClose} variant="secondary">
            취소
          </Button>
          <Button disabled={!characterId || mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? '신청 중...' : '신청'}
          </Button>
        </>
      }
      isOpen
      onClose={onClose}
      title="파티 신청"
      width={440}
    >
      <div className="border-border-subtle mb-4 border-b pb-3">
        <p className="text-text-primary text-sm font-medium">{post.title}</p>
        <p className="text-text-secondary mt-1 text-xs">
          서버: {post.serverName}
          {post.requiredStatAttack != null &&
            ` · 요구 스공 ${post.requiredStatAttack.toLocaleString()}`}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">
            신청할 캐릭터
            <span className="text-text-tertiary ml-1 font-normal">({post.serverName} 서버)</span>
          </span>
          {eligible.length > 0 ? (
            <Select onChange={(e) => setCharacterId(e.target.value)} value={characterId}>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nickname} (Lv.{c.level} {c.job})
                  {c.statAttack != null ? ` · 스공 ${c.statAttack.toLocaleString()}` : ''}
                </option>
              ))}
            </Select>
          ) : (
            <p className="border-border-subtle text-text-secondary rounded-lg border border-dashed px-3 py-2.5 text-sm">
              {post.serverName} 서버에 캐릭터가 없습니다. 캐릭터를 먼저 등록해주세요.
            </p>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">
            내 스공 <span className="text-text-tertiary font-normal">(선택)</span>
          </span>
          <Input
            min={0}
            onChange={(e) => setStatAttack(e.target.value)}
            placeholder={selected?.statAttack ? String(selected.statAttack) : '스탯 공격력'}
            type="number"
            value={statAttack}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">
            내 스펙 <span className="text-text-tertiary font-normal">(선택)</span>
          </span>
          <Input
            onChange={(e) => setSpecText(e.target.value)}
            placeholder="예: 비숍 200렙"
            value={specText}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-text-primary text-sm font-medium">
            메시지 <span className="text-text-tertiary font-normal">(선택)</span>
          </span>
          <Input
            onChange={(e) => setMessage(e.target.value)}
            placeholder="파티장에게 전할 메시지"
            value={message}
          />
        </label>

        {/* 막지는 않는다 — 판단은 파티장 몫이다 */}
        {isUnderSpec && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            요구 스공({post.requiredStatAttack?.toLocaleString()})에 미달합니다. 신청은 가능하지만
            파티장이 거절할 수 있습니다.
          </p>
        )}
      </div>
    </Modal>
  );
}
