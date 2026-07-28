import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Swords, Server, AlertTriangle, type LucideIcon } from 'lucide-react';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import {
  getBosses,
  addBoss,
  deleteBoss,
  updateBossCooldown,
  MAX_COOLDOWN_HOURS,
  getServers,
  addServer,
  deleteServer,
  getErrorLogs,
  type Boss,
  type GameServer,
} from '@/lib/api';
import { DEFAULT_COOLDOWN_HOURS } from '@/lib/bossTimer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/feedback/LoadingState';
import { cn } from '@/lib/cn';

type Tab = 'bosses' | 'servers' | 'logs';

/** 시스템 관리자 — 보스·서버 마스터 + 시스템 로그 */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>('bosses');

  return (
    <div>
      <PageHeader title="시스템 관리자" description="보스·서버 마스터와 시스템 로그를 관리합니다." />
      <div className="border-border-subtle mb-5 flex gap-1 border-b">
        <TabButton active={tab === 'bosses'} onClick={() => setTab('bosses')} Icon={Swords}>
          보스 관리
        </TabButton>
        <TabButton active={tab === 'servers'} onClick={() => setTab('servers')} Icon={Server}>
          서버 관리
        </TabButton>
        <TabButton active={tab === 'logs'} onClick={() => setTab('logs')} Icon={AlertTriangle}>
          HTTP 에러 로그
        </TabButton>
      </div>
      {tab === 'bosses' && <BossPanel />}
      {tab === 'servers' && <ServerPanel />}
      {tab === 'logs' && <ErrorLogsPanel />}
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

/** 이름 목록 CRUD 공용 패널 (보스/서버) */
interface NamedItem {
  id: string;
  name: string;
}

interface MasterPanelProps<T extends NamedItem> {
  queryKey: string;
  fetchAll: () => Promise<T[]>;
  add: (name: string) => Promise<T>;
  remove: (id: string) => Promise<void>;
  placeholder: string;
  label: string;
  hint?: string;
}

function MasterPanel<T extends NamedItem>({
  queryKey,
  fetchAll,
  add,
  remove,
  placeholder,
  label,
  hint,
}: MasterPanelProps<T>) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { data: items, isLoading } = useQuery({ queryKey: [queryKey], queryFn: fetchAll });
  const refetch = () => void queryClient.invalidateQueries({ queryKey: [queryKey] });

  const addMutation = useMutation({
    mutationFn: () => add(name),
    onSuccess: () => {
      toast.success(`${label}이(가) 추가되었습니다.`);
      setName('');
      refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '추가에 실패했습니다.'),
  });

  const del = async (item: T) => {
    const ok = await confirm.danger(`'${item.name}'을(를) 삭제할까요?`, `${label} 삭제`);
    if (!ok) return;
    await remove(item.id);
    toast.success('삭제되었습니다.');
    refetch();
  };

  return (
    <Card className="max-w-xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) addMutation.mutate();
          }}
        />
        <Button
          className="shrink-0"
          onClick={() => addMutation.mutate()}
          disabled={!name.trim() || addMutation.isPending}
        >
          <Plus className="h-4 w-4" /> 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8">
          <LoadingState message="불러오는 중..." />
        </div>
      ) : items && items.length > 0 ? (
        <ul className="divide-border-subtle divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2.5">
              <span className="text-text-primary text-sm font-medium">{item.name}</span>
              <button
                aria-label="삭제"
                className="text-text-muted hover:text-error-600 rounded-md p-1.5"
                onClick={() => del(item)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted py-8 text-center text-sm">등록된 항목이 없습니다.</p>
      )}

      {hint && <p className="text-text-tertiary mt-3 text-xs">{hint}</p>}
    </Card>
  );
}

/**
 * 보스 마스터 — 이름 + 재입장 쿨타임.
 *
 * 이름만 다루는 MasterPanel 을 쓰지 않고 따로 둔다. 보스는 쿨타임이라는 두 번째 필드가
 * 있어서 `add: (name) => Promise<T>` 시그니처에 담기지 않는다.
 */
function BossPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [cooldown, setCooldown] = useState(String(DEFAULT_COOLDOWN_HOURS));

  const { data: bosses, isLoading } = useQuery({ queryKey: ['bosses'], queryFn: getBosses });
  const refetch = () => void queryClient.invalidateQueries({ queryKey: ['bosses'] });

  const addMutation = useMutation({
    mutationFn: () => addBoss(name, Number(cooldown)),
    onSuccess: () => {
      toast.success('보스가 추가되었습니다.');
      setName('');
      setCooldown(String(DEFAULT_COOLDOWN_HOURS));
      refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '추가에 실패했습니다.'),
  });

  const cooldownMutation = useMutation({
    mutationFn: (v: { id: string; hours: number }) => updateBossCooldown(v.id, v.hours),
    onSuccess: (boss) => {
      toast.success(`${boss.name} 쿨타임을 ${boss.cooldownHours}시간으로 변경했습니다.`);
      refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '변경에 실패했습니다.'),
  });

  const del = async (boss: Boss) => {
    const ok = await confirm.danger(`'${boss.name}'을(를) 삭제할까요?`, '보스 삭제');
    if (!ok) return;
    await deleteBoss(boss.id);
    toast.success('삭제되었습니다.');
    refetch();
  };

  return (
    <Card className="max-w-xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder="보스 이름 추가 (예: 카오스 벨룸)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) addMutation.mutate();
          }}
        />
        <Input
          aria-label="쿨타임(시간)"
          className="w-24 shrink-0"
          max={MAX_COOLDOWN_HOURS}
          min={1}
          onChange={(e) => setCooldown(e.target.value)}
          type="number"
          value={cooldown}
        />
        <Button
          className="shrink-0"
          onClick={() => addMutation.mutate()}
          disabled={!name.trim() || addMutation.isPending}
        >
          <Plus className="h-4 w-4" /> 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8">
          <LoadingState message="불러오는 중..." />
        </div>
      ) : bosses && bosses.length > 0 ? (
        <ul className="divide-border-subtle divide-y">
          {bosses.map((boss) => (
            <li key={boss.id} className="flex items-center justify-between gap-2 py-2.5">
              <span className="text-text-primary min-w-0 flex-1 truncate text-sm font-medium">
                {boss.name}
              </span>
              <CooldownField
                boss={boss}
                disabled={cooldownMutation.isPending}
                onCommit={(hours) => cooldownMutation.mutateAsync({ id: boss.id, hours })}
              />
              <button
                aria-label="삭제"
                className="text-text-muted hover:text-error-600 shrink-0 rounded-md p-1.5"
                onClick={() => void del(boss)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted py-8 text-center text-sm">등록된 항목이 없습니다.</p>
      )}

      <p className="text-text-tertiary mt-3 text-xs">
        보스를 삭제해도 과거 레이드 기록에는 영향이 없습니다(이름 스냅샷). 쿨타임은 대시보드
        보스 타이머의 다음 입장 가능 시각 계산에 쓰입니다 — 주 1회 보스라면 168 을 넣으세요.
      </p>
    </Card>
  );
}

interface CooldownFieldProps {
  boss: Boss;
  disabled: boolean;
  /** 저장 — 거부되면 reject 한다 */
  onCommit: (hours: number) => Promise<unknown>;
}

/** 쿨타임 인라인 편집 — 값이 실제로 바뀐 경우에만 저장한다 */
function CooldownField({ boss, disabled, onCommit }: CooldownFieldProps) {
  const [value, setValue] = useState(String(boss.cooldownHours));

  // 저장이 성공해 서버 값이 바뀌면 입력칸도 따라간다
  useEffect(() => setValue(String(boss.cooldownHours)), [boss.cooldownHours]);

  const commit = async () => {
    const hours = Number(value);
    if (hours === boss.cooldownHours) return;
    try {
      await onCommit(hours);
    } catch {
      // 거부된 값(범위 밖 등)이 입력칸에 남으면 저장된 것처럼 보인다. 서버 값으로 되돌린다.
      // 값이 그대로라 위 useEffect 는 재실행되지 않으므로 여기서 직접 복구해야 한다.
      setValue(String(boss.cooldownHours));
    }
  };

  return (
    <span className="text-text-tertiary flex shrink-0 items-center gap-1 text-xs">
      <Input
        aria-label={`${boss.name} 쿨타임(시간)`}
        className="w-20 px-2 py-1 text-right text-xs"
        disabled={disabled}
        max={MAX_COOLDOWN_HOURS}
        min={1}
        onBlur={() => void commit()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        type="number"
        value={value}
      />
      시간
    </span>
  );
}

function ServerPanel() {
  return (
    <MasterPanel<GameServer>
      queryKey="servers"
      fetchAll={getServers}
      add={addServer}
      remove={deleteServer}
      placeholder="서버 이름 추가 (예: 메이플랜드)"
      label="서버"
      hint="길드 설정의 서버명 콤보박스에 사용됩니다."
    />
  );
}

function statusClass(status: number): string {
  if (status >= 500) return 'bg-error-50 text-error-700';
  if (status >= 400) return 'bg-warning-50 text-warning-700';
  return 'bg-bg-muted text-text-secondary';
}

/** HTTP 에러 로그 조회 */
function ErrorLogsPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['errorLogs'], queryFn: getErrorLogs });

  if (isLoading) {
    return (
      <Card className="p-10">
        <LoadingState message="불러오는 중..." />
      </Card>
    );
  }

  const logs = data ?? [];

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-border-subtle text-text-tertiary border-b text-xs">
              <th className="px-4 py-2.5 text-left font-medium">시각</th>
              <th className="px-4 py-2.5 text-left font-medium">메서드</th>
              <th className="px-4 py-2.5 text-left font-medium">경로</th>
              <th className="px-4 py-2.5 text-center font-medium">상태</th>
              <th className="px-4 py-2.5 text-left font-medium">메시지</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-border-subtle hover:bg-bg-hover border-b last:border-0">
                <td className="text-text-secondary px-4 py-3 whitespace-nowrap tabular-nums">
                  {l.at.replace('T', ' ')}
                </td>
                <td className="text-text-secondary px-4 py-3 font-mono text-xs">{l.method}</td>
                <td className="text-text-primary px-4 py-3 font-mono text-xs">{l.path}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                      statusClass(l.status),
                    )}
                  >
                    {l.status}
                  </span>
                </td>
                <td className="text-text-secondary px-4 py-3">{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
