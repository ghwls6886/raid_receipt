import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Copy, Send } from 'lucide-react';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { useCurrentGuild, useGuildStore } from '@/stores/useGuildStore';
import {
  getPenaltyTypes,
  addPenaltyType,
  deletePenaltyType,
  createInvite,
  getServers,
  getAccounts,
  updateAccountRole,
  removeAccount,
  getAuditLogs,
  logAudit,
  ACCOUNT_ROLE_LABEL,
  type AccountRole,
  type GuildAccount,
  type PenaltyCalcType,
  type PenaltyType,
} from '@/lib/api';
import { formatMeso } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingState } from '@/components/feedback/LoadingState';

/** 목업 단계 읽기전용 입력 필드 */
function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="text-text-secondary mb-1 block text-sm font-medium">{label}</label>
      <input
        className="border-border-default bg-bg-muted text-text-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
        defaultValue={value}
        disabled
      />
      {hint && <p className="text-text-tertiary mt-1 text-xs">{hint}</p>}
    </div>
  );
}

/** 길드 설정 (명세서 §5·§9 guild_settings) */
export function GuildSettingsPage() {
  return (
    <div>
      <PageHeader
        title="길드 설정"
        description="기본 정보·디스코드·정산/패널티 정책·길드원 권한·초대·변경 이력"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BasicInfoCard />
        <DiscordCard />

        <Card className="space-y-4 p-5 lg:col-span-2">
          <h2 className="text-card-title">정산 정책</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="기본 뽀찌율" value="0%" hint="공대장 몫 · 레이드마다 바꿀 수 있습니다" />
            <Field
              label="기본 판매 수수료율"
              value="5%"
              hint="드랍템 행에 자동으로 채워집니다 · 직거래는 0으로"
            />
          </div>
          <p className="text-text-tertiary text-xs">
            ※ 잔돈 처리는 공대별로 설정합니다. (공대 구성 화면)
          </p>
        </Card>

        <AccountRoleCard />
        <PenaltyPolicyCard />
        <InviteCard />
        <AuditLogCard />
      </div>
    </div>
  );
}

/** 기본 정보 — 서버명은 콤보박스(서버 마스터), 길드명은 읽기전용 */
function BasicInfoCard() {
  const guild = useCurrentGuild();
  const setGuildServer = useGuildStore((s) => s.setGuildServer);
  const { data: servers } = useQuery({ queryKey: ['servers'], queryFn: getServers });

  const list = servers ?? [];
  const hasCurrent = list.some((s) => s.name === guild.serverName);

  const changeServer = (name: string) => {
    if (name === guild.serverName) return;
    setGuildServer(guild.id, name);
    void logAudit(guild.id, '서버 변경', `${guild.serverName} → ${name}`);
    toast.success('서버명이 변경되었습니다.');
  };

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-card-title">기본 정보</h2>
      <div>
        <label className="text-text-secondary mb-1 block text-sm font-medium">서버명</label>
        <Select value={guild.serverName} onChange={(e) => changeServer(e.target.value)}>
          {!hasCurrent && <option value={guild.serverName}>{guild.serverName}</option>}
          {list.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
        <p className="text-text-tertiary mt-1 text-xs">서버 목록은 시스템 관리자에서 관리합니다.</p>
      </div>
      <Field label="길드명" value={guild.guildName} />
    </Card>
  );
}

const WEBHOOK_TEST_PAYLOAD = {
  username: '정산봇',
  content: '🧾 **레이드 정산 영수증** (테스트 전송)',
  embeds: [
    {
      title: '자쿰 레이드',
      color: 0xf97316,
      fields: [
        { name: '총 순수익', value: '45,000,000 메소', inline: true },
        { name: '1인당', value: '6,750,000 메소', inline: true },
        { name: '참여 인원', value: '6명', inline: true },
      ],
      footer: { text: '메월드 길드 정산 매니저' },
    },
  ],
};

/** 디스코드 웹훅 — 실제 URL로 텍스트 테스트 전송 */
function DiscordCard() {
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);

  const test = async () => {
    const target = url.trim();
    if (!target) {
      toast.warning('웹훅 URL을 입력해 주세요.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(WEBHOOK_TEST_PAYLOAD),
      });
      if (res.ok) toast.success('디스코드로 전송했습니다. 채널을 확인하세요.');
      else toast.error(`전송 실패 (HTTP ${res.status})`);
    } catch {
      toast.error('전송 실패 — URL 또는 CORS를 확인하세요.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-card-title">디스코드 웹훅</h2>
      <Input
        placeholder="https://discord.com/api/webhooks/..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button className="shrink-0" onClick={test} disabled={sending}>
        <Send className="h-4 w-4" /> 테스트 전송
      </Button>
      <p className="text-text-tertiary text-xs leading-relaxed">
        브라우저에서 직접 보내는 텍스트 테스트입니다. 실제 영수증 이미지 발송은 서버에서 처리됩니다.
      </p>
    </Card>
  );
}

