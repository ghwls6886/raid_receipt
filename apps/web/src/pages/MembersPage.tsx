import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import { toast } from '@/stores/useToastStore';
import { useCurrentGuild } from '@/stores/useGuildStore';
import {
  getMembers,
  addMember,
  groupMembersByJob,
  JOB_GROUPS,
  JOB_CATEGORIES,
  type JobSection,
  type MemberRole,
} from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/popup/Modal';
import { LoadingState } from '@/components/feedback/LoadingState';
import { cn } from '@/lib/cn';

const ROLE_LABEL: Record<MemberRole, string> = {
  MASTER: '마스터',
  MANAGER: '부마스터',
  MEMBER: '길드원',
};
const ROLE_TONE: Record<MemberRole, 'brand' | 'warning' | 'neutral'> = {
  MASTER: 'brand',
  MANAGER: 'warning',
  MEMBER: 'neutral',
};
const ROLES: MemberRole[] = ['MEMBER', 'MANAGER', 'MASTER'];

/** 직업 계열별 카드 강조색 (점) */
const CATEGORY_DOT: Record<string, string> = {
  전사: 'bg-error-500',
  마법사: 'bg-accent-violet',
  궁수: 'bg-success-500',
  도적: 'bg-text-muted',
  해적: 'bg-warning-500',
};

/** 길드원 (명세서 §5 길드원 등록) */
export function MembersPage() {
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ['members', guild.id],
    queryFn: () => getMembers(guild.id),
  });

  const sections = useMemo(() => groupMembersByJob(members ?? []), [members]);
  const total = members?.length ?? 0;
  const refetch = () => void queryClient.invalidateQueries({ queryKey: ['members', guild.id] });

  return (
    <div>
      <PageHeader
        title="길드원"
        description={total > 0 ? `총 ${total}명 · 직업 계열별` : '인게임 닉네임·직업·역할을 등록합니다.'}
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> 길드원 등록
          </Button>
        }
      />

      {isLoading ? (
        <Card className="p-10">
          <LoadingState message="불러오는 중..." />
        </Card>
      ) : sections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((sec) => (
            <JobCategoryCard key={sec.category} section={sec} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            Icon={Users}
            title="등록된 길드원이 없습니다"
            description="레이드 참여자를 관리하려면 먼저 길드원을 등록하세요."
            action={
              <Button variant="secondary" onClick={() => setOpen(true)}>
                <UserPlus className="h-4 w-4" /> 길드원 등록
              </Button>
            }
          />
        </Card>
      )}

      <AddMemberModal
        isOpen={open}
        guildId={guild.id}
        onClose={() => setOpen(false)}
        onAdded={refetch}
      />
    </div>
  );
}

function JobCategoryCard({ section }: { section: JobSection }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn('h-2.5 w-2.5 rounded-full', CATEGORY_DOT[section.category] ?? 'bg-text-muted')}
          />
          <h3 className="text-card-title">{section.category}</h3>
        </div>
        <span className="text-text-muted text-xs">{section.members.length}명</span>
      </div>
      <ul>
        {section.members.map((m) => (
          <li
            key={m.id}
            className="border-border-subtle flex items-center justify-between gap-2 border-b py-2 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <span className="text-text-primary font-medium">{m.nickname}</span>
              <span className="text-text-tertiary ml-1.5 text-xs">{m.job}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-text-secondary text-xs tabular-nums">Lv.{m.level}</span>
              <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface AddMemberModalProps {
  isOpen: boolean;
  guildId: string;
  onClose: () => void;
  onAdded: () => void;
}

const jobsOf = (category: string): string[] =>
  JOB_GROUPS.find((g) => g.category === category)?.jobs ?? [];

function AddMemberModal({ isOpen, guildId, onClose, onAdded }: AddMemberModalProps) {
  const firstCategory = JOB_CATEGORIES[0] ?? '전사';
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState(firstCategory);
  const [job, setJob] = useState(() => jobsOf(firstCategory)[0] ?? '');
  const [level, setLevel] = useState(1);
  const [role, setRole] = useState<MemberRole>('MEMBER');

  const reset = () => {
    setNickname('');
    setCategory(firstCategory);
    setJob(jobsOf(firstCategory)[0] ?? '');
    setLevel(1);
    setRole('MEMBER');
  };

  const changeCategory = (next: string) => {
    setCategory(next);
    setJob(jobsOf(next)[0] ?? '');
  };

  const mutation = useMutation({
    mutationFn: () => addMember(guildId, { nickname, jobCategory: category, job, level, role }),
    onSuccess: () => {
      toast.success('길드원이 등록되었습니다.');
      reset();
      onAdded();
      onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '등록에 실패했습니다.'),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="길드원 등록"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!nickname.trim() || mutation.isPending}>
            등록
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-text-secondary mb-1 block text-sm font-medium">인게임 닉네임</label>
          <Input
            placeholder="예: 흑우"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-text-secondary mb-1 block text-sm font-medium">직업 계열</label>
            <Select value={category} onChange={(e) => changeCategory(e.target.value)}>
              {JOB_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-text-secondary mb-1 block text-sm font-medium">세부 직업</label>
            <Select value={job} onChange={(e) => setJob(e.target.value)}>
              {jobsOf(category).map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-text-secondary mb-1 block text-sm font-medium">레벨</label>
            <Input
              type="number"
              min={1}
              max={200}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <label className="text-text-secondary mb-1 block text-sm font-medium">역할</label>
            <Select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </Modal>
  );
}
