import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Copy, Check, FileText, Send, UserPlus } from 'lucide-react';
import { useCurrentGuild } from '@/stores/useGuildStore';
import {
  getBosses,
  getMembers,
  getGuildSettings,
  getRaids,
  getParties,
  getPenaltyTypes,
  getRaidDetail,
  getRaid,
  saveRaid,
  isRaidEditable,
  groupMembersByJob,
  DEFAULT_PHASE_COUNT,
  MAX_PHASE_COUNT,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_CATEGORY_PLACEHOLDER,
  REMAINDER_POLICY_LABEL,
  REMAINDER_POLICIES,
  type ExpenseCategory,
  type RaidStatus,
  type RaidInput,
  type RemainderPolicy,
} from '@/lib/api';
import { calcSettlement } from '@/lib/settlement';
import { formatMeso } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingState } from '@/components/feedback/LoadingState';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { cn } from '@/lib/cn';

/** 이번 레이드에만 참여하는 임시 용병 — 길드원 명단에 남지 않고 n빵에 참여한다 */
interface GuestRow {
  id: string;
  name: string;
}
interface DropRow {
  id: string;
  name: string;
  /** 실제 판매가 — 수수료 떼기 전 */
  salePrice: number;
  /** 판매 수수료 % (경매장 등). 직거래면 0 */
  feePct: number;
}
interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  name: string;
  cost: number;
}

/** 정산 테이블 한 줄 — 길드원과 임시 용병을 같은 모양으로 다룬다 */
interface ParticipantRow {
  id: string;
  name: string;
  sub: string;
  isGuest: boolean;
}

let localSeq = 0;
const localId = (): string => `local_${(localSeq += 1)}`;

let guestSeq = 0;
/** 길드원 id(`m1`…)와 절대 겹치지 않도록 prefix 를 분리 */
const guestId = (): string => `guest_${(guestSeq += 1)}`;

const CATEGORY_DOT: Record<string, string> = {
  전사: 'bg-error-500',
  마법사: 'bg-accent-violet',
  궁수: 'bg-success-500',
  도적: 'bg-text-muted',
  해적: 'bg-warning-500',
};

const AUTOSAVE_MS = 5000;

/** 이탈 시점 셀렉트의 "+ 페이즈 늘리기" 항목 값 — 실제 페이즈 번호와 겹치지 않게 */
const ADD_PHASE_VALUE = '__add_phase__';

/** 메소 금액 입력 — 천 단위 콤마 표기 + 숫자만 파싱 */
function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={cn('text-right', className)}
      placeholder={placeholder}
      value={value === 0 ? '' : formatMeso(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '');
        onChange(digits ? Number(digits) : 0);
      }}
    />
  );
}