const ACCOUNT_ROLES: AccountRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

/** 계정 권한 — 구글 로그인 계정 대상 권한 관리, 마지막 관리자 보호 */
function AccountRoleCard() {
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts', guild.id],
    queryFn: () => getAccounts(guild.id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['accounts', guild.id] });
    void queryClient.invalidateQueries({ queryKey: ['audit', guild.id] });
  };

  const changeRole = async (a: GuildAccount, role: AccountRole) => {
    if (a.role === role) return;
    try {
      await updateAccountRole(guild.id, a.id, role);
      toast.success(`${a.name} → ${ACCOUNT_ROLE_LABEL[role]}`);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '변경에 실패했습니다.');
      invalidate();
    }
  };

  const remove = async (a: GuildAccount) => {
    const ok = await confirm.danger(`'${a.name}' 계정을 길드에서 내보낼까요?`, '계정 삭제');
    if (!ok) return;
    try {
      await removeAccount(guild.id, a.id);
      toast.success('삭제되었습니다.');
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <Card className="space-y-3 p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-card-title">계정 권한</h2>
        <span className="text-text-tertiary text-xs">구글 로그인 계정 대상 · 관리자 최소 1명</span>
      </div>
      <p className="text-text-tertiary text-xs leading-relaxed">
        길드원(정산 명단)과 별개로, 서비스에 로그인해 길드에 참여한 계정의 권한을 관리합니다.
      </p>
      {isLoading ? (
        <div className="py-6">
          <LoadingState message="불러오는 중..." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-border-subtle text-text-tertiary border-b text-xs">
                <th className="py-2 pr-2 text-left font-medium">계정</th>
                <th className="py-2 pr-2 text-left font-medium">권한</th>
                <th className="py-2 text-right font-medium">삭제</th>
              </tr>
            </thead>
            <tbody>
              {(accounts ?? []).map((a) => (
                <tr key={a.id} className="border-border-subtle border-b last:border-0">
                  <td className="py-2 pr-2">
                    <div className="text-text-primary font-medium">{a.name}</div>
                    <div className="text-text-tertiary text-xs">{a.email}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <Select
                      className="w-28"
                      value={a.role}
                      onChange={(e) => void changeRole(a, e.target.value as AccountRole)}
                    >
                      {ACCOUNT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ACCOUNT_ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      aria-label="삭제"
                      className="text-text-muted hover:text-error-600 rounded-md p-1.5"
                      onClick={() => void remove(a)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const INVITE_ROLES: { value: AccountRole; label: string }[] = [
  { value: 'ADMIN', label: '부마스터' },
  { value: 'MEMBER', label: '길드원' },
];

/** 길드원 초대 — 초대 코드 생성 후 복사해 공유 */
function InviteCard() {
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<AccountRole>('ADMIN');
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const generate = async () => {
    setCreating(true);
    try {
      const invite = await createInvite(guild.id, role);
      setCode(invite.code);
      void queryClient.invalidateQueries({ queryKey: ['audit', guild.id] });
    } finally {
      setCreating(false);
    }
  };

  const copy = () => {
    if (!code) return;
    void navigator.clipboard?.writeText(code);
    toast.success('복사됐어요. 디스코드로 붙여넣어 공유하세요.');
  };

  return (
    <Card className="space-y-3 p-5 lg:col-span-2">
      <h2 className="text-card-title">길드원 초대</h2>
      <p className="text-text-tertiary text-xs leading-relaxed">
        초대 코드를 생성해 부길마·공대장에게 공유하세요. 받은 사람이 온보딩에서 코드를 입력하면 이
        길드({guild.guildName})에 참여합니다.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">역할</label>
          <Select
            className="w-32"
            value={role}
            onChange={(e) => setRole(e.target.value as AccountRole)}
          >
            {INVITE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <Button className="shrink-0" onClick={generate} disabled={creating}>
          <Plus className="h-4 w-4" /> 초대 코드 생성
        </Button>
      </div>
      {code && (
        <div className="border-border-subtle bg-bg-muted flex items-center justify-between gap-2 rounded-lg border px-4 py-3">
          <code className="text-text-primary text-lg font-bold tracking-wider">{code}</code>
          <Button className="shrink-0" variant="secondary" onClick={copy}>
            <Copy className="h-4 w-4" /> 복사
          </Button>
        </div>
      )}
    </Card>
  );
}

/** 패널티 정책 — 지각·노쇼 등 정산 차감 유형 (CRUD) */
function PenaltyPolicyCard() {
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [calcType, setCalcType] = useState<PenaltyCalcType>('percent');
  const [value, setValue] = useState(5);

  const { data: types, isLoading } = useQuery({
    queryKey: ['penalty-types', guild.id],
    queryFn: () => getPenaltyTypes(guild.id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['penalty-types', guild.id] });
    void queryClient.invalidateQueries({ queryKey: ['audit', guild.id] });
  };

  const addMutation = useMutation({
    mutationFn: () => addPenaltyType(guild.id, { name, calcType, value }),
    onSuccess: () => {
      toast.success('패널티가 추가되었습니다.');
      setName('');
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '추가에 실패했습니다.'),
  });

  const remove = async (t: PenaltyType) => {
    const ok = await confirm.danger(`'${t.name}' 패널티를 삭제할까요?`, '패널티 삭제');
    if (!ok) return;
    await deletePenaltyType(guild.id, t.id);
    toast.success('삭제되었습니다.');
    invalidate();
  };

  return (
    <Card className="space-y-4 p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-card-title">패널티 정책</h2>
        <span className="text-text-tertiary text-xs">지각·노쇼 등 정산 차감 유형</span>
      </div>

      {isLoading ? (
        <div className="py-6">
          <LoadingState message="불러오는 중..." />
        </div>
      ) : types && types.length > 0 ? (
        <ul className="divide-border-subtle divide-y">
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-text-primary text-sm font-medium">{t.name}</span>
                <Badge tone={t.calcType === 'percent' ? 'warning' : 'neutral'}>
                  {t.calcType === 'percent' ? `${t.value}%` : `${formatMeso(t.value)} 메소`}
                </Badge>
              </div>
              <button
                aria-label="패널티 삭제"
                className="text-text-muted hover:text-error-600 rounded-md p-1.5"
                onClick={() => remove(t)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted text-sm">등록된 패널티가 없습니다.</p>
      )}

      <div className="border-border-subtle flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="min-w-40 flex-1">
          <label className="text-text-secondary mb-1 block text-xs font-medium">패널티명</label>
          <Input placeholder="예: 지각" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">구분</label>
          <Select
            className="w-32"
            value={calcType}
            onChange={(e) => setCalcType(e.target.value as PenaltyCalcType)}
          >
            <option value="percent">% (비율)</option>
            <option value="fixed">정수 (메소)</option>
          </Select>
        </div>
        <div>
          <label className="text-text-secondary mb-1 block text-xs font-medium">수치</label>
          <Input
            className="w-32"
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(Number(e.target.value) || 0)}
            placeholder={calcType === 'percent' ? '5' : '1000000'}
          />
        </div>
        <Button
          className="shrink-0"
          onClick={() => addMutation.mutate()}
          disabled={!name.trim() || addMutation.isPending}
        >
          <Plus className="h-4 w-4" /> 추가
        </Button>
      </div>
    </Card>
  );
}

function AuditLogCard() {
  const guild = useCurrentGuild();
  const { data, isLoading } = useQuery({
    queryKey: ['audit', guild.id],
    queryFn: () => getAuditLogs(guild.id),
  });
  const logs = data ?? [];

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-card-title">변경 이력</h2>
        <span className="text-text-tertiary text-xs">정산·패널티·권한·서버 변경 기록</span>
      </div>
      {isLoading ? (
        <div className="py-6">
          <LoadingState message="불러오는 중..." />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-text-muted text-sm">아직 변경 이력이 없습니다.</p>
      ) : (
        <ul className="divide-border-subtle max-h-72 divide-y overflow-auto">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="text-text-tertiary shrink-0 text-xs tabular-nums whitespace-nowrap">
                {l.at.replace('T', ' ')}
              </span>
              <span className="shrink-0">
                <Badge tone="neutral">{l.action}</Badge>
              </span>
              <span className="text-text-secondary truncate">{l.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
