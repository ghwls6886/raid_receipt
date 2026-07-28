import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Swords, Plus, Pencil, Trash2, Crown, Check } from 'lucide-react';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { useCurrentGuild } from '@/stores/useGuildStore';
import {
  getMembers,
  getParties,
  createParty,
  updateParty,
  deleteParty,
  groupMembersByJob,
  REMAINDER_POLICY_LABEL,
  REMAINDER_POLICIES,
  type Member,
  type Party,
  type RemainderPolicy,
} from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/popup/Modal';
import { LoadingState } from '@/components/feedback/LoadingState';
import { cn } from '@/lib/cn';

/** 직업 계열별 강조점 (길드원 카드뷰와 동일 색) */
const CATEGORY_DOT: Record<string, string> = {
  전사: 'bg-error-500',
  마법사: 'bg-accent-violet',
  궁수: 'bg-success-500',
  도적: 'bg-text-muted',
  해적: 'bg-warning-500',
};

/** 공대 구성 — 공대(레이드 팀)를 미리 짜두면 레이드 추가 시 공대원을 한 번에 불러온다 */
export function PartiesPage() {
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);

  const membersQuery = useQuery({
    queryKey: ['members', guild.id],
    queryFn: () => getMembers(guild.id),
  });
  const partiesQuery = useQuery({
    queryKey: ['parties', guild.id],
    queryFn: () => getParties(guild.id),
  });

  const members = membersQuery.data ?? [];
  const parties = partiesQuery.data ?? [];
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const refetch = () => void queryClient.invalidateQueries({ queryKey: ['parties', guild.id] });
  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const remove = async (party: Party) => {
    const ok = await confirm.danger(`'${party.name}' 공대를 삭제할까요?`, '공대 삭제');
    if (!ok) return;
    await deleteParty(guild.id, party.id);
    toast.success('삭제되었습니다.');
    refetch();
  };

  const loading = membersQuery.isLoading || partiesQuery.isLoading;

  return (
    <div>
      <PageHeader
        title="공대 구성"
        description="공대(레이드 팀)를 미리 짜두면 레이드 추가 시 공대원을 한 번에 불러옵니다."
        actions={
          <Button onClick={() => setCreating(true)} disabled={members.length === 0}>
            <Plus className="h-4 w-4" /> 공대 만들기
          </Button>
        }
      />

      {loading ? (
        <Card className="p-10">
          <LoadingState message="불러오는 중..." />
        </Card>
      ) : members.length === 0 ? (
        <Card>
          <EmptyState
            Icon={Swords}
            title="먼저 길드원을 등록하세요"
            description="공대는 등록된 길드원으로 구성합니다."
          />
        </Card>
      ) : parties.length === 0 ? (
        <Card>
          <EmptyState
            Icon={Swords}
            title="구성된 공대가 없습니다"
            description="공대를 만들어 두면 레이드 구성이 훨씬 빨라집니다."
            action={
              <Button variant="secondary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> 공대 만들기
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {parties.map((p) => (
            <PartyCard
              key={p.id}
              party={p}
              memberById={memberById}
              onEdit={() => setEditing(p)}
              onDelete={() => remove(p)}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PartyModal
          guildId={guild.id}
          members={members}
          party={editing}
          onClose={closeModal}
          onSaved={() => {
            refetch();
            closeModal();
          }}
        />
      )}
    </div>
  );
}

interface PartyCardProps {
  party: Party;
  memberById: Map<string, Member>;
  onEdit: () => void;
  onDelete: () => void;
}

function PartyCard({ party, memberById, onEdit, onDelete }: PartyCardProps) {
  const leader = memberById.get(party.leaderId);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-text-primary truncate text-base font-semibold">{party.name}</h3>
          <p className="text-text-tertiary mt-0.5 flex items-center gap-1 text-xs">
            <Crown className="text-warning-500 h-3.5 w-3.5" /> 공대장 {leader?.nickname ?? '—'} ·{' '}
            {party.memberIds.length}명 · 잔돈 {REMAINDER_POLICY_LABEL[party.remainderPolicy]}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            aria-label="공대 수정"
            className="text-text-secondary hover:bg-bg-hover rounded-md p-2"
            onClick={onEdit}
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            aria-label="공대 삭제"
            className="text-text-muted hover:text-error-600 rounded-md p-2"
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {party.memberIds.map((id) => {
          const m = memberById.get(id);
          if (!m) return null;
          const isLeader = id === party.leaderId;
          return (
            <span
              key={id}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                isLeader
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'bg-bg-muted text-text-secondary',
              )}
            >
              {isLeader && '★ '}
              {m.nickname}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

interface PartyModalProps {
  guildId: string;
  members: Member[];
  party: Party | null;
  onClose: () => void;
  onSaved: () => void;
}

function PartyModal({ guildId, members, party, onClose, onSaved }: PartyModalProps) {
  const [name, setName] = useState(party?.name ?? '');
  const [leaderId, setLeaderId] = useState(party?.leaderId ?? members[0]?.id ?? '');
  const [memberIds, setMemberIds] = useState<Set<string>>(
    () => new Set(party?.memberIds ?? leaderIdSeed(members)),
  );
  const [remainderPolicy, setRemainderPolicy] = useState<RemainderPolicy>(
    party?.remainderPolicy ?? 'fund',
  );

  const toggle = (id: string) => {
    if (id === leaderId) return; // 공대장은 항상 포함
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const changeLeader = (id: string) => {
    setLeaderId(id);
    setMemberIds((prev) => new Set(prev).add(id));
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name, leaderId, memberIds: Array.from(memberIds), remainderPolicy };
      return party ? updateParty(guildId, party.id, payload) : createParty(guildId, payload);
    },
    onSuccess: () => {
      toast.success(party ? '공대가 수정되었습니다.' : '공대가 생성되었습니다.');
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '저장에 실패했습니다.'),
  });

  const canSave = name.trim().length > 0 && leaderId !== '' && memberIds.size > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={party ? '공대 수정' : '공대 만들기'}
      width="min(760px, 94vw)"
      bodyClassName="flex flex-col"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending}>
            {party ? '수정' : '생성'}
          </Button>
        </>
      }
    >
      {/* min-h-0 이 있어야 이 래퍼가 모달 body 높이에 맞춰 줄어들고, 그래야 아래 리스트도 줄어든다.
          리스트가 최소높이 바닥에 닿는 극단적으로 낮은 화면에서는 이 래퍼가 스크롤을 받아준다. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
        <div className="shrink-0">
          <label className="text-text-secondary mb-1 block text-sm font-medium">공대명</label>
          <Input
            placeholder="예: 1공대 (자쿰)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="shrink-0">
          <label className="text-text-secondary mb-1 block text-sm font-medium">공대장</label>
          <Select value={leaderId} onChange={(e) => changeLeader(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nickname} ({m.job})
              </option>
            ))}
          </Select>
        </div>

        <div className="shrink-0">
          <label className="text-text-secondary mb-1 block text-sm font-medium">잔돈 처리</label>
          <Select
            value={remainderPolicy}
            onChange={(e) => setRemainderPolicy(e.target.value as RemainderPolicy)}
          >
            {REMAINDER_POLICIES.map((p) => (
              <option key={p} value={p}>
                {REMAINDER_POLICY_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>

        {/* 남는 높이를 리스트가 전부 차지하고 그 안에서만 스크롤한다.
            고정 높이를 주면 작은 화면에서 모달 밖으로 잘려 스크롤바에 닿을 수 없다. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="text-text-secondary mb-1 block shrink-0 text-sm font-medium">
            공대원 ({memberIds.size}명)
          </label>
          <div className="border-border-subtle min-h-20 flex-1 space-y-4 overflow-auto rounded-md border p-3">
            {groupMembersByJob(members).map((sec) => (
              <div key={sec.category}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn('h-2 w-2 rounded-full', CATEGORY_DOT[sec.category] ?? 'bg-text-muted')}
                  />
                  <span className="text-text-secondary text-xs font-semibold">{sec.category}</span>
                  <span className="text-text-muted text-xs">{sec.members.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sec.members.map((m) => {
                    const on = memberIds.has(m.id);
                    const isLeader = m.id === leaderId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        disabled={isLeader}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          on
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-border-subtle text-text-secondary hover:bg-bg-hover',
                          isLeader && 'cursor-default',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            on ? 'border-brand-600 bg-brand-600 text-white' : 'border-border-default',
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {isLeader && '★ '}
                          <span className="font-medium">{m.nickname}</span>
                          <span className="text-text-tertiary ml-1 text-xs">{m.job}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** 새 공대 초기 공대원 시드 = 첫 멤버(공대장 후보) */
function leaderIdSeed(members: Member[]): string[] {
  const first = members[0];
  return first ? [first.id] : [];
}
