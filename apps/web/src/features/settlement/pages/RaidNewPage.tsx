import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  Check,
  FileText,
  Send,
  UserPlus,
  HelpCircle,
} from 'lucide-react';
import { useCurrentGuild } from '@/stores/useGuildStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  getMembers,
  getGuildSettings,
  getRaids,
  getParties,
  getPenaltyTypes,
  getSubsidyTypes,
  getRaidDetail,
  getRaid,
  saveRaid,
  isConfirmedRaidError,
  isRaidEditable,
  isRaidMine,
  groupMembersByJob,
  DEFAULT_PHASE_COUNT,
  MAX_PHASE_COUNT,
  type ExpenseCategory,
  type RaidStatus,
  type RaidInput,
  type RemainderPolicy,
} from '@/features/settlement/api';
import { getBosses } from '@/lib/masters';
import { calcSettlement } from '@/features/settlement/settlement';
import { formatMeso, formatMesoCompact } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingState } from '@/components/feedback/LoadingState';
import {
  PenaltyQuickAddDialog,
  SubsidyQuickAddDialog,
} from '@/features/settlement/components/raids/PolicyQuickAddDialog';
import { SettlementRulesDialog } from '@/features/settlement/components/raids/SettlementRulesDialog';
import { ChipScroller } from '@/features/settlement/components/raids/ChipScroller';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { cn } from '@/lib/cn';

/** 이번 레이드에만 참여하는 임시 용병 — 공대원 명단에 남지 않고 n빵에 참여한다 */
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
  /**
   * 이 아이템을 판 사람 (참여자 행 id). 미지정이면 판매 인센티브를 떼지 않는다.
   * 참여자에서 빠진 사람이 남아 있어도 settlement.ts 가 무시한다.
   */
  sellerId: string | null;
  /** 판매 인센티브 % (0~100). 이 행의 실수익(판매가 - 수수료) 기준 */
  incentivePct: number;
}
interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  name: string;
  cost: number;
}

/** 정산 테이블 한 줄 — 공대원과 임시 용병을 같은 모양으로 다룬다 */
interface ParticipantRow {
  id: string;
  name: string;
  sub: string;
  isGuest: boolean;
}

let localSeq = 0;
const localId = (): string => `local_${(localSeq += 1)}`;

/** 드랍템 행 기본값 — 새 행·초기화·복제가 같은 모양에서 시작하도록 한곳에 둔다 */
const emptyDrop = (feePct = 0): DropRow => ({
  id: localId(),
  name: '',
  salePrice: 0,
  feePct,
  sellerId: null,
  incentivePct: 0,
});

let guestSeq = 0;
/** 공대원 id(`m1`…)와 절대 겹치지 않도록 prefix 를 분리 */
const guestId = (): string => `guest_${(guestSeq += 1)}`;

const CATEGORY_DOT: Record<string, string> = {
  전사: 'bg-error-500',
  마법사: 'bg-accent-violet',
  궁수: 'bg-success-500',
  도적: 'bg-text-muted',
  해적: 'bg-warning-500',
};

const AUTOSAVE_MS = 5000;

/**
 * 화면을 벗어나며 흘려보낸 마지막 임시저장.
 *
 * 디바운스가 차기 전에 나가면 그 입력이 통째로 사라지므로 언마운트 때 한 번 더 저장한다.
 * 그런데 그 저장이 끝나기 전에 편집 화면으로 다시 들어오면 저장 직전의 데이터를 읽어
 * 폼에 채우게 된다 — 그래서 컴포넌트가 사라진 뒤에도 살아남는 모듈 스코프에 두고,
 * 상세를 읽기 전에 반드시 이걸 먼저 기다린다.
 */
let pendingFlush: Promise<unknown> | null = null;

async function awaitPendingFlush(): Promise<void> {
  if (!pendingFlush) return;
  try {
    await pendingFlush;
  } catch {
    // 흘려보낸 저장이 실패했어도 읽기는 진행한다. 실패는 다음 자동저장이 다시 알린다.
  } finally {
    pendingFlush = null;
  }
}

/** 이탈 시점 셀렉트의 "+ 페이즈 늘리기" 항목 값 — 실제 페이즈 번호와 겹치지 않게 */
const ADD_PHASE_VALUE = '__add_phase__';

