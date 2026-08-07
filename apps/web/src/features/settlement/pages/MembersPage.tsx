import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users, UserMinus, RotateCcw, type LucideIcon } from 'lucide-react';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { useCurrentGuild } from '@/stores/useGuildStore';
import {
  getMembers,
  addMember,
  deactivateMember,
  reactivateMember,
  groupMembersByJob,
  type JobSection,
  type Member,
  type MemberRole,
} from '@/features/settlement/api';
import { JOB_GROUPS, JOB_CATEGORIES } from '@/lib/jobs';
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
  MEMBER: '공대원',
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

type Tab = 'active' | 'inactive';

/** 공대원 (명세서 §5 공대원 등록) */
export function MembersPage() {
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('active');

  // 비활성 탭까지 그려야 하므로 전원을 받는다. 활성만 쓰는 공대·레이드 화면과
  // 캐시가 섞이지 않도록 키에 'all' 을 붙인다(무효화는 접두사 매칭이라 함께 갱신됨).
  const { data: members, isLoading } = useQuery({
    queryKey: ['members', guild.id, 'all'],
    queryFn: () => getMembers(guild.id, true),
  });

  const { active, inactive } = useMemo(() => {
    const all = members ?? [];
    return {
      active: all.filter((m) => m.isActive),
      inactive: all.filter((m) => !m.isActive),
    };
  }, [members]);

  const sections = useMemo(() => groupMembersByJob(active), [active]);

  // 비활성화는 공대 편성도 건드리므로 공대 캐시까지 함께 무효화한다
  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', guild.id] });
    void queryClient.invalidateQueries({ queryKey: ['parties', guild.id] });
  };

  const deactivateMutation = useMutation({
    mutationFn: (memberId: string) => deactivateMember(guild.id, memberId),
    onSuccess: (result) => {
      toast.success(`${result.member.nickname}을(를) 비활성화했습니다. 과거 레이드 기록은 그대로 남습니다.`);
      if (result.partiesNeedingLeader.length > 0) {
        toast.warning(`${result.partiesNeedingLeader.join(', ')}의 공대장을 다시 지정해 주세요.`, {
          duration: 8000,
        });
      }
      refetch();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : '비활성화에 실패했습니다.'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (memberId: string) => reactivateMember(guild.id, memberId),
    onSuccess: (member) => {
      toast.success(`${member.nickname}이(가) 복귀했습니다. 공대 편성은 다시 해주세요.`);
      refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '복귀에 실패했습니다.'),
  });

  const askDeactivate = async (m: Member) => {
    const ok = await confirm.warning(
      `'${m.nickname}'을(를) 비활성화할까요?\n명단과 공대에서 빠지지만 과거 레이드 기록과 참여도는 그대로 남습니다.`,
      '공대원 비활성화',
    );
    if (ok) deactivateMutation.mutate(m.id);
  };

  const pending = deactivateMutation.isPending || reactivateMutation.isPending;

  return (
    <div>
      <PageHeader
        title="공대원"
        description={
          active.length > 0
            ? `활동 ${active.length}명 · 직업 계열별`
            : '인게임 닉네임·직업·역할을 등록합니다.'
        }
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> 공대원 등록
          </Button>
        }
      />

      <div className="border-border-subtle mb-5 flex gap-1 border-b">
        <TabButton active={tab === 'active'} onClick={() => setTab('active')} Icon={Users}>
          활동 공대원 {active.length}
        </TabButton>
        <TabButton active={tab === 'inactive'} onClick={() => setTab('inactive')} Icon={UserMinus}>
          비활성 {inactive.length}
        </TabButton>
      </div>

      {isLoading ? (
        <Card className="p-10">
          <LoadingState message="불러오는 중..." />
        </Card>
      ) : tab === 'inactive' ? (
        <InactiveList
          members={inactive}
          onReactivate={(m) => reactivateMutation.mutate(m.id)}
          pending={pending}
        />
      ) : sections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((sec) => (
            <JobCategoryCard
              key={sec.category}
              onDeactivate={(m) => void askDeactivate(m)}
              pending={pending}
              section={sec}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            Icon={Users}
            title="등록된 공대원이 없습니다"
            description="레이드 참여자를 관리하려면 먼저 공대원을 등록하세요."
            action={
              <Button variant="secondary" onClick={() => setOpen(true)}>
                <UserPlus className="h-4 w-4" /> 공대원 등록
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

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  Icon: LucideIcon;
  children: React.ReactNode;
}

function TabButton({ active, onClick, Icon, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-brand-600 text-text-primary'
          : 'text-text-secondary hover:text-text-primary border-transparent',
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

interface InactiveListProps {
  members: Member[];
  onReactivate: (m: Member) => void;
  pending: boolean;
}

/** 비활성 공대원 — 명단에서는 빠졌지만 과거 레이드·참여도에는 그대로 남아 있는 사람들 */
function InactiveList({ members, onReactivate, pending }: InactiveListProps) {
  if (members.length === 0) {
    return (
      <Card>
        <EmptyState
          Icon={UserMinus}
          title="비활성 공대원이 없습니다"
          description="길드를 떠난 사람은 삭제 대신 비활성화하세요. 과거 레이드 기록이 보존됩니다."
        />
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl p-5">
      <ul className="divide-border-subtle divide-y">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <span className="text-text-secondary font-medium">{m.nickname}</span>
              <span className="text-text-tertiary ml-1.5 text-xs">
                {m.job} · Lv.{m.level}
              </span>
            </div>
            <Button
              disabled={pending}
              onClick={() => onReactivate(m)}
              size="sm"
              variant="secondary"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 되돌리기
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-text-tertiary mt-3 text-xs">
        비활성 공대원은 공대 편성과 레이드 참여자 선택에 나타나지 않습니다. 지난 레이드 기록과
        참여도 집계에는 그대로 남아 있습니다.
      </p>
    </Card>
  );
}

interface JobCategoryCardProps {
  section: JobSection;
  onDeactivate: (m: Member) => void;
  pending: boolean;
}

function JobCategoryCard({ section, onDeactivate, pending }: JobCategoryCardProps) {
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
            className="border-border-subtle group flex items-center justify-between gap-2 border-b py-2 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <span className="text-text-primary font-medium">{m.nickname}</span>
              <span className="text-text-tertiary ml-1.5 text-xs">{m.job}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-text-secondary text-xs tabular-nums">Lv.{m.level}</span>
              <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
              <button
                aria-label={`${m.nickname} 비활성화`}
                className="text-text-muted hover:text-error-600 rounded p-1 disabled:opacity-40"
                disabled={pending}
                onClick={() => onDeactivate(m)}
                type="button"
              >
                <UserMinus className="h-3.5 w-3.5" />
              </button>
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
  // JOB_CATEGORIES 가 리터럴 튜플이라 추론에 맡기면 '전사' 하나로 좁혀진다 (@/lib/jobs)
  const [category, setCategory] = useState<string>(firstCategory);
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
      toast.success('공대원이 등록되었습니다.');
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
      title="공대원 등록"
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