/** 레이드 추가/수정 (명세서 §5) — 자동 임시저장 + 임시/미발송 건 재편집 */
export function RaidNewPage() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isEdit = Boolean(routeId);
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();

  const bossesQuery = useQuery({ queryKey: ['bosses'], queryFn: getBosses });
  const membersQuery = useQuery({
    queryKey: ['members', guild.id],
    queryFn: () => getMembers(guild.id),
  });
  const settingsQuery = useQuery({
    queryKey: ['guild-settings', guild.id],
    queryFn: () => getGuildSettings(guild.id),
  });
  const raidsQuery = useQuery({ queryKey: ['raids', guild.id], queryFn: () => getRaids(guild.id) });
  const partiesQuery = useQuery({
    queryKey: ['parties', guild.id],
    queryFn: () => getParties(guild.id),
  });
  const penaltyTypesQuery = useQuery({
    queryKey: ['penalty-types', guild.id],
    queryFn: () => getPenaltyTypes(guild.id),
  });
  const detailQuery = useQuery({
    queryKey: ['raid-detail', routeId],
    queryFn: () => getRaidDetail(routeId ?? ''),
    enabled: isEdit,
  });
  const rowQuery = useQuery({
    queryKey: ['raid', guild.id, routeId],
    queryFn: () => getRaid(guild.id, routeId ?? ''),
    enabled: isEdit,
  });

  const [bossName, setBossName] = useState('');
  // 뽀찌를 안 걷는 길드가 많아 0 에서 시작한다 (길드 설정 기본값이 로드되면 덮어씀)
  const [ppojiPct, setPpojiPct] = useState(0);
  const [ppojiTouched, setPpojiTouched] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<GuestRow[]>([]);
  /** 참여자 id → 적용된 패널티 유형 id 목록 (여러 개 가능) */
  const [penaltyBy, setPenaltyBy] = useState<Record<string, string[]>>({});
  const [exitPhaseBy, setExitPhaseBy] = useState<Record<string, number>>({});
  /** 이탈 시점 셀렉트에 그릴 페이즈 개수. 모자라면 그 자리에서 늘린다 */
  const [phaseCount, setPhaseCount] = useState(DEFAULT_PHASE_COUNT);
  const [feePctTouched, setFeePctTouched] = useState(false);
  const [drops, setDrops] = useState<DropRow[]>([
    { id: localId(), name: '', salePrice: 0, feePct: 0 },
  ]);
  const [remainderPolicy, setRemainderPolicy] = useState<RemainderPolicy>('fund');
  const [loadedPartyName, setLoadedPartyName] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [wasConfirmed, setWasConfirmed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const prefilledRef = useRef(false);

  const defaultFeePct = settingsQuery.data?.defaultFeePct ?? 0;

  // 길드 기본 뽀찌율 (신규 · 미변경 시)
  useEffect(() => {
    if (!isEdit && !ppojiTouched && settingsQuery.data) {
      setPpojiPct(Math.round(settingsQuery.data.ppojiRate * 100));
    }
  }, [isEdit, settingsQuery.data, ppojiTouched]);

  // 길드 기본 수수료율을 드랍템 행에 자동으로 채운다 (직접 건드리기 전까지만)
  useEffect(() => {
    if (isEdit || feePctTouched || !settingsQuery.data) return;
    setDrops((prev) => prev.map((d) => ({ ...d, feePct: defaultFeePct })));
  }, [isEdit, feePctTouched, settingsQuery.data, defaultFeePct]);

  // 편집 진입: 수정 가능 여부 확인 + 대상 id/상태 확정
  useEffect(() => {
    if (!isEdit) return;
    const row = rowQuery.data;
    if (row === undefined) return; // 로딩 중
    if (row === null) {
      toast.error('레이드를 찾을 수 없습니다.');
      navigate('/raids');
      return;
    }
    if (!isRaidEditable(row)) {
      toast.error('발송 완료된 레이드는 수정할 수 없습니다.');
      navigate('/raids');
      return;
    }
    setDraftId(row.id);
    setWasConfirmed(row.status === 'confirmed');
  }, [isEdit, rowQuery.data, navigate]);

  // 편집 진입: 상세로 폼 복원 (1회)
  useEffect(() => {
    if (!isEdit || prefilledRef.current) return;
    const d = detailQuery.data;
    if (!d) return;
    prefilledRef.current = true;
    setBossName(d.bossName);
    setPpojiPct(d.ppojiPct);
    setPpojiTouched(true);
    setRemainderPolicy(d.remainderPolicy);
    setLoadedPartyName(d.partyName);
    setPhaseCount(Math.max(DEFAULT_PHASE_COUNT, d.phaseCount));
    setFeePctTouched(true);
    setExpenses(
      d.expenses.map((e) => ({ id: localId(), category: e.category, name: e.name, cost: e.cost })),
    );
    setDrops(
      d.drops.length > 0
        ? d.drops.map((x) => ({
            id: localId(),
            name: x.name,
            salePrice: x.salePrice,
            feePct: x.feePct,
          }))
        : [{ id: localId(), name: '', salePrice: 0, feePct: 0 }],
    );

    // 길드원/임시 용병을 갈라 담고, 패널티·이탈 페이즈는 각자의 key 로 다시 건다
    const memberIds: string[] = [];
    const restoredGuests: GuestRow[] = [];
    const penaltyEntries: Array<[string, string[]]> = [];
    const exitEntries: Array<[string, number]> = [];
    for (const p of d.participants) {
      let key: string;
      if (p.memberId) {
        key = p.memberId;
        memberIds.push(p.memberId);
      } else {
        const g: GuestRow = { id: guestId(), name: p.guestName ?? '' };
        restoredGuests.push(g);
        key = g.id;
      }
      if (p.penaltyTypeIds.length > 0) penaltyEntries.push([key, [...p.penaltyTypeIds]]);
      if (p.exitPhase != null) exitEntries.push([key, p.exitPhase]);
    }
    setSelected(new Set(memberIds));
    setGuests(restoredGuests);
    setPenaltyBy(Object.fromEntries(penaltyEntries));
    setExitPhaseBy(Object.fromEntries(exitEntries));
  }, [isEdit, detailQuery.data]);

  const members = membersQuery.data ?? [];
  const penaltyTypes = penaltyTypesQuery.data ?? [];
  const penaltyById = useMemo(() => new Map(penaltyTypes.map((p) => [p.id, p])), [penaltyTypes]);

  /** 길드원 → 임시 용병 순. 정산 테이블과 계산 입력이 이 순서를 공유한다 */
  const participantRows = useMemo<ParticipantRow[]>(
    () => [
      ...members
        .filter((m) => selected.has(m.id))
        .map((m) => ({ id: m.id, name: m.nickname, sub: m.job, isGuest: false })),
      ...guests.map((g, i) => ({
        id: g.id,
        name: g.name.trim() || `용병 ${i + 1}`,
        sub: '임시 용병',
        isGuest: true,
      })),
    ],
    [members, selected, guests],
  );

  const participantsInput = useMemo(
    () =>
      participantRows.map((row) => {
        const raw = exitPhaseBy[row.id];
        return {
          id: row.id,
          // 여러 벌금이 붙을 수 있고 금액은 합산된다 (예: 2페 이탈 + 지각)
          penalties: (penaltyBy[row.id] ?? []).flatMap((typeId) => {
            const pt = penaltyById.get(typeId);
            return pt ? [{ calcType: pt.calcType, value: pt.value }] : [];
          }),
          exitPhase: raw == null ? null : Math.min(raw, phaseCount),
        };
      }),
    [participantRows, penaltyBy, penaltyById, exitPhaseBy, phaseCount],
  );

  const expenseTotal = useMemo(() => expenses.reduce((s, e) => s + (e.cost || 0), 0), [expenses]);

  const result = useMemo(
    () =>
      calcSettlement({
        drops: drops.map((d) => ({ salePrice: d.salePrice || 0, feePct: d.feePct || 0 })),
        expenseTotal,
        participants: participantsInput,
        ppojiRate: (ppojiPct || 0) / 100,
      }),
    [drops, expenseTotal, participantsInput, ppojiPct],
  );

  const hasPenalty = result.penaltyPool > 0;
  // 대표값: 패널티도 이탈도 없는 완주자 기준 (없으면 첫 참여자)
  const cleanIdx = participantsInput.findIndex(
    (p) => p.penalties.length === 0 && p.exitPhase == null,
  );
  const finalPerPerson =
    (cleanIdx >= 0 ? result.participants[cleanIdx]?.final : undefined) ??
    result.participants[0]?.final ??
    result.basePerPerson;
  const loading =
    bossesQuery.isLoading ||
    membersQuery.isLoading ||
    settingsQuery.isLoading ||
    (isEdit && (detailQuery.isLoading || rowQuery.isLoading));

  const buildInput = (status: RaidStatus, id?: string): RaidInput => ({
    id,
    bossName,
    partyName: loadedPartyName,
    ppojiPct,
    remainderPolicy,
    phaseCount,
    drops: drops.map((d) => ({ name: d.name, salePrice: d.salePrice, feePct: d.feePct })),
    expenses: expenses.map((e) => ({ category: e.category, name: e.name, cost: e.cost })),
    participants: participantRows.map((row) => ({
      memberId: row.isGuest ? null : row.id,
      guestName: row.isGuest ? row.name : null,
      penaltyTypeIds: penaltyBy[row.id] ?? [],
      exitPhase: exitPhaseBy[row.id] ?? null,
    })),
    netProfit: result.netProfit,
    participantCount: result.participantCount,
    perPerson: finalPerPerson,
    status,
  });

  // 자동 임시저장 — 확정된 건이 아니고, 보스+참여자가 있으면 몇 초 뒤 draft 저장
  const canAutosave = !wasConfirmed && !pending && bossName !== '' && participantRows.length > 0;
  useEffect(() => {
    if (loading || !canAutosave) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const row = await saveRaid(guild.id, buildInput('draft', draftId));
          setDraftId(row.id);
          setLastSavedAt(new Date().toLocaleTimeString('ko-KR'));
          void queryClient.invalidateQueries({ queryKey: ['raids', guild.id] });
        } catch {
          /* 자동저장 실패는 조용히 무시 */
        }
      })();
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bossName,
    selected,
    guests,
    drops,
    expenses,
    ppojiPct,
    penaltyBy,
    exitPhaseBy,
    phaseCount,
    remainderPolicy,
    canAutosave,
    loading,
  ]);

  // ── 핸들러 ────────────────────────────────────────────
  /** 참여자가 빠지면 그 사람에게 걸린 패널티·이탈 페이즈도 같이 지운다 */
  const forgetParticipant = (id: string) => {
    setPenaltyBy((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExitPhaseBy((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleMember = (id: string) => {
    const willRemove = selected.has(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (willRemove) forgetParticipant(id);
  };

  /** 칩 클릭 — 이미 붙어 있으면 떼고, 없으면 붙인다 */
  const togglePenalty = (id: string, typeId: string) =>
    setPenaltyBy((prev) => {
      const current = prev[id] ?? [];
      const nextList = current.includes(typeId)
        ? current.filter((t) => t !== typeId)
        : [...current, typeId];
      const next = { ...prev };
      if (nextList.length > 0) next[id] = nextList;
      else delete next[id];
      return next;
    });

  /** 이탈 시점 선택지가 모자랄 때 그 자리에서 한 페이즈 늘린다 */
  const addPhase = () => {
    if (phaseCount >= MAX_PHASE_COUNT) {
      toast.info(`페이즈는 최대 ${MAX_PHASE_COUNT}까지 늘릴 수 있습니다.`);
      return;
    }
    setPhaseCount((prev) => prev + 1);
    toast.success(`${phaseCount + 1}페가 추가되었습니다.`);
  };

  const setExitPhase = (id: string, phase: string) => {
    // "+ 페이즈 늘리기"는 선택이 아니라 명령 — 선택값은 그대로 두고 선택지만 늘린다
    if (phase === ADD_PHASE_VALUE) {
      addPhase();
      return;
    }
    setExitPhaseBy((prev) => {
      const next = { ...prev };
      if (phase) next[id] = Number(phase);
      else delete next[id];
      return next;
    });
  };

  const addGuest = () => setGuests((prev) => [...prev, { id: guestId(), name: '' }]);
  const updateGuest = (id: string, name: string) =>
    setGuests((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  const removeGuest = (id: string) => {
    setGuests((prev) => prev.filter((g) => g.id !== id));
    forgetParticipant(id);
  };

  const addDrop = () =>
    setDrops((prev) => [
      ...prev,
      // 새 행도 길드 기본 수수료율로 시작 (직거래면 그 행만 0으로 고치면 된다)
      { id: localId(), name: '', salePrice: 0, feePct: prev[prev.length - 1]?.feePct ?? defaultFeePct },
    ]);
  const updateDrop = (id: string, patch: Partial<DropRow>) =>
    setDrops((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const removeDrop = (id: string) =>
    setDrops((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.id !== id)));

  const addExpense = () =>
    setExpenses((prev) => [...prev, { id: localId(), category: 'consumable', name: '', cost: 0 }]);
  const updateExpense = (id: string, patch: Partial<ExpenseRow>) =>
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeExpense = (id: string) => setExpenses((prev) => prev.filter((e) => e.id !== id));

  const copyLast = () => {
    const last = (raidsQuery.data ?? [])[0];
    if (!last) {
      toast.info('복제할 직전 레이드가 없습니다.');
      return;
    }
    setBossName(last.bossName);
    setSelected(new Set(members.map((m) => m.id)));
    setGuests([]);
    setPenaltyBy({});
    setExitPhaseBy({});
    setLoadedPartyName(last.partyName);
    setDrops([{ id: localId(), name: '', salePrice: 0, feePct: defaultFeePct }]);
    setPhaseCount(DEFAULT_PHASE_COUNT);
    toast.success('직전 레이드를 복제했습니다. 판매가만 입력하세요.');
  };

  const applyParty = (partyId: string) => {
    const party = (partiesQuery.data ?? []).find((p) => p.id === partyId);
    if (!party) return;
    const valid = party.memberIds.filter((mid) => members.some((m) => m.id === mid));
    setSelected(new Set(valid));
    setPenaltyBy({});
    setExitPhaseBy({});
    setRemainderPolicy(party.remainderPolicy);
    setLoadedPartyName(party.name);
    toast.success(`${party.name} 공대원 ${valid.length}명을 불러왔습니다.`);
  };

  const save = async (status: RaidStatus) => {
    if (!bossName) {
      toast.warning('보스를 선택해 주세요.');
      return;
    }
    if (participantRows.length === 0) {
      toast.warning('참여 공대원을 1명 이상 선택해 주세요.');
      return;
    }
    if (status === 'confirmed') {
      if (result.totalSales <= 0) {
        toast.warning('드랍템 판매가를 입력해 주세요.');
        return;
      }
      const ok = await confirm.show({
        title: '레이드 확정',
        message: `확정하면 디스코드로 영수증이 발송됩니다. (무료 베타)\n1인당 ${formatMeso(finalPerPerson)} 메소 · ${result.participantCount}명`,
        confirmText: '확정 & 발송',
        type: 'default',
      });
      if (!ok) return;
    }

    setPending(true);
    try {
      await saveRaid(guild.id, buildInput(status, draftId));
      await queryClient.invalidateQueries({ queryKey: ['raids', guild.id] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats', guild.id] });
      toast.success(
        status === 'confirmed' ? '확정되었습니다. 영수증을 발송했습니다.' : '임시저장되었습니다.',
      );
      navigate('/raids');
    } catch {
      toast.error('저장에 실패했습니다.');
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-10">
        <LoadingState message="불러오는 중..." />
      </Card>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          aria-label="뒤로"
          className="text-text-secondary hover:bg-bg-hover rounded-md p-2"
          onClick={() => navigate('/raids')}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-page-title">{isEdit ? '레이드 수정' : '레이드 추가'}</h1>
          <p className="text-text-secondary mt-0.5 text-sm">
            {guild.serverName} · {guild.guildName}
            {lastSavedAt && (
              <span className="text-text-tertiary ml-2">· 자동 임시저장 {lastSavedAt}</span>
            )}
          </p>
        </div>
        {!isEdit && (
          <Button variant="secondary" onClick={copyLast}>
            <Copy className="h-4 w-4" /> 직전 레이드 복제
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 입력 폼 */}
        <div className="space-y-4 lg:col-span-2">
          {/* 기본 정보 */}
          <Card className="space-y-4 p-5">
            <h2 className="text-card-title">기본 정보</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-text-secondary mb-1 block text-sm font-medium">보스</label>
                <Select value={bossName} onChange={(e) => setBossName(e.target.value)}>
                  <option value="">보스 선택</option>
                  {(bossesQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-text-secondary mb-1 block text-sm font-medium">
                  공대장 뽀찌율 (%)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={ppojiPct}
                  onChange={(e) => {
                    setPpojiTouched(true);
                    setPpojiPct(Number(e.target.value) || 0);
                  }}
                />
              </div>
            </div>
          </Card>

          {/* 참여 공대원 (선택) */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-card-title">참여 공대원</h2>
              <span className="text-text-tertiary text-xs">
                분배 인원 {participantRows.length}명
                {guests.length > 0 && ` · 용병 ${guests.length}명 포함`}
              </span>
            </div>
            {(partiesQuery.data ?? []).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-text-secondary shrink-0 text-xs font-medium">공대 불러오기</span>
                <Select
                  className="max-w-xs"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) applyParty(e.target.value);
                  }}
                >
                  <option value="">임시 공대 (직접 선택)</option>
                  {(partiesQuery.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.memberIds.length}명)
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {members.length === 0 ? (
              <p className="text-text-muted py-6 text-center text-sm">
                먼저{' '}
                <button
                  className="text-text-link hover:text-text-link-hover font-medium"
                  onClick={() => navigate('/members')}
                  type="button"
                >
                  길드원
                </button>
                을 등록해 주세요.
              </p>
            ) : (
              <div className="space-y-4">
                {groupMembersByJob(members).map((sec) => (
                  <div key={sec.category}>
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          CATEGORY_DOT[sec.category] ?? 'bg-text-muted',
                        )}
                      />
                      <span className="text-text-secondary text-xs font-semibold">{sec.category}</span>
                      <span className="text-text-muted text-xs">{sec.members.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {sec.members.map((m) => {
                        const on = selected.has(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMember(m.id)}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                              on
                                ? 'border-brand-500 bg-brand-50 text-brand-700'
                                : 'border-border-subtle text-text-secondary hover:bg-bg-hover',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                on
                                  ? 'border-brand-600 bg-brand-600 text-white'
                                  : 'border-border-default',
                              )}
                            >
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
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
            )}

            {/* 임시 용병 — 이번 레이드에만 참여하고 길드원과 똑같이 n빵 */}
            <div className="border-border-subtle mt-2 border-t pt-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <span className="text-text-secondary text-sm font-medium">임시 용병</span>
                  <p className="text-text-tertiary mt-0.5 text-xs">
                    길드원 명단에 남지 않고 이번 레이드만 참여합니다. 분배는 길드원과 동일한 n빵.
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={addGuest}>
                  <UserPlus className="h-4 w-4" /> 용병 추가
                </Button>
              </div>
              {guests.length === 0 ? (
                <p className="text-text-muted text-xs">용병이 없으면 비워 두세요.</p>
              ) : (
                <div className="space-y-2">
                  {guests.map((g, i) => (
                    <div key={g.id} className="flex items-center gap-2">
                      <Input
                        placeholder={`용병 ${i + 1} 닉네임`}
                        value={g.name}
                        onChange={(e) => updateGuest(g.id, e.target.value)}
                        className="flex-1"
                      />
                      <button
                        aria-label="용병 삭제"
                        className="text-text-muted hover:text-error-600 rounded-md p-2"
                        onClick={() => removeGuest(g.id)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* ① 공대 경비 */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-card-title">① 공대 경비</h2>
                <p className="text-text-tertiary mt-0.5 text-xs">
                  이번 레이드에 쓴 돈 전부 · 합계 {formatMeso(result.expenseTotal)} 메소 · 순수익에서
                  차감됩니다
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={addExpense}>
                <Plus className="h-4 w-4" /> 항목 추가
              </Button>
            </div>
            {expenses.length === 0 ? (
              <p className="text-text-muted text-xs">쓴 돈이 없으면 비워 두세요.</p>
            ) : (
              <div className="space-y-2">
                {expenses.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <Select
                      className="w-28 shrink-0"
                      value={e.category}
                      onChange={(ev) =>
                        updateExpense(e.id, { category: ev.target.value as ExpenseCategory })
                      }
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {EXPENSE_CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </Select>
                    <Input
                      placeholder={EXPENSE_CATEGORY_PLACEHOLDER[e.category]}
                      value={e.name}
                      onChange={(ev) => updateExpense(e.id, { name: ev.target.value })}
                      className="flex-1"
                    />
                    <MoneyInput
                      placeholder="금액(메소)"
                      value={e.cost}
                      onChange={(cost) => updateExpense(e.id, { cost })}
                      className="w-40"
                    />
                    <button
                      aria-label="경비 삭제"
                      className="text-text-muted hover:text-error-600 rounded-md p-2"
                      onClick={() => removeExpense(e.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ② 드랍템 & 판매가 */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-card-title">② 드랍템 & 판매가</h2>
                <p className="text-text-tertiary mt-0.5 text-xs">
                  실수익 합계 {formatMeso(result.totalSales)} 메소
                  {result.feeTotal > 0 && (
                    <>
                      {' '}
                      · 판매가 {formatMeso(result.grossSales)} − 수수료{' '}
                      {formatMeso(result.feeTotal)}
                    </>
                  )}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={addDrop}>
                <Plus className="h-4 w-4" /> 드랍템 추가
              </Button>
            </div>
            <div className="space-y-2">
              {drops.map((d) => {
                const fee = Math.floor(
                  (Math.max(0, d.salePrice) * Math.min(Math.max(d.feePct, 0), 100)) / 100,
                );
                return (
                  <div key={d.id} className="flex items-center gap-2">
                    <Input
                      placeholder="드랍템 이름 (예: 이지스)"
                      value={d.name}
                      onChange={(e) => updateDrop(d.id, { name: e.target.value })}
                      className="min-w-0 flex-1"
                    />
                    <MoneyInput
                      placeholder="판매가(메소)"
                      value={d.salePrice}
                      onChange={(salePrice) => updateDrop(d.id, { salePrice })}
                      className="w-36 shrink-0"
                    />
                    <div className="relative w-20 shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        aria-label="판매 수수료 %"
                        className="pr-6 text-right"
                        value={d.feePct}
                        onChange={(e) => {
                          setFeePctTouched(true);
                          updateDrop(d.id, { feePct: Number(e.target.value) || 0 });
                        }}
                      />
                      <span className="text-text-tertiary pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                        %
                      </span>
                    </div>
                    <div className="w-36 shrink-0 text-right">
                      <div className="text-text-primary text-sm font-semibold tabular-nums">
                        {formatMeso(d.salePrice - fee)}
                      </div>
                      {fee > 0 && (
                        <div className="text-text-tertiary text-xs tabular-nums">
                          수수료 −{formatMeso(fee)}
                        </div>
                      )}
                    </div>
                    <button
                      aria-label="드랍템 삭제"
                      className="text-text-muted hover:text-error-600 shrink-0 rounded-md p-2 disabled:opacity-40"
                      onClick={() => removeDrop(d.id)}
                      disabled={drops.length <= 1}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-text-tertiary text-xs">
              수수료는 길드 설정의 기본값({defaultFeePct}%)으로 채워집니다. 직거래처럼 수수료가 없는
              건은 그 행만 0으로 바꾸세요.
            </p>
          </Card>

          {/* ③ 참여자별 정산 */}
          <Card className="space-y-3 p-5">
            <div>
              <h2 className="text-card-title">③ 참여자별 정산</h2>
              <p className="text-text-tertiary mt-0.5 text-xs leading-relaxed">
                <b className="text-text-secondary">이탈 시점</b>은 누가 내 벌금을 받을 자격이 있는지,{' '}
                <b className="text-text-secondary">패널티</b>는 얼마를 깎을지를 정합니다. 둘은
                독립이라 &quot;2페 이탈 + 지각&quot;처럼 여러 개를 같이 걸 수 있고 금액은 합산됩니다.
                걷힌 벌금은 <b className="text-text-secondary">그 사람보다 오래 남은 참여자</b>에게만
                재분배됩니다 — 2페 이탈자는 3페 이탈자의 벌금을 가져갈 수 없고, 같은 페이즈에서
                이탈한 사람끼리도 서로 가져갈 수 없습니다. 완주자의 벌금은 본인을 뺀 전원에게
                나눠집니다. <b className="text-text-secondary">몰수</b>(노쇼 100% 등으로 몫을 전부
                뺏긴 경우) 대상자는 남의 벌금도 받지 않습니다.
              </p>
            </div>
            {participantRows.length === 0 ? (
              <p className="text-text-muted py-6 text-center text-sm">
                위에서 참여 공대원을 먼저 선택하세요.
              </p>
            ) : (
              <div className="divide-border-subtle divide-y">
                {result.participants.map((pr, i) => {
                  const row = participantRows[i];
                  if (!row) return null;
                  const applied = penaltyBy[row.id] ?? [];
                  return (
                    <div key={pr.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      {/* 이름 · 이탈 시점 · 최종 수령 */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="min-w-0 flex-1">
                          <span className="text-text-primary font-medium">{row.name}</span>
                          {row.isGuest ? (
                            <span className="bg-warning-500/10 text-warning-600 ml-1.5 rounded px-1.5 py-0.5 text-xs font-medium">
                              용병
                            </span>
                          ) : (
                            <span className="text-text-tertiary ml-1 text-xs">{row.sub}</span>
                          )}
                        </span>
                        <Select
                          className="w-32 shrink-0"
                          aria-label={`${row.name} 이탈 시점`}
                          value={exitPhaseBy[row.id] ?? ''}
                          onChange={(e) => setExitPhase(row.id, e.target.value)}
                        >
                          <option value="">완주</option>
                          {Array.from({ length: phaseCount }, (_, k) => k + 1).map((ph) => (
                            <option key={ph} value={ph}>
                              {ph}페 이탈
                            </option>
                          ))}
                          <option value={ADD_PHASE_VALUE}>+ 페이즈 늘리기</option>
                        </Select>
                        <span className="w-32 shrink-0 text-right">
                          <span
                            className={cn(
                              'block font-semibold tabular-nums',
                              pr.forfeited ? 'text-error-600' : 'text-text-primary',
                            )}
                          >
                            {pr.forfeited ? '몰수' : formatMeso(pr.final)}
                          </span>
                          {pr.forfeited ? (
                            <span className="text-text-tertiary block text-xs">
                              재분배 수령 없음
                            </span>
                          ) : (
                            (pr.penalty > 0 || pr.redistributed > 0) && (
                              <span className="block text-xs tabular-nums">
                                {pr.penalty > 0 && (
                                  <span className="text-error-600">−{formatMeso(pr.penalty)}</span>
                                )}
                                {pr.redistributed > 0 && (
                                  <span className="text-success-600 ml-1">
                                    +{formatMeso(pr.redistributed)}
                                  </span>
                                )}
                              </span>
                            )
                          )}
                        </span>
                      </div>

                      {/* 패널티 칩 — 여러 개 동시 선택 가능 */}
                      {penaltyTypes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pl-1">
                          <span className="text-text-tertiary mr-1 text-xs">패널티</span>
                          {penaltyTypes.map((pt) => {
                            const on = applied.includes(pt.id);
                            return (
                              <button
                                key={pt.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => togglePenalty(row.id, pt.id)}
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                  on
                                    ? 'border-error-500 bg-error-500/10 text-error-600'
                                    : 'border-border-subtle text-text-tertiary hover:bg-bg-hover',
                                )}
                              >
                                {pt.name}
                                <span className="ml-1 opacity-70">
                                  {pt.calcType === 'percent'
                                    ? `${pt.value}%`
                                    : formatMeso(pt.value)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {penaltyTypes.length === 0 && (
              <p className="text-text-tertiary text-xs">
                패널티 유형은{' '}
                <button
                  className="text-text-link hover:text-text-link-hover font-medium"
                  onClick={() => navigate('/settings')}
                  type="button"
                >
                  길드 설정
                </button>
                에서 추가합니다.
              </p>
            )}
          </Card>
        </div>

        {/* 정산 요약 */}
        <div className="lg:col-span-1">
          <Card className="sticky top-32 p-5">
            <h2 className="text-card-title mb-4">정산 요약</h2>
            <dl className="space-y-2 text-sm">
              <SummaryRow label="총 판매금액" value={result.grossSales} />
              <SummaryRow label="− 판매 수수료" value={-result.feeTotal} muted />
              <SummaryRow label="실수익" value={result.totalSales} strong />
              <SummaryRow label="− 공대 경비" value={-result.expenseTotal} muted />
              <div className="border-border-subtle my-2 border-t" />
              <SummaryRow label="순수익" value={result.netProfit} strong />
              <SummaryRow label={`− 공대장 뽀찌 (${ppojiPct}%)`} value={-result.leaderPpoji} muted />
              <SummaryRow label="분배 대상액" value={result.distributable} strong />
              <div className="border-border-subtle my-2 border-t" />
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">참여 인원</dt>
                <dd className="text-text-primary font-medium">
                  {result.participantCount}명
                  {guests.length > 0 && (
                    <span className="text-text-tertiary ml-1 text-xs">(용병 {guests.length})</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="bg-brand-50 mt-4 rounded-lg p-4 text-center">
              <p className="text-brand-700 text-xs font-medium">1인당 분배금 (완주 기준)</p>
              <p className="text-brand-700 mt-1 text-2xl font-bold tabular-nums">
                {formatMeso(finalPerPerson)}
                <span className="ml-1 text-sm font-normal">메소</span>
              </p>
              {hasPenalty && (
                <p className="text-text-tertiary mt-1 text-xs">
                  패널티·이탈 시점에 따라 개인별 금액이 다릅니다 → <b>③ 참여자별 정산</b> 참고
                </p>
              )}
            </div>

            <div className="mt-3">
              <label className="text-text-tertiary mb-1 block text-xs font-medium">잔돈 처리</label>
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
              <p className="text-text-tertiary mt-1.5 text-xs leading-relaxed">
                메소 단위로 딱 나눠떨어지지 않고 남는 자투리{' '}
                <b className="text-text-secondary">{formatMeso(result.leftover)} 메소</b>가{' '}
                {REMAINDER_POLICY_LABEL[remainderPolicy]}(으)로 처리됩니다.
                {hasPenalty && (
                  <>
                    {' '}
                    패널티로 걷힌{' '}
                    <b className="text-text-secondary">{formatMeso(result.penaltyPool)} 메소</b>는 각
                    벌금마다 수령 자격자에게 나눠집니다.
                  </>
                )}
                {result.orphanedPenalty > 0 && (
                  <>
                    {' '}
                    그중{' '}
                    <b className="text-text-secondary">{formatMeso(result.orphanedPenalty)} 메소</b>는
                    받을 자격자가 없어(모두 같은 시점에 이탈) 잔돈으로 넘어갑니다.
                  </>
                )}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <Button className="w-full" onClick={() => void save('confirmed')} disabled={pending}>
                <Send className="h-4 w-4" /> 확정 & 발송
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => void save('draft')}
                disabled={pending}
              >
                <FileText className="h-4 w-4" /> 임시저장
              </Button>
              <p className="text-text-tertiary text-center text-xs">
                무료 베타 · 입력 중 몇 초마다 자동 임시저장됩니다.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: number;
  muted?: boolean;
  strong?: boolean;
}

function SummaryRow({ label, value, muted, strong }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn(muted ? 'text-text-tertiary' : 'text-text-secondary')}>{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          strong ? 'text-text-primary text-base font-semibold' : 'text-text-primary',
          value < 0 && 'text-text-tertiary',
        )}
      >
        {formatMeso(value)}
      </dd>
    </div>
  );
}