/** 칩 공통 스타일 — 스크롤 영역 안에서 눌려 찌그러지지 않도록 shrink-0 */
const CHIP_BASE =
  'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';

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
  const userId = useAuthStore((s) => s.user?.id ?? null);
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
  const subsidyTypesQuery = useQuery({
    queryKey: ['subsidy-types', guild.id],
    queryFn: () => getSubsidyTypes(guild.id),
  });
  // 편집 폼은 반드시 서버의 현재 값에서 출발해야 한다. 전역 staleTime(30초) 때문에
  // 자동저장 직후 다시 들어오면 캐시가 저장 전 데이터를 그대로 돌려주고, 프리필은
  // 한 번뿐이라(prefilledRef) 뒤늦게 도착한 최신 데이터가 무시된다 —
  // 사용자 눈에는 "임시저장이 안 됐다"로 보인다. 이 두 쿼리만 캐시를 끈다.
  const detailQuery = useQuery({
    queryKey: ['raid-detail', routeId],
    queryFn: async () => {
      await awaitPendingFlush();
      return getRaidDetail(routeId ?? '');
    },
    enabled: isEdit,
    staleTime: 0,
    gcTime: 0,
  });
  const rowQuery = useQuery({
    queryKey: ['raid', guild.id, routeId],
    queryFn: async () => {
      await awaitPendingFlush();
      return getRaid(guild.id, routeId ?? '');
    },
    enabled: isEdit,
    staleTime: 0,
    gcTime: 0,
  });

  const [bossName, setBossName] = useState('');
  // 인센티브를 안 걷는 길드가 많아 0 에서 시작한다 (길드 설정 기본값이 로드되면 덮어씀)
  const [ppojiPct, setPpojiPct] = useState(0);
  const [ppojiTouched, setPpojiTouched] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<GuestRow[]>([]);
  /** 참여자 id → 적용된 패널티 유형 id 목록 (여러 개 가능) */
  const [penaltyBy, setPenaltyBy] = useState<Record<string, string[]>>({});
  /** 참여자 id → 적용된 지원금 유형 id 목록. 직업이 맞으면 자동으로 채워진다 */
  const [subsidyBy, setSubsidyBy] = useState<Record<string, string[]>>({});
  /**
   * 사용자가 직접 켜고 끈 참여자 id. 자동 프리필이 수동 조작을 덮어쓰지 않게 막는다
   * (안 그러면 칩을 꺼도 다음 렌더에서 되살아난다).
   */
  const subsidyTouchedRef = useRef<Set<string>>(new Set());
  const [exitPhaseBy, setExitPhaseBy] = useState<Record<string, number>>({});
  /** 이탈 시점 셀렉트에 그릴 페이즈 개수. 모자라면 그 자리에서 늘린다 */
  const [phaseCount, setPhaseCount] = useState(DEFAULT_PHASE_COUNT);
  const [feePctTouched, setFeePctTouched] = useState(false);
  const [drops, setDrops] = useState<DropRow[]>([emptyDrop()]);
  const [remainderPolicy, setRemainderPolicy] = useState<RemainderPolicy>('fund');
  const [loadedPartyName, setLoadedPartyName] = useState<string | null>(null);
  /**
   * 인센티브를 받을 공대장 (참여자 행 id). 공대를 불러오면 그 공대의 공대장이 자동으로 잡힌다.
   * 지정되지 않으면 인센티브를 아예 떼지 않는다 — settlement.ts 참고.
   */
  const [leaderRowId, setLeaderRowId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [wasConfirmed, setWasConfirmed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  // 자동저장이 조용히 실패하면 사용자는 "임시저장이 안 된다" 고만 느낀다. 헤더에 표시한다.
  // 이유까지 같이 들고 있어야 한다. save_raid 는 어떤 오류든 400 하나로만 돌아오기 때문에,
  // 메시지를 버리면 왜 실패했는지 알아낼 방법이 화면에 남지 않는다.
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  /** 자동저장이 겹쳐 돌면 같은 레이드를 두 트랜잭션이 동시에 지우고 다시 넣는다 */
  const autosavingRef = useRef(false);
  /** 저장이 겹쳐 미뤄졌을 때 타이머를 다시 걸기 위한 트리거 (값 자체는 의미 없음) */
  const [autosaveTick, setAutosaveTick] = useState(0);
  /** 아직 서버에 반영되지 않은 변경이 있는지 — 언마운트 시 흘려보낼지 판단한다 */
  const dirtyRef = useRef(false);
  /** 언마운트 정리 함수가 볼 "지금 값"들. 정리 함수의 클로저는 옛 값을 붙잡고 있다 */
  const buildInputRef = useRef<(status: RaidStatus, id?: string) => RaidInput>(
    () => ({}) as RaidInput,
  );
  const draftIdRef = useRef<string | undefined>(undefined);
  const canAutosaveRef = useRef(false);
  const [pending, setPending] = useState(false);
  /** ③ 참여자별 정산 카드에서 여는 팝업들 (규칙 설명 · 정책 유형 즉석 추가) */
  const [rulesOpen, setRulesOpen] = useState(false);
  const [penaltyDialogOpen, setPenaltyDialogOpen] = useState(false);
  const [subsidyDialogOpen, setSubsidyDialogOpen] = useState(false);
  const prefilledRef = useRef(false);

  const defaultFeePct = settingsQuery.data?.defaultFeePct ?? 0;

  // 길드 기본 인센티브율 (신규 · 미변경 시)
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
      toast.error('확정된 레이드는 수정할 수 없습니다.');
      navigate('/raids');
      return;
    }
    // 목록에서 버튼을 잠가 두지만 주소로 직접 들어올 수 있어 여기서도 막는다.
    // 서버(save_raid)가 최종 판정을 하므로 이건 헛수고를 줄이기 위한 안내다.
    if (!isRaidMine(row, userId, guild.myRole)) {
      toast.error(`${row.createdByName ?? '다른 공대원'} 님이 만든 정산은 수정할 수 없습니다.`);
      navigate('/raids');
      return;
    }
    setDraftId(row.id);
    setWasConfirmed(row.status === 'confirmed');
  }, [isEdit, rowQuery.data, navigate, userId, guild.myRole]);

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
    // 공대원/임시 용병을 갈라 담고, 패널티·이탈 페이즈는 각자의 key 로 다시 건다
    const memberIds: string[] = [];
    const restoredGuests: GuestRow[] = [];
    const penaltyEntries: Array<[string, string[]]> = [];
    const subsidyEntries: Array<[string, string[]]> = [];
    const exitEntries: Array<[string, number]> = [];
    /** 용병 판매자를 되살리기 위한 이름 → 새 행 id. 용병 행 id 는 매번 새로 만들어진다 */
    const guestRowIdByName = new Map<string, string>();
    let restoredLeader: string | null = null;
    for (const p of d.participants) {
      let key: string;
      if (p.memberId) {
        key = p.memberId;
        memberIds.push(p.memberId);
      } else {
        const g: GuestRow = { id: guestId(), name: p.guestName ?? '' };
        restoredGuests.push(g);
        guestRowIdByName.set(g.name, g.id);
        key = g.id;
      }
      if (p.isLeader) restoredLeader = key;
      if (p.penaltyTypeIds.length > 0) penaltyEntries.push([key, [...p.penaltyTypeIds]]);
      if (p.subsidyTypeIds.length > 0) subsidyEntries.push([key, [...p.subsidyTypeIds]]);
      if (p.exitPhase != null) exitEntries.push([key, p.exitPhase]);
      // 저장된 값이 곧 사용자의 결정이다. 자동 프리필이 덮어쓰지 않게 전원 touched 처리
      subsidyTouchedRef.current.add(key);
    }
    setSelected(new Set(memberIds));
    setGuests(restoredGuests);
    setPenaltyBy(Object.fromEntries(penaltyEntries));
    setSubsidyBy(Object.fromEntries(subsidyEntries));
    setExitPhaseBy(Object.fromEntries(exitEntries));
    setLeaderRowId(restoredLeader);

    // 드랍템은 참여자를 다 훑은 뒤에 복원한다. 판매자가 용병이면 이름밖에 저장돼 있지
    // 않아서, 위에서 새로 만든 용병 행 id 로 바꿔 줘야 셀렉트가 그 사람을 가리킨다.
    setDrops(
      d.drops.length > 0
        ? d.drops.map((x) => ({
            id: localId(),
            name: x.name,
            salePrice: x.salePrice,
            feePct: x.feePct,
            sellerId:
              x.sellerMemberId ??
              (x.sellerGuestName != null
                ? (guestRowIdByName.get(x.sellerGuestName) ?? null)
                : null),
            incentivePct: x.incentivePct,
          }))
        : [emptyDrop()],
    );
  }, [isEdit, detailQuery.data]);

  const members = membersQuery.data ?? [];
  const penaltyTypes = penaltyTypesQuery.data ?? [];
  const penaltyById = useMemo(() => new Map(penaltyTypes.map((p) => [p.id, p])), [penaltyTypes]);
  const subsidyTypes = useMemo(() => subsidyTypesQuery.data ?? [], [subsidyTypesQuery.data]);
  const subsidyById = useMemo(() => new Map(subsidyTypes.map((s) => [s.id, s])), [subsidyTypes]);

  /**
   * 직업이 맞는 공대원에게 지원금 칩을 자동으로 켠다. 손대지 않은 참여자만 대상이라
   * 사용자가 끈 칩은 그대로 꺼진 채 남는다. 용병은 직업 정보가 없어 수동 전용.
   */
  useEffect(() => {
    if (subsidyTypes.length === 0) return;
    setSubsidyBy((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of members) {
        if (!selected.has(m.id) || subsidyTouchedRef.current.has(m.id)) continue;
        const auto = subsidyTypes.filter((s) => s.job === m.job).map((s) => s.id);
        const current = next[m.id] ?? [];
        if (auto.length === current.length && auto.every((id, i) => current[i] === id)) continue;
        if (auto.length > 0) next[m.id] = auto;
        else delete next[m.id];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [members, selected, subsidyTypes]);

  /** 공대원 → 임시 용병 순. 정산 테이블과 계산 입력이 이 순서를 공유한다 */
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
          subsidies: (subsidyBy[row.id] ?? []).flatMap((typeId) => {
            const st = subsidyById.get(typeId);
            return st ? [{ calcType: st.calcType, value: st.amount }] : [];
          }),
          exitPhase: raw == null ? null : Math.min(raw, phaseCount),
          isLeader: row.id === leaderRowId,
        };
      }),
    [
      participantRows,
      penaltyBy,
      penaltyById,
      subsidyBy,
      subsidyById,
      exitPhaseBy,
      phaseCount,
      leaderRowId,
    ],
  );

  const expenseTotal = useMemo(() => expenses.reduce((s, e) => s + (e.cost || 0), 0), [expenses]);

  const result = useMemo(
    () =>
      calcSettlement({
        drops: drops.map((d) => ({
          salePrice: d.salePrice || 0,
          feePct: d.feePct || 0,
          sellerId: d.sellerId,
          incentivePct: d.incentivePct || 0,
        })),
        expenseTotal,
        participants: participantsInput,
        ppojiRate: (ppojiPct || 0) / 100,
      }),
    [drops, expenseTotal, participantsInput, ppojiPct],
  );

  const hasPenalty = result.penaltyPool > 0;
  // 대표값 계산은 settlement.ts 가 갖는다. 화면에서 따로 고르면 저장되는 per_person
  // 과 어긋나고, 인센티브 같은 항목이 늘 때마다 제외 조건을 두 곳에서 맞춰야 한다.
  const finalPerPerson = result.representativePerPerson;
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
    drops: drops.map((d) => {
      // 화면은 참여자 행 id 하나로 다루지만 저장은 길드원/용병으로 갈라야 한다.
      // 참여자에서 빠진 사람이 남아 있으면 판매자 없이 저장한다 — 줄 사람이 없는 몫이다.
      const seller = participantRows.find((p) => p.id === d.sellerId);
      return {
        name: d.name,
        salePrice: d.salePrice,
        feePct: d.feePct,
        sellerMemberId: seller && !seller.isGuest ? seller.id : null,
        sellerGuestName: seller?.isGuest ? seller.name : null,
        incentivePct: d.incentivePct,
      };
    }),
    expenses: expenses.map((e) => ({ category: e.category, name: e.name, cost: e.cost })),
    participants: participantRows.map((row) => ({
      memberId: row.isGuest ? null : row.id,
      guestName: row.isGuest ? row.name : null,
      penaltyTypeIds: penaltyBy[row.id] ?? [],
      subsidyTypeIds: subsidyBy[row.id] ?? [],
      exitPhase: exitPhaseBy[row.id] ?? null,
      isLeader: row.id === leaderRowId,
    })),
    netProfit: result.netProfit,
    participantCount: result.participantCount,
    perPerson: finalPerPerson,
    status,
  });

  // 자동 임시저장 — 확정된 건이 아니고, 보스+참여자가 있으면 몇 초 뒤 draft 저장
  const canAutosave = !wasConfirmed && !pending && bossName !== '' && participantRows.length > 0;

  // 언마운트 시점에 최신 값이 필요한데 정리 함수는 그때의 클로저를 볼 수 없다.
  // 렌더마다 ref 를 갱신해 "지금 값"을 들고 있게 한다.
  buildInputRef.current = buildInput;
  draftIdRef.current = draftId;
  canAutosaveRef.current = canAutosave;

  useEffect(() => {
    if (loading || !canAutosave) return;
    // 입력이 바뀔 때마다 이 effect 가 다시 돈다 = 아직 저장되지 않은 변경이 있다는 뜻
    dirtyRef.current = true;
    const timer = setTimeout(() => {
      // 앞선 저장이 아직 안 끝났으면 미룬다. save_raid 는 참여자를 통째로 지우고
      // 다시 넣기 때문에, 같은 레이드에 두 번이 겹치면 중복 행이나 교착이 생긴다.
      // 다만 그냥 버리면 그 사이의 입력이 영영 저장되지 않는다 — 반드시 다시 예약한다.
      if (autosavingRef.current) {
        setAutosaveTick((t) => t + 1);
        return;
      }
      autosavingRef.current = true;
      void (async () => {
        try {
          const row = await saveRaid(guild.id, buildInput('draft', draftId));
          setDraftId(row.id);
          setLastSavedAt(new Date().toLocaleTimeString('ko-KR'));
          setAutosaveError(null);
          dirtyRef.current = false;
          void queryClient.invalidateQueries({ queryKey: ['raids', guild.id] });
          // 편집 화면을 다시 열 때 이 저장분이 보여야 한다. 목록만 무효화하면
          // 상세 캐시에 저장 전 데이터가 남아 폼이 옛 값으로 복원된다.
          void queryClient.invalidateQueries({ queryKey: ['raid-detail', row.id] });
          void queryClient.invalidateQueries({ queryKey: ['raid', guild.id, row.id] });
        } catch (error: unknown) {
          // 이미 확정된 레이드면 재시도해도 영원히 400 이다. 자동저장을 끊는다.
          if (isConfirmedRaidError(error)) {
            setWasConfirmed(true);
            setAutosaveError('이미 확정된 정산이라 자동 임시저장을 멈췄습니다');
            return;
          }
          // 토스트로 반복해 띄우면 입력 중 방해가 되므로 헤더 표시로만 알린다.
          // 다만 이유는 반드시 남긴다 — 없으면 400 밖에 안 보인다.
          setAutosaveError(error instanceof Error ? error.message : '알 수 없는 오류');
        } finally {
          autosavingRef.current = false;
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
    subsidyBy,
    exitPhaseBy,
    phaseCount,
    remainderPolicy,
    // 공대장만 바꾸면 인센티브 수령자가 달라져 정산이 통째로 바뀐다.
    // 여기 빠져 있어서 그 변경만으로는 자동저장이 걸리지 않았다.
    leaderRowId,
    // 저장이 겹쳐 미뤄졌을 때 다시 예약하기 위한 트리거
    autosaveTick,
    canAutosave,
    loading,
  ]);

  /**
   * 화면을 벗어날 때의 마지막 저장.
   *
   * 자동저장은 5초 디바운스라, 고치고 바로 목록으로 나가면 타이머가 취소되어 그 입력이
   * 사라진다. 남은 변경이 있으면 흘려보내고, 다시 들어올 때 상세 조회가 이 저장을
   * 기다리도록 pendingFlush 에 걸어 둔다(위 awaitPendingFlush).
   */
  useEffect(() => {
    return () => {
      if (!dirtyRef.current || !canAutosaveRef.current) return;
      dirtyRef.current = false;
      pendingFlush = saveRaid(guild.id, buildInputRef.current('draft', draftIdRef.current));
      // 여기서 잡지 않으면 처리되지 않은 rejection 이 된다. 실제 처리는 awaitPendingFlush.
      void pendingFlush.catch(() => {});
    };
  }, [guild.id]);

  // ── 핸들러 ────────────────────────────────────────────
  /** 참여자가 빠지면 그 사람에게 걸린 패널티·이탈 페이즈도 같이 지운다 */
  const forgetParticipant = (id: string) => {
    setPenaltyBy((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSubsidyBy((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // 다시 넣으면 직업 기준으로 새로 프리필돼야 하므로 수동 조작 이력도 지운다
    subsidyTouchedRef.current.delete(id);
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

  /** 지원금 칩 — 한 번이라도 누르면 그 참여자는 자동 프리필 대상에서 빠진다 */
  const toggleSubsidy = (id: string, typeId: string) => {
    subsidyTouchedRef.current.add(id);
    setSubsidyBy((prev) => {
      const current = prev[id] ?? [];
      const nextList = current.includes(typeId)
        ? current.filter((t) => t !== typeId)
        : [...current, typeId];
      const next = { ...prev };
      if (nextList.length > 0) next[id] = nextList;
      else delete next[id];
      return next;
    });
  };

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
      emptyDrop(prev[prev.length - 1]?.feePct ?? defaultFeePct),
    ]);
  const updateDrop = (id: string, patch: Partial<DropRow>) =>
    setDrops((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const removeDrop = (id: string) =>
    setDrops((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.id !== id)));

  // 유형 선택 UI 를 뺐으므로 전부 '기타'로 저장한다. 컬럼은 그대로 두어
  // 기존 레이드(소모품/입장료)의 표시와 DB 스키마는 건드리지 않는다.
  const addExpense = () =>
    setExpenses((prev) => [...prev, { id: localId(), category: 'etc', name: '', cost: 0 }]);
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
    // 지원금은 비우고 touched 도 초기화 → 직업 기준으로 다시 프리필된다
    setSubsidyBy({});
    subsidyTouchedRef.current.clear();
    setExitPhaseBy({});
    setLeaderRowId(null);
    setLoadedPartyName(last.partyName);
    setDrops([emptyDrop(defaultFeePct)]);
    setPhaseCount(DEFAULT_PHASE_COUNT);
    toast.success('직전 레이드를 복제했습니다. 판매가만 입력하세요.');
  };

  const applyParty = (partyId: string) => {
    const party = (partiesQuery.data ?? []).find((p) => p.id === partyId);
    if (!party) return;
    const valid = party.memberIds.filter((mid) => members.some((m) => m.id === mid));
    setSelected(new Set(valid));
    setPenaltyBy({});
    setSubsidyBy({});
    subsidyTouchedRef.current.clear();
    setExitPhaseBy({});
    setRemainderPolicy(party.remainderPolicy);
    setLoadedPartyName(party.name);
    // 공대에 지정된 공대장을 인센티브 수령자로 잡는다. 명단에 없으면 비워 둔다.
    setLeaderRowId(valid.includes(party.leaderId) ? party.leaderId : null);
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
    // 이 저장이 폼 전체를 반영하므로 언마운트 flush 가 다시 쏠 이유가 없다.
    // 특히 확정 뒤에는 save_raid 가 CONFIRMED 를 거부하므로 400 만 하나 더 날아간다.
    dirtyRef.current = false;
    try {
      const saved = await saveRaid(guild.id, buildInput(status, draftId));
      // 확정이 끝난 순간 자동저장을 끈다. 이 아래(무효화·토스트·이동)에서 뭐라도 실패해
      // 화면에 머무르게 되면, 이미 CONFIRMED 가 된 레이드에 자동저장이 계속 달라붙는다.
      if (status === 'confirmed') setWasConfirmed(true);
      await queryClient.invalidateQueries({ queryKey: ['raids', guild.id] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats', guild.id] });
      // 발송 실패는 확정을 되돌리지 않는다. 그래도 조용히 넘어가면 사용자는 영수증이
      // 나간 줄 알고 화면을 뜬다. 저장된 sent 를 보고 사실대로 알린다.
      if (status !== 'confirmed') {
        toast.success('임시저장되었습니다.');
      } else if (saved.sent) {
        toast.success('확정되었습니다. 디스코드로 영수증을 발송했습니다.');
      } else {
        toast.warning(
          '확정되었습니다. 다만 디스코드 발송에 실패했습니다 — 웹훅 URL이 아직 없을 수 있습니다. 레이드 목록에서 재발송하면 원인과 조치를 안내합니다.',
        );
      }
      navigate('/raids');
    } catch (e) {
      // 사유를 삼키면 사용자는 "안 된다" 고만 하고 원인을 좁힐 수 없다. RPC 메시지를 붙인다.
      const detail = e instanceof Error ? e.message : '';
      toast.error(detail ? `저장에 실패했습니다. (${detail})` : '저장에 실패했습니다.');
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
            {autosaveError ? (
              <span className="text-error-600 ml-2">
                · 자동 임시저장 실패 — {autosaveError} ([임시저장]을 눌러 주세요)
              </span>
            ) : (
              lastSavedAt && (
                <span className="text-text-tertiary ml-2">· 자동 임시저장 {lastSavedAt}</span>
              )
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
                  공대장 인센티브율 (%)
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

            {/* 인센티브를 실제로 받을 사람. 미지정이면 인센티브를 떼지 않는다. */}
            <div className="mt-4">
              <label className="text-text-secondary mb-1 block text-sm font-medium">
                공대장 (인센티브 수령자)
              </label>
              <Select
                value={leaderRowId ?? ''}
                onChange={(e) => setLeaderRowId(e.target.value || null)}
              >
                <option value="">지정 안 함 — 인센티브를 떼지 않습니다</option>
                {participantRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.isGuest ? ' (용병)' : ''}
                  </option>
                ))}
              </Select>
              {ppojiPct > 0 && !leaderRowId && (
                <p className="text-warning-600 mt-1.5 text-xs">
                  인센티브율이 {ppojiPct}% 로 설정돼 있지만 받을 사람이 없어 적용되지 않습니다.
                </p>
              )}
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
                <span className="text-text-secondary shrink-0 text-xs font-medium">
                  공대 불러오기
                </span>
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
                  공대원
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
                      <span className="text-text-secondary text-xs font-semibold">
                        {sec.category}
                      </span>
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

            {/* 임시 용병 — 이번 레이드에만 참여하고 공대원과 똑같이 n빵 */}
            <div className="border-border-subtle mt-2 border-t pt-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <span className="text-text-secondary text-sm font-medium">임시 용병</span>
                  <p className="text-text-tertiary mt-0.5 text-xs">
                    공대원 명단에 남지 않고 이번 레이드만 참여합니다. 분배는 공대원과 동일한 n빵.
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
                  이번 레이드에 쓴 돈 전부 · 합계 {formatMeso(result.expenseTotal)} 메소 ·
                  순수익에서 차감됩니다
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
                    <Input
                      placeholder="예: 엘릭서 100개 / 입장권 6장"
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
            {/* 판매자 줄이 생기면서 한 아이템이 두 줄이 됐다. 구분선만으로는 어디까지가
                같은 아이템인지 흐려져서, 아이템마다 테두리 있는 카드로 감싼다. */}
            <div className="space-y-2.5">
              {drops.map((d, di) => {
                const fee = Math.floor(
                  (Math.max(0, d.salePrice) * Math.min(Math.max(d.feePct, 0), 100)) / 100,
                );
                // 비례 축소까지 반영된 실제 지급액. %로 다시 계산하면 합계와 어긋난다.
                const saleIncentive = result.dropSaleIncentives[di] ?? 0;
                const sellerMissing =
                  d.sellerId !== null && !participantRows.some((p) => p.id === d.sellerId);
                return (
                  <div
                    key={d.id}
                    className="border-border-subtle bg-bg-muted/40 space-y-2 rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2">
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

                    {/* 판매 인센티브 — 이 아이템을 대신 팔아준 사람에게 주는 수고비.
                      아이템마다 사람과 요율이 다를 수 있어 그 아이템 카드 안에 둔다.
                      위 구분선으로 "이 아이템에 딸린 설정"임을 드러낸다. */}
                    <div className="border-border-subtle flex flex-wrap items-center gap-2 border-t pt-2">
                      <span className="text-text-tertiary shrink-0 text-xs">판매자</span>
                      <Select
                        className="w-40 shrink-0"
                        aria-label={`${d.name || '드랍템'} 판매자`}
                        value={sellerMissing ? '' : (d.sellerId ?? '')}
                        onChange={(e) =>
                          updateDrop(d.id, {
                            sellerId: e.target.value === '' ? null : e.target.value,
                          })
                        }
                      >
                        <option value="">지정 안 함</option>
                        {participantRows.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <span className="text-text-tertiary shrink-0 text-xs">인센티브</span>
                      <div className="relative w-20 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          aria-label="판매 인센티브 %"
                          className="pr-6 text-right"
                          disabled={d.sellerId === null}
                          value={d.incentivePct}
                          onChange={(e) =>
                            updateDrop(d.id, { incentivePct: Number(e.target.value) || 0 })
                          }
                        />
                        <span className="text-text-tertiary pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                          %
                        </span>
                      </div>
                      {saleIncentive > 0 && (
                        <span className="text-warning-600 text-xs font-medium tabular-nums">
                          −{formatMeso(saleIncentive)}
                        </span>
                      )}
                      {/* 참여자에서 빠졌는데 판매자로 남아 있으면 줄 사람이 없어 미지급된다.
                        조용히 0 이 되면 순수익이 왜 늘었는지 알 수 없으므로 알려 준다. */}
                      {sellerMissing && (
                        <span className="text-error-600 text-xs">
                          판매자가 참여자 명단에 없어 지급되지 않습니다
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-text-tertiary text-xs">
              수수료는 길드 설정의 기본값({defaultFeePct}%)으로 채워집니다. 직거래처럼 수수료가 없는
              건은 그 행만 0으로 바꾸세요. 판매 인센티브는 그 행의 실수익(판매가−수수료) 기준이며
              순수익에서 먼저 빠집니다.
            </p>
          </Card>

          {/* ③ 참여자별 정산 */}
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-card-title">③ 참여자별 정산</h2>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setRulesOpen(true)}>
                  <HelpCircle className="h-4 w-4" /> 정산 규칙
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPenaltyDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> 패널티 유형
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSubsidyDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> 지원금 유형
                </Button>
              </div>
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
                              pr.forfeited && pr.final <= 0
                                ? 'text-error-600'
                                : 'text-text-primary',
                            )}
                          >
                            {/* 몰수라도 판매 인센티브가 있으면 받는 돈이 있다.
                                "몰수" 로만 적으면 실제 지급액과 어긋난다. */}
                            {pr.forfeited && pr.final <= 0 ? '몰수' : formatMeso(pr.final)}
                          </span>
                          {pr.forfeited && (
                            <span className="text-error-600 block text-xs">
                              몰수 ·{' '}
                              {(subsidyBy[row.id] ?? []).length > 0 ? '재분배·지원금' : '재분배'}{' '}
                              수령 없음
                            </span>
                          )}
                        </span>
                      </div>

                      {/* 금액 내역 — 이름 줄의 좁은 칸에 넣으면 항목이 늘 때마다 찌그러진다.
                          한 줄을 통째로 내주고 오른쪽 정렬해 최종액 아래에 붙어 보이게 한다. */}
                      {(pr.penalty > 0 ||
                        pr.redistributed > 0 ||
                        pr.subsidy > 0 ||
                        pr.incentive > 0 ||
                        pr.saleIncentive > 0 ||
                        pr.leftoverShare > 0) && (
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs tabular-nums">
                          {/* 공대장 금액이 왜 큰지 여기서 설명돼야 한다 */}
                          {pr.incentive > 0 && (
                            <span className="text-warning-600">
                              공대장 인센 +{formatMeso(pr.incentive)}
                            </span>
                          )}
                          {pr.saleIncentive > 0 && (
                            <span className="text-warning-600">
                              판매 인센 +{formatMeso(pr.saleIncentive)}
                            </span>
                          )}
                          {pr.subsidy > 0 && (
                            <span className="text-brand-600">지원금 +{formatMeso(pr.subsidy)}</span>
                          )}
                          {pr.penalty > 0 && (
                            <span className="text-error-600">패널티 −{formatMeso(pr.penalty)}</span>
                          )}
                          {pr.redistributed > 0 && (
                            <span className="text-success-600">
                              재분배 +{formatMeso(pr.redistributed)}
                            </span>
                          )}
                          {pr.leftoverShare > 0 && (
                            <span className="text-text-tertiary">
                              잔돈 +{formatMeso(pr.leftoverShare)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 패널티 칩 — 여러 개 동시 선택 가능 */}
                      {penaltyTypes.length > 0 && (
                        <div className="flex items-center gap-1.5 pl-1">
                          <span className="text-text-tertiary mr-1 shrink-0 text-xs">패널티</span>
                          <ChipScroller>
                            {penaltyTypes.map((pt) => {
                              const on = applied.includes(pt.id);
                              return (
                                <button
                                  key={pt.id}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => togglePenalty(row.id, pt.id)}
                                  className={cn(
                                    CHIP_BASE,
                                    on
                                      ? 'border-error-500 bg-error-500/10 text-error-600'
                                      : 'border-border-subtle text-text-tertiary hover:bg-bg-hover',
                                  )}
                                >
                                  {pt.name}
                                  {/* 칩은 좁으니 만 단위로 줄여 쓴다 — 입력·저장은 그대로 메소 */}
                                  <span className="ml-1 opacity-70">
                                    {pt.calcType === 'percent'
                                      ? `${pt.value}%`
                                      : formatMesoCompact(pt.value)}
                                  </span>
                                </button>
                              );
                            })}
                          </ChipScroller>
                        </div>
                      )}

                      {/* 역할 지원금 칩 — 직업이 맞으면 자동으로 켜진 채 시작한다 */}
                      {subsidyTypes.length > 0 && (
                        <div className="flex items-center gap-1.5 pl-1">
                          <span className="text-text-tertiary mr-1 shrink-0 text-xs">지원금</span>
                          {/* 유형이 늘어도 줄바꿈으로 카드가 길어지지 않게 가로로만 흐르게 한다 */}
                          <ChipScroller>
                            {subsidyTypes.map((st) => {
                              const on = (subsidyBy[row.id] ?? []).includes(st.id);
                              return (
                                <button
                                  key={st.id}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggleSubsidy(row.id, st.id)}
                                  className={cn(
                                    CHIP_BASE,
                                    on
                                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                                      : 'border-border-subtle text-text-tertiary hover:bg-bg-hover',
                                  )}
                                >
                                  {st.name}
                                  <span className="ml-1 opacity-70">
                                    {st.calcType === 'percent'
                                      ? `+${st.amount}%`
                                      : `+${formatMesoCompact(st.amount)}`}
                                  </span>
                                </button>
                              );
                            })}
                          </ChipScroller>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {penaltyTypes.length === 0 && (
              <p className="text-text-tertiary text-xs">
                등록된 패널티 유형이 없습니다. 위 <b className="text-text-secondary">패널티 유형</b>{' '}
                버튼으로 여기서 바로 추가하거나,{' '}
                <button
                  className="text-text-link hover:text-text-link-hover font-medium"
                  onClick={() => navigate('/settings')}
                  type="button"
                >
                  길드 설정
                </button>
                에서 관리하세요.
              </p>
            )}
          </Card>

          {/* ③ 카드에서 여는 팝업들 */}
          <SettlementRulesDialog isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />
          <PenaltyQuickAddDialog
            guildId={guild.id}
            isOpen={penaltyDialogOpen}
            onClose={() => setPenaltyDialogOpen(false)}
          />
          <SubsidyQuickAddDialog
            guildId={guild.id}
            isOpen={subsidyDialogOpen}
            onClose={() => setSubsidyDialogOpen(false)}
          />
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
              {/* 판매 인센티브는 공대장 인센티브보다 먼저 뗀다 — settlement.ts 참고.
                  안 쓰는 길드가 대부분이라 0 이면 줄을 만들지 않는다. */}
              {result.saleIncentiveTotal > 0 && (
                <>
                  <SummaryRow label="− 판매 인센티브" value={-result.saleIncentiveTotal} muted />
                  <SummaryRow label="판매 후 이익" value={result.netAfterSaleIncentive} strong />
                </>
              )}
              <SummaryRow
                label={`− 공대장 인센티브 (${ppojiPct}%)`}
                value={-result.leaderPpoji}
                muted
              />
              <SummaryRow label="분배 대상액" value={result.distributable} strong />
              {result.subsidyTotal > 0 && (
                <>
                  <SummaryRow label="− 역할 지원금" value={-result.subsidyTotal} muted />
                  <SummaryRow label="n빵 대상액" value={result.distributableAfterSubsidy} strong />
                </>
              )}
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
              {(hasPenalty || result.subsidyTotal > 0 || result.leaderPpoji > 0) && (
                <p className="text-text-tertiary mt-1 text-xs">
                  {result.leaderPpoji > 0
                    ? '공대장 인센티브·패널티·이탈 시점·역할 지원금을 뺀 기준값입니다. 공대장은 여기에 인센티브가 더해집니다 → '
                    : '패널티·이탈 시점·역할 지원금에 따라 개인별 금액이 다릅니다 → '}
                  <b>③ 참여자별 정산</b> 참고
                </p>
              )}
            </div>

            {result.saleIncentiveCapped && (
              <div className="bg-warning-500/10 text-warning-600 mt-3 rounded-lg p-3 text-xs leading-relaxed">
                판매 인센티브 합계가 순수익({formatMeso(result.netProfit)} 메소)을 넘어{' '}
                <b>비례 축소</b>되었습니다. 공대 경비가 판매금액에 비해 크거나 인센티브율이
                높습니다.
              </div>
            )}

            {result.subsidyCapped && (
              <div className="bg-warning-500/10 text-warning-600 mt-3 rounded-lg p-3 text-xs leading-relaxed">
                역할 지원금 합계가 분배 대상액(
                {formatMeso(result.distributable)} 메소)을 넘어 <b>비례 축소</b>되었습니다. 판매가를
                확인하거나 지원금 칩을 조정해 주세요.
              </div>
            )}

            <div className="mt-3">
              <p className="text-text-tertiary text-xs leading-relaxed">
                남는 돈은 따로 빼두지 않고{' '}
                <b className="text-text-secondary">참여자에게 다시 n빵</b>
                합니다. (몰수 대상자 제외)
                {hasPenalty && (
                  <>
                    {' '}
                    패널티로 걷힌{' '}
                    <b className="text-text-secondary">{formatMeso(result.penaltyPool)} 메소</b>는
                    각 벌금마다 수령 자격자에게 나눠집니다.
                  </>
                )}
                {result.orphanedPenalty > 0 && (
                  <>
                    {' '}
                    그중{' '}
                    <b className="text-text-secondary">{formatMeso(result.orphanedPenalty)} 메소</b>
                    는 받을 자격자가 없어(모두 같은 시점에 이탈) 참여자 전원에게 되돌아갑니다.
                  </>
                )}
                {result.forfeitedSubsidy > 0 && (
                  <>
                    {' '}
                    몰수 대상자에게 배정됐던 지원금{' '}
                    <b className="text-text-secondary">
                      {formatMeso(result.forfeitedSubsidy)} 메소
                    </b>
                    도 마찬가지로 되돌아갑니다.
                  </>
                )}
                {result.leftover > 0 && (
                  <>
                    {' '}
                    끝전 <b className="text-text-secondary">{formatMeso(result.leftover)} 메소</b>는
                    나눠떨어지지 않아 남습니다. (공대장을 지정하면 공대장 몫)
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
